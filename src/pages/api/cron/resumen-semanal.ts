import type { APIRoute } from 'astro'
import { cronSecretOk } from '../../../lib/cron-auth'
import { conRegistro } from '../../../lib/cron-runs'
import { sendPush } from '../../../lib/notify'
import { generarResumen } from '../../../lib/resumen-semanal-servicio'
import { siteUrl } from '../../../lib/site'

// Resumen semanal de operación (etapa 11 del roadmap): cada lunes a las 7:00
// de Bogotá junta la semana anterior, la manda a redactar a Claude y deja el
// titular en el celular. Lo dispara Vercel (vercel.json), igual que el
// analista matutino: la redacción puede pasar de los 30 s que corta cron-job.org.
//
// FAIL-OPEN en la IA: sin API key o si la API falla, el resumen sale armado
// sin IA con las mismas cifras. Lo único que lo hace fallar es no poder
// guardarlo, y eso sí se marca en la bitácora para que lo vea el detector de
// silencio.

export const GET: APIRoute = conRegistro('resumen-semanal', async ({ request }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }

  let resumen
  try {
    resumen = await generarResumen()
  } catch (err) {
    console.error('[cron/resumen-semanal] guardar:', err)
    return new Response(JSON.stringify({ ok: false }), { status: 500 })
  }

  await sendPush('Resumen de la semana', resumen.titular, { tags: 'calendar', click: `${siteUrl()}/admin/semana` }).catch(() => {})

  return new Response(JSON.stringify({ ok: true, conIa: resumen.conIa, costoUsd: Number(resumen.costoUsd.toFixed(4)) }), { status: 200 })
})
