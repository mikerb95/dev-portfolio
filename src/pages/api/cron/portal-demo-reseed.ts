import type { APIRoute } from 'astro'
import { eq, inArray } from 'drizzle-orm'
import { db, demoAvailable, runInDemoContext } from '../../../db'
import { clientUsers, invoices, payments, portalNotifications } from '../../../db/schema'

const CRON_SECRET = import.meta.env.CRON_SECRET

// Re-seed nocturno de la demo pública del portal.
//
// No repite el sembrado completo (eso ya lo hace scripts/seed-demo.mjs y es
// destructivo: arrasa el esquema). Lo único que un visitante puede mutar en la
// demo es el resultado de un pago simulado (ver lib/portal/demo.ts: la única
// escritura permitida es pagar la factura de ejemplo), así que esto solo
// restaura ESE estado a su valor canónico:
//   - las 3 facturas semilla vuelven a su status/paidAt originales,
//   - los pagos que el simulador haya creado sobre ellas se borran,
//   - las notificaciones in-app acumuladas (p. ej. "pago recibido" de una
//     sesión de un visitante anterior) se limpian.
//
// Los hitos y el hilo de mensajes son de solo lectura para el cliente (no hay
// endpoint que los cambie desde el portal), así que no necesitan restaurarse.

const CANONICAL: Record<string, { status: 'paid' | 'sent' | 'overdue' }> = {
  'INV-2026-101': { status: 'paid' },
  'INV-2026-102': { status: 'sent' },
  'INV-2026-103': { status: 'overdue' },
}

async function reseed() {
  return runInDemoContext(async () => {
    const numbers = Object.keys(CANONICAL)
    const rows = await db.select().from(invoices).where(inArray(invoices.number, numbers))

    for (const inv of rows) {
      const canon = CANONICAL[inv.number]
      if (!canon) continue

      if (inv.paymentId) {
        await db.delete(payments).where(eq(payments.id, inv.paymentId))
      }
      await db
        .update(invoices)
        .set({
          status: canon.status,
          paidAt: canon.status === 'paid' ? inv.paidAt ?? new Date() : null,
          paymentId: null,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, inv.id))
    }

    // Pagos huérfanos: el simulador crea el pago ANTES de aprobarlo, así que un
    // visitante que abandonó a mitad del flujo deja un pago sin invoiceId
    // vinculado o vinculado a una factura que ya se restauró arriba.
    const invoiceIds = rows.map((r) => r.id)
    if (invoiceIds.length) {
      await db.delete(payments).where(inArray(payments.invoiceId, invoiceIds))
    }

    const [demoUser] = await db
      .select({ id: clientUsers.id })
      .from(clientUsers)
      .where(eq(clientUsers.email, 'demo@codebymike.tech'))
      .limit(1)
    if (demoUser) {
      await db.delete(portalNotifications).where(eq(portalNotifications.clientUserId, demoUser.id))
    }

    return { invoicesReset: rows.length }
  })
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Disparado por Vercel cron (GET con Authorization: Bearer CRON_SECRET). */
export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) return json(401, { error: 'no autorizado' })

  if (!demoAvailable) return json(200, { ok: true, skipped: 'demo no configurada' })

  try {
    return json(200, { ok: true, ...(await reseed()) })
  } catch (err) {
    console.error('[portal-demo-reseed]', err)
    return json(500, { error: 'reseed fallido' })
  }
}
