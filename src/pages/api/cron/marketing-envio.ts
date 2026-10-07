import type { APIRoute } from 'astro'
import { cronSecretOk } from '../../../lib/cron-auth'
import { conRegistro } from '../../../lib/cron-runs'
import { procesarCola } from '../../../lib/marketing/db'

// Vacía la cola de correos promocionales. Corre cada hora desde cron-job.org;
// fuera de la franja de la Ley 2300 no envía nada y solo lo dice. Fail-open
// como el resto de los crons: un fallo aquí no tumba nada más.

export const GET: APIRoute = conRegistro('marketing-envio', async ({ request }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await procesarCola()), { status: 200 })
  } catch (err) {
    console.error('[cron/marketing-envio]', err)
    return new Response(JSON.stringify({ ok: false }), { status: 200 })
  }
})
