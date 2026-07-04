// Núcleo de la pasarela de pagos: máquina de estados, idempotencia,
// verificación de firmas (Wompi) y aplicación de eventos de webhook con
// concurrencia optimista. Sin dependencias externas: node:crypto.
//
// Reglas de resiliencia que este módulo garantiza:
//  1. Idempotencia: la clave de idempotencia es UNIQUE en BD; el "doble clic
//     en pagar" devuelve el mismo pago, nunca crea dos cobros.
//  2. Webhooks duplicados: el mismo evento (tx + estado) se registra como
//     `duplicate` y no vuelve a aplicar la transición.
//  3. Webhooks fuera de orden: un evento que retrocedería el estado (p. ej.
//     "pending" después de "approved") se registra como `outOfOrder` y el
//     estado no cambia. Los estados terminales nunca retroceden.
//  4. Race conditions: las actualizaciones usan UPDATE … WHERE version = ?
//     con reintentos; dos webhooks simultáneos nunca pisan datos.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { payments, paymentEvents } from '../db/schema'

export type PaymentStatus = 'created' | 'pending' | 'approved' | 'declined' | 'error' | 'voided'

export const PAYMENT_STATUSES: PaymentStatus[] = ['created', 'pending', 'approved', 'declined', 'error', 'voided']

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  created: 'Creado',
  pending: 'Pendiente',
  approved: 'Aprobado',
  declined: 'Rechazado',
  error: 'Error',
  voided: 'Anulado',
}

const TERMINAL: ReadonlySet<PaymentStatus> = new Set(['approved', 'declined', 'error', 'voided'])

/** Transiciones legales de la máquina de estados. */
const ALLOWED: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  created: new Set(['pending', 'approved', 'declined', 'error', 'voided']),
  pending: new Set(['approved', 'declined', 'error', 'voided']),
  // Anulación post-aprobación (refund/void) es la única salida de un terminal.
  approved: new Set(['voided']),
  declined: new Set(),
  error: new Set(),
  voided: new Set(),
}

export const isTerminal = (s: PaymentStatus): boolean => TERMINAL.has(s)

export const canTransition = (from: PaymentStatus, to: PaymentStatus): boolean =>
  from !== to && ALLOWED[from].has(to)

/** Mapea el estado que reporta la pasarela a nuestra máquina de estados. */
export function normalizeGatewayStatus(raw: string | null | undefined): PaymentStatus | null {
  const s = String(raw ?? '').toLowerCase()
  const map: Record<string, PaymentStatus> = {
    created: 'created',
    pending: 'pending',
    approved: 'approved',
    declined: 'declined',
    error: 'error',
    voided: 'voided',
  }
  return map[s] ?? null
}

// ── Firmas ──────────────────────────────────────────────────────────────────

const sha256hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

const safeEqualHex = (a: string, b: string): boolean => {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Firma de integridad del checkout de Wompi:
 * SHA256(referencia + montoEnCentavos + moneda + secretoDeIntegridad).
 * Evita que el cliente manipule el monto en el widget.
 */
export function wompiIntegritySignature(
  reference: string,
  amountCents: number,
  currency: string,
  integritySecret: string,
): string {
  return sha256hex(`${reference}${amountCents}${currency}${integritySecret}`)
}

/** Lee una ruta tipo "transaction.id" dentro del objeto data del evento. */
const pick = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)

/**
 * Verifica el checksum de un evento de Wompi:
 * SHA256(concat(valores de signature.properties sobre data) + timestamp + eventsSecret).
 */
export function verifyWompiEventSignature(
  event: {
    data?: unknown
    timestamp?: number | string
    signature?: { checksum?: string; properties?: string[] }
  },
  eventsSecret: string,
): boolean {
  const checksum = event.signature?.checksum
  const props = event.signature?.properties
  if (!checksum || !Array.isArray(props) || event.timestamp == null) return false
  const concat = props.map((p) => String(pick(event.data, p) ?? '')).join('')
  const expected = sha256hex(`${concat}${event.timestamp}${eventsSecret}`)
  return safeEqualHex(expected, checksum.toLowerCase())
}

// ── Creación idempotente ────────────────────────────────────────────────────

export type CheckoutInput = {
  amountCents: number
  currency?: string
  description?: string | null
  payerEmail?: string | null
  idempotencyKey: string
  provider: 'wompi' | 'mock'
}

export const newReference = (): string => `pay_${randomBytes(8).toString('hex')}`

const IDEMPOTENCY_RE = /^[A-Za-z0-9._-]{8,128}$/
export const isValidIdempotencyKey = (k: unknown): k is string =>
  typeof k === 'string' && IDEMPOTENCY_RE.test(k)

export type Payment = typeof payments.$inferSelect

/**
 * Crea el pago o devuelve el existente si la clave de idempotencia ya se usó.
 * A prueba de carreras: si dos requests simultáneos pasan el SELECT previo,
 * el UNIQUE de BD detiene al segundo y se devuelve la fila del primero.
 */
export async function createPaymentIdempotent(
  input: CheckoutInput,
): Promise<{ payment: Payment; replayed: boolean }> {
  const existing = await db.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey))
  if (existing.length) return { payment: existing[0], replayed: true }

  try {
    const [row] = await db
      .insert(payments)
      .values({
        reference: newReference(),
        idempotencyKey: input.idempotencyKey,
        description: input.description ?? null,
        amountCents: input.amountCents,
        currency: input.currency ?? 'COP',
        status: 'created',
        provider: input.provider,
        payerEmail: input.payerEmail ?? null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
    return { payment: row, replayed: false }
  } catch (e) {
    // Carrera perdida: otro request insertó la misma clave entre el SELECT y el INSERT.
    const msg = e instanceof Error ? e.message : ''
    if (/unique|constraint/i.test(msg)) {
      const [row] = await db.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey))
      if (row) return { payment: row, replayed: true }
    }
    throw e
  }
}

// ── Aplicación de eventos de webhook ────────────────────────────────────────

export type GatewayEvent = {
  provider: 'wompi' | 'mock'
  type: string
  reference: string
  gatewayTxId?: string | null
  status: PaymentStatus
  payload?: unknown
}

export type ApplyResult = {
  ok: boolean
  paymentId?: number
  applied: boolean
  duplicate: boolean
  outOfOrder: boolean
  statusBefore?: PaymentStatus
  statusAfter?: PaymentStatus
  error?: string
}

const MAX_RETRIES = 5

/**
 * Aplica un evento de la pasarela al pago que referencia. Registra SIEMPRE el
 * evento en payment_events (con flags duplicate/outOfOrder) y solo transiciona
 * el estado si la máquina lo permite, usando concurrencia optimista.
 */
export async function applyGatewayEvent(evt: GatewayEvent): Promise<ApplyResult> {
  const [payment] = await db.select().from(payments).where(eq(payments.reference, evt.reference))
  if (!payment) return { ok: false, applied: false, duplicate: false, outOfOrder: false, error: `referencia desconocida: ${evt.reference}` }

  // Duplicado: mismo tx + mismo estado ya registrado y aplicado antes.
  const prior = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.paymentId, payment.id),
        eq(paymentEvents.eventStatus, evt.status),
        eq(paymentEvents.gatewayTxId, evt.gatewayTxId ?? ''),
        eq(paymentEvents.duplicate, false),
      ),
    )
  const isDuplicate = prior.length > 0

  let applied = false
  let outOfOrder = false
  let statusBefore = payment.status as PaymentStatus
  let statusAfter = statusBefore

  if (!isDuplicate) {
    // Reintentos por concurrencia optimista: si otro webhook ganó la carrera,
    // relee el estado y re-evalúa la transición contra el estado fresco.
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const [current] = await db.select().from(payments).where(eq(payments.id, payment.id))
      statusBefore = current.status as PaymentStatus

      if (statusBefore === evt.status) {
        // Otro request ya aplicó este mismo estado: contamos como duplicado lógico.
        statusAfter = statusBefore
        break
      }
      if (!canTransition(statusBefore, evt.status)) {
        outOfOrder = true
        statusAfter = statusBefore
        break
      }

      const res = await db
        .update(payments)
        .set({
          status: evt.status,
          gatewayTxId: evt.gatewayTxId ?? current.gatewayTxId,
          version: current.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, payment.id), eq(payments.version, current.version)))

      if (res.rowsAffected > 0) {
        applied = true
        statusAfter = evt.status
        break
      }
      // Conflicto de versión: otro proceso actualizó primero → reintentar.
    }
  }

  await db.insert(paymentEvents).values({
    paymentId: payment.id,
    provider: evt.provider,
    type: evt.type,
    gatewayTxId: evt.gatewayTxId ?? '',
    eventStatus: evt.status,
    payload: evt.payload != null ? JSON.stringify(evt.payload).slice(0, 4000) : null,
    duplicate: isDuplicate,
    outOfOrder,
    receivedAt: new Date(),
  })

  return { ok: true, paymentId: payment.id, applied, duplicate: isDuplicate, outOfOrder, statusBefore, statusAfter }
}
