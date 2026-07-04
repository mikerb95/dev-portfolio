import type { APIRoute } from 'astro'
import { desc, inArray } from 'drizzle-orm'
import { db } from '../../../../../db'
import { payments, paymentEvents, labExperiments } from '../../../../../db/schema'

/** Estado del laboratorio de pagos: pagos recientes, sus eventos y experimentos. */
export const GET: APIRoute = async () => {
  const pays = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(20)
  const events = pays.length
    ? await db
        .select()
        .from(paymentEvents)
        .where(inArray(paymentEvents.paymentId, pays.map((p) => p.id)))
        .orderBy(desc(paymentEvents.receivedAt))
        .limit(100)
    : []
  const experiments = await db.select().from(labExperiments).orderBy(desc(labExperiments.ranAt)).limit(20)

  return new Response(JSON.stringify({ payments: pays, events, experiments }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
