import type { APIRoute } from 'astro'
import { generarToken } from '../../../../lib/hackaton/store'
import { recordAdminEvent } from '../../../../lib/security/events'

// Genera el enlace de escritura del tablero de la hackatón (RF-047) y revoca
// el anterior. La sesión la exige el middleware por vivir bajo /api/admin/.
// El token sale en claro solo en esta respuesta; en la base queda su hash.
export const POST: APIRoute = async ({ request }) => {
  try {
    const token = await generarToken()
    await recordAdminEvent(request, 'hackaton.enlace_generado')
    return new Response(JSON.stringify({ token, ruta: `/hackaton?equipo=${token}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[admin/hackaton/enlace]', err)
    return new Response(JSON.stringify({ error: 'no se pudo generar el enlace' }), { status: 500 })
  }
}
