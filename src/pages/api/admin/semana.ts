import type { APIRoute } from 'astro'
import { generarResumen } from '../../../lib/resumen-semanal-servicio'
import { recordAdminEvent } from '../../../lib/security/events'

// Botón "Generar ahora" de /admin/semana: el mismo flujo que el cron de los
// lunes, para no esperar una semana a ver el resultado. La sesión la exige el
// middleware por vivir bajo /api/admin/. Gasta unos US$0,02 si hay API key.
export const POST: APIRoute = async ({ request }) => {
  try {
    const r = await generarResumen()
    await recordAdminEvent(request, 'resumen-semanal.generado')
    return new Response(JSON.stringify({ ok: true, conIa: r.conIa, costoUsd: r.costoUsd }), { status: 200 })
  } catch (err) {
    console.error('[admin/semana]', err)
    return new Response(JSON.stringify({ error: 'no se pudo guardar el resumen' }), { status: 500 })
  }
}
