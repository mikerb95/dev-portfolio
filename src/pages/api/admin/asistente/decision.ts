import type { APIRoute } from 'astro'
import { SinApiKey } from '../../../../lib/analista/credencial'
import { transmitir } from '../../../../lib/analista/sse'
import { continuarDecision, reclamarDecision } from '../../../../lib/asistente/motor-api'
import { recordAdminEvent } from '../../../../lib/security/events'

// Aprueba o rechaza la acción que propuso el asistente (hoy, crear una cuenta
// de cobro en borrador) y transmite lo que sigue. La decisión puede llegar
// horas después: la conversación vive en la base. Protegido por el middleware
// de /api/admin y vetado en modo demo.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return json(400, { error: 'Falta el id de la conversación.' })
  // Solo un `true` explícito aprueba: cualquier otra cosa es un rechazo.
  const aprobado = body?.aprobado === true

  let conversacion
  try {
    conversacion = await reclamarDecision(id)
  } catch (err) {
    if (err instanceof SinApiKey) return json(503, { error: err.message })
    return json(503, { error: 'No se pudo leer la conversación. Intenta de nuevo en un momento.' })
  }
  if (!conversacion) return json(409, { error: 'Esa propuesta ya se decidió o no existe.' })
  await recordAdminEvent(request, aprobado ? 'asistente.propuesta_aprobada' : 'asistente.propuesta_rechazada')

  return transmitir(async (enviar) => {
    enviar({ tipo: 'conversacion', id: conversacion.id })
    await continuarDecision(conversacion, aprobado, enviar)
  })
}
