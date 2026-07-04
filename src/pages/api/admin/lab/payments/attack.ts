import type { APIRoute } from 'astro'
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../../../../db'
import { payments, labExperiments } from '../../../../../db/schema'
import { applyGatewayEvent, createPaymentIdempotent, type Payment } from '../../../../../lib/payments'

// Ataques controlados contra la pasarela para demostrar resiliencia en vivo.
// Cada ataque devuelve { esperado, observado, ok } y queda en lab_experiments.
// Protegido por el middleware admin (solo tu sesión puede dispararlos).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Pago mock desechable para el experimento. */
async function seedPayment(): Promise<Payment> {
  const { payment } = await createPaymentIdempotent({
    amountCents: 10_000_00,
    currency: 'COP',
    description: 'experimento payments-lab',
    idempotencyKey: `lab-${randomUUID()}`,
    provider: 'mock',
  })
  return payment
}

type AttackOutcome = { esperado: string; observado: string; ok: boolean; detalles?: unknown }

/** Doble clic en "pagar": 2 checkouts concurrentes con la MISMA idempotency key. */
async function attackDoubleClick(): Promise<AttackOutcome> {
  const key = `lab-dblclick-${randomUUID()}`
  const input = {
    amountCents: 25_000_00,
    currency: 'COP',
    description: 'ataque doble clic',
    idempotencyKey: key,
    provider: 'mock' as const,
  }
  const [a, b] = await Promise.all([createPaymentIdempotent(input), createPaymentIdempotent(input)])
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(payments)
    .where(eq(payments.idempotencyKey, key))

  const ok = Number(n) === 1 && a.payment.reference === b.payment.reference
  return {
    esperado: '1 solo pago en BD; ambos requests reciben la misma referencia',
    observado: `${n} pago(s) · refs: ${a.payment.reference} / ${b.payment.reference} · replays: [${a.replayed}, ${b.replayed}]`,
    ok,
  }
}

/** Webhook duplicado: el mismo evento "approved" llega dos veces. */
async function attackDuplicateWebhook(): Promise<AttackOutcome> {
  const p = await seedPayment()
  const evt = {
    provider: 'mock' as const,
    type: 'transaction.updated',
    reference: p.reference,
    gatewayTxId: `tx-${randomUUID().slice(0, 8)}`,
    status: 'approved' as const,
  }
  const first = await applyGatewayEvent(evt)
  const second = await applyGatewayEvent(evt)
  const [row] = await db.select().from(payments).where(eq(payments.id, p.id))

  const ok = first.applied && second.duplicate && !second.applied && row.status === 'approved'
  return {
    esperado: '1ª entrega aplica (created→approved); 2ª marcada duplicate sin re-aplicar',
    observado: `1ª: applied=${first.applied} (${first.statusBefore}→${first.statusAfter}) · 2ª: duplicate=${second.duplicate}, applied=${second.applied} · estado final: ${row.status}`,
    ok,
  }
}

/** Webhooks fuera de orden: "approved" llega ANTES que "pending". */
async function attackOutOfOrder(): Promise<AttackOutcome> {
  const p = await seedPayment()
  const tx = `tx-${randomUUID().slice(0, 8)}`
  const approved = await applyGatewayEvent({
    provider: 'mock', type: 'transaction.updated', reference: p.reference, gatewayTxId: tx, status: 'approved',
  })
  const pendingLate = await applyGatewayEvent({
    provider: 'mock', type: 'transaction.updated', reference: p.reference, gatewayTxId: tx, status: 'pending',
  })
  const [row] = await db.select().from(payments).where(eq(payments.id, p.id))

  const ok = approved.applied && pendingLate.outOfOrder && !pendingLate.applied && row.status === 'approved'
  return {
    esperado: 'approved aplica; el pending tardío se marca outOfOrder y el estado NO retrocede',
    observado: `approved: applied=${approved.applied} · pending tardío: outOfOrder=${pendingLate.outOfOrder}, applied=${pendingLate.applied} · estado final: ${row.status}`,
    ok,
  }
}

/** Race condition: dos webhooks contradictorios (approved vs declined) simultáneos. */
async function attackRace(): Promise<AttackOutcome> {
  const p = await seedPayment()
  const mk = (status: 'approved' | 'declined') => applyGatewayEvent({
    provider: 'mock', type: 'transaction.updated', reference: p.reference,
    gatewayTxId: `tx-${status}-${randomUUID().slice(0, 6)}`, status,
  })
  const [a, d] = await Promise.all([mk('approved'), mk('declined')])
  const [row] = await db.select().from(payments).where(eq(payments.id, p.id))

  const appliedCount = [a, d].filter((r) => r.applied).length
  const ok = appliedCount === 1 && (row.status === 'approved' || row.status === 'declined')
  return {
    esperado: 'exactamente UNO gana (estado terminal); el otro no aplica — sin corrupción ni doble transición',
    observado: `approved: applied=${a.applied} · declined: applied=${d.applied} · estado final: ${row.status} (version ${row.version})`,
    ok,
  }
}

const ATTACKS: Record<string, () => Promise<AttackOutcome>> = {
  double_click: attackDoubleClick,
  duplicate_webhook: attackDuplicateWebhook,
  out_of_order: attackOutOfOrder,
  race_condition: attackRace,
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const kind = String(body.kind ?? '')
  const attack = ATTACKS[kind]
  if (!attack) return json(400, { error: `kind debe ser uno de: ${Object.keys(ATTACKS).join(', ')}` })

  const outcome = await attack()

  await db.insert(labExperiments).values({
    kind: `payments:${kind}`,
    params: null,
    ok: outcome.ok,
    result: JSON.stringify(outcome).slice(0, 4000),
    ranAt: new Date(),
  })

  return json(200, { kind, ...outcome })
}
