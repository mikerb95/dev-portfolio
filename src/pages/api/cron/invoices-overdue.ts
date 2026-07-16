import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../lib/auth'
import { sweepOverdue } from '../../../lib/portal/invoices'
import { notifyClient } from '../../../lib/portal/notifications'
import { formatMoney } from '../../../lib/portal/format'
import { sendPush } from '../../../lib/notify'

const CRON_SECRET = import.meta.env.CRON_SECRET

// Barrido diario de facturas vencidas: `sent` con fecha pasada → `overdue`.
//
// Solo notifica las que CAMBIAN de estado en esta pasada (sweepOverdue devuelve
// exactamente esas). Si notificara todas las vencidas, el cliente recibiría el
// mismo recordatorio cada mañana hasta pagar, que es la forma más rápida de
// enseñarle a ignorar mis correos.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function run() {
  const newlyOverdue = await sweepOverdue()

  for (const invoice of newlyOverdue) {
    await notifyClient({
      clientId: invoice.clientId,
      type: 'invoice',
      title: `Factura ${invoice.number} vencida`,
      body: `La factura ${invoice.number} por ${formatMoney(invoice.totalCents, invoice.currency)} pasó su fecha de vencimiento. Si ya la pagaste, ignora este aviso.`,
      href: `/portal/facturas/${invoice.id}`,
      emailCta: 'Ver la factura',
    })
  }

  if (newlyOverdue.length) {
    await sendPush(
      'Facturas vencidas',
      `${newlyOverdue.length} factura(s) pasaron a vencidas: ${newlyOverdue.map((i) => i.number).join(', ')}`,
      { priority: 3, tags: 'calendar' }
    ).catch(() => {})
  }

  return { ok: true, marked: newlyOverdue.length, numbers: newlyOverdue.map((i) => i.number) }
}

/** Disparado por Vercel cron (GET con Authorization: Bearer CRON_SECRET). */
export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) return json(401, { error: 'no autorizado' })
  try {
    return json(200, await run())
  } catch (err) {
    console.error('[invoices-overdue]', err)
    return json(500, { error: 'barrido fallido' })
  }
}

/** Disparo manual desde el panel. Fuera del middleware de /api/admin. */
export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || (login && !isAllowedLogin(login))) return json(401, { error: 'no autorizado' })
  try {
    return json(200, await run())
  } catch (err) {
    console.error('[invoices-overdue]', err)
    return json(500, { error: 'barrido fallido' })
  }
}
