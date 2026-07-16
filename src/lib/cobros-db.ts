// Operaciones de BD de los cobros de campo. Separado de cobros.ts (que es puro)
// porque esto sí toca la base. Ver docs/plan-cobrar.md.

import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { clients, payments } from '../db/schema'
import { expiryDate, type ExpiryOption } from './cobros'
import { newShortCode } from './cobros-crypto'
import { createPaymentIdempotent, applyGatewayEvent, type Payment } from './payments'
import { normalizePhone } from './phone'
import { serverEnv } from './env'

export type CreateCobroInput = {
  amountCents: number
  phone: string
  concept?: string | null
  expiry: ExpiryOption
  idempotencyKey: string
}

export type CreateCobroResult = {
  payment: Payment
  replayed: boolean
  conflict?: string
  client?: { id: number; name: string } | null
}

/**
 * Busca la ficha del CRM por teléfono. Vínculo SUAVE: si no hay ficha, el cobro
 * simplemente queda suelto — cobrar un trabajo puntual no debe llenar el CRM de
 * contactos que nunca vuelven.
 */
export async function findClientByPhone(phoneE164: string): Promise<{ id: number; name: string } | null> {
  const [row] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.phone, phoneE164))
    .limit(1)
  return row ?? null
}

/** Reintenta ante colisión del UNIQUE de short_code (probabilidad ínfima, coste nulo). */
async function assignShortCode(paymentId: number): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newShortCode()
    try {
      await db.update(payments).set({ shortCode: code }).where(eq(payments.id, paymentId))
      return code
    } catch (e) {
      if (i === 4) throw e
      // Colisión: otro cobro ya tiene ese código. Se reintenta con uno nuevo.
    }
  }
  throw new Error('no se pudo asignar un código de cobro')
}

/**
 * Crea el cobro reutilizando la pasarela existente: `createPaymentIdempotent`
 * hace el trabajo (idempotencia + UNIQUE), y aquí solo se añade lo propio del
 * cobro de campo (teléfono, código corto, vencimiento, cliente).
 */
export async function createCobro(input: CreateCobroInput): Promise<CreateCobroResult> {
  const provider: 'wompi' | 'mock' =
    serverEnv('WOMPI_PUBLIC_KEY') && serverEnv('WOMPI_INTEGRITY_SECRET') ? 'wompi' : 'mock'

  const client = await findClientByPhone(input.phone)

  const { payment, replayed, conflict } = await createPaymentIdempotent({
    amountCents: input.amountCents,
    currency: 'COP',
    description: input.concept ?? null,
    idempotencyKey: input.idempotencyKey,
    provider,
  })

  // Replay (doble clic): el cobro ya existe con su código y vencimiento. No se
  // toca nada — reasignar el código rompería el link que quizá ya se envió.
  if (replayed || conflict) return { payment, replayed, conflict, client }

  const shortCode = await assignShortCode(payment.id)
  const expiresAt = expiryDate(input.expiry)

  const [updated] = await db
    .update(payments)
    .set({
      payerPhone: input.phone,
      source: 'cobro',
      expiresAt,
      clientId: client?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id))
    .returning()

  return { payment: { ...updated, shortCode }, replayed: false, client }
}

/** Cobro por su código corto. La validación de forma la hace isValidShortCode antes. */
export async function findByShortCode(code: string): Promise<Payment | null> {
  const [row] = await db.select().from(payments).where(eq(payments.shortCode, code)).limit(1)
  return row ?? null
}

export type CobroRow = Payment & { clientName: string | null }

/** Cobros de campo, más recientes primero, con el nombre del cliente si lo hay. */
export async function listCobros(limit = 30, onlyOpen = false): Promise<CobroRow[]> {
  const open: Payment['status'][] = ['created', 'pending']
  const where = onlyOpen
    ? and(eq(payments.source, 'cobro'), inArray(payments.status, open))
    : eq(payments.source, 'cobro')

  const rows = await db
    .select({ payment: payments, clientName: clients.name })
    .from(payments)
    .leftJoin(clients, eq(payments.clientId, clients.id))
    .where(where)
    .orderBy(desc(payments.createdAt))
    .limit(limit)

  return rows.map((r) => ({ ...r.payment, clientName: r.clientName }))
}

/**
 * Anula un cobro pasando por la MISMA máquina de estados que un webhook: la
 * anulación queda en payment_events como evidencia, y las transiciones ilegales
 * las rechaza la máquina, no un `if` aparte.
 */
export async function voidCobro(reference: string, motivo: string) {
  return applyGatewayEvent({
    provider: 'mock',
    type: 'admin.void',
    reference,
    status: 'voided',
    payload: { motivo, origen: 'admin:/cobrar' },
  })
}

/** Histórico de cobros de un teléfono (para /mis-pagos). */
export async function historyForPhone(phoneE164: string, limit = 50): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.payerPhone, phoneE164), eq(payments.source, 'cobro')))
    .orderBy(desc(payments.createdAt))
    .limit(limit)
}

/**
 * Todos los teléfonos con cobros. /mis-pagos recibe un identificador opaco del
 * teléfono (no el número), así que la única forma de resolverlo es recalcular
 * el HMAC de cada candidato. La lista es pequeña (mis clientes de campo) y solo
 * se recorre cuando alguien abre su link.
 */
export async function distinctPhones(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ phone: payments.payerPhone })
    .from(payments)
    .where(and(eq(payments.source, 'cobro'), isNotNull(payments.payerPhone)))
  return rows.map((r) => r.phone).filter((p): p is string => normalizePhone(p) !== null)
}
