import type { APIRoute } from 'astro'
import { SinApiKey } from '../../../../lib/analista/credencial'
import { continuarDecision, reclamarDecision } from '../../../../lib/analista/motor-api'
import { transmitir } from '../../../../lib/analista/sse'
import { recordAdminEvent } from '../../../../lib/security/events'

// Aprueba o rechaza el bloqueo que propuso el analista y retoma el análisis,
// transmitiendo en vivo lo que sigue. La decisión puede llegar horas después
// de la propuesta: la ejecución vive en la base. Protegido por el middleware
// de /api/admin y vetado en modo demo.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return json(400, { error: 'Falta el id del análisis.' })
  // Solo un `true` explícito aprueba: cualquier otra cosa es un rechazo.
  const aprobado = body?.aprobado === true

  let ejecucion
  try {
    ejecucion = await reclamarDecision(id)
  } catch (err) {
    if (err instanceof SinApiKey) return json(503, { error: err.message })
    return json(503, { error: 'No se pudo leer el análisis. Intenta de nuevo en un momento.' })
  }
  if (!ejecucion) return json(409, { error: 'Ese bloqueo ya se decidió o no existe.' })
  await recordAdminEvent(request, aprobado ? 'analista.bloqueo_aprobado' : 'analista.bloqueo_rechazado', {
    severity: aprobado ? 'medium' : 'low',
  })

  return transmitir(async (enviar) => {
    enviar({ tipo: 'ejecucion', id: ejecucion.id })
    await continuarDecision(ejecucion, aprobado, enviar)
  })
}
