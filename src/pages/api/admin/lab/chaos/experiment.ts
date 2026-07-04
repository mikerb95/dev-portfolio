import type { APIRoute } from 'astro'
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../../../../db'
import { payments, paymentEvents, labExperiments } from '../../../../../db/schema'
import { createPaymentIdempotent } from '../../../../../lib/payments'

// Experimento: la BD "se cae" a MITAD de una transacción de pago.
// Dentro de una transacción se actualiza el pago y se inserta su evento, y
// entonces la conexión "muere" (excepción). Verificamos que el rollback dejó
// la BD consistente: ni estado a medias ni eventos huérfanos.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async () => {
  const { payment } = await createPaymentIdempotent({
    amountCents: 10_000_00,
    currency: 'COP',
    description: 'experimento chaos: caída de BD a mitad de transacción',
    idempotencyKey: `chaos-dbtx-${randomUUID()}`,
    provider: 'mock',
  })

  const before = {
    status: payment.status,
    version: payment.version,
    events: 0,
  }

  let crashed = false
  try {
    await db.transaction(async (tx) => {
      // Paso 1 de la transacción: transicionar el pago.
      await tx
        .update(payments)
        .set({ status: 'pending', version: payment.version + 1, updatedAt: new Date() })
        .where(eq(payments.id, payment.id))
      // Paso 2: registrar el evento correspondiente.
      await tx.insert(paymentEvents).values({
        paymentId: payment.id,
        provider: 'mock',
        type: 'transaction.updated',
        gatewayTxId: 'tx-chaos',
        eventStatus: 'pending',
        receivedAt: new Date(),
      })
      // 💥 La "BD se cae" antes del COMMIT.
      throw new Error('CHAOS: conexión perdida a mitad de la transacción')
    })
  } catch (e) {
    crashed = e instanceof Error && e.message.startsWith('CHAOS')
    if (!crashed) throw e
  }

  // Verificación de consistencia post-caída.
  const [after] = await db.select().from(payments).where(eq(payments.id, payment.id))
  const [{ n: orphanEvents }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(paymentEvents)
    .where(eq(paymentEvents.paymentId, payment.id))

  const consistent =
    crashed &&
    after.status === before.status &&
    after.version === before.version &&
    Number(orphanEvents) === before.events

  const outcome = {
    esperado: 'rollback total: el pago conserva su estado/version y NO quedan eventos huérfanos',
    observado: `caída simulada=${crashed} · estado: ${before.status}→${after.status} · version: ${before.version}→${after.version} · eventos huérfanos: ${orphanEvents}`,
    ok: consistent,
  }

  await db.insert(labExperiments).values({
    kind: 'chaos:db_fail_midtx',
    params: JSON.stringify({ paymentId: payment.id }),
    ok: outcome.ok,
    result: JSON.stringify(outcome).slice(0, 4000),
    ranAt: new Date(),
  })

  return json(200, { kind: 'db_fail_midtx', ...outcome })
}
