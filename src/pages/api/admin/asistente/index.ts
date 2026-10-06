import type { APIRoute } from 'astro'
import { SinApiKey } from '../../../../lib/analista/credencial'
import { transmitir } from '../../../../lib/analista/sse'
import {
  ConversacionLarga,
  correr,
  prepararConversacion,
  reclamarParaSeguir,
  seguir,
  SinPresupuesto,
} from '../../../../lib/asistente/motor-api'
import { recordAdminEvent } from '../../../../lib/security/events'

// Pregunta al asistente desde la caja del dashboard y transmite en vivo lo que
// hace. Sin `id` abre una conversación; con `id` la sigue (y si había una
// propuesta esperando, la pregunta cuenta como "cambia esto"). Protegido por
// el middleware de /api/admin y vetado en modo demo (lib/demo.ts).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const pregunta = typeof body?.pregunta === 'string' ? body.pregunta.trim().slice(0, 1_000) : ''
  const id = typeof body?.id === 'string' && body.id ? body.id : null
  if (!pregunta) return json(400, { error: 'Falta la pregunta.' })

  let conversacion
  try {
    conversacion = id ? await reclamarParaSeguir(id) : await prepararConversacion(pregunta)
  } catch (err) {
    if (err instanceof SinApiKey) return json(503, { error: err.message })
    if (err instanceof SinPresupuesto) return json(429, { error: err.message })
    if (err instanceof ConversacionLarga) return json(409, { error: err.message, nueva: true })
    // Sin poder leer el gasto del día no se arranca: es dinero, no
    // observabilidad, así que aquí no aplica el fail-open del resto.
    return json(503, { error: 'No se pudo preparar la pregunta. Intenta de nuevo en un momento.' })
  }
  if (!conversacion) return json(409, { error: 'Esa conversación ya no se puede seguir. Empieza una nueva.', nueva: true })
  await recordAdminEvent(request, 'asistente.pregunta')

  return transmitir(async (enviar) => {
    enviar({ tipo: 'conversacion', id: conversacion.id })
    if (id) await seguir(conversacion, pregunta, enviar)
    else await correr(conversacion, enviar)
  })
}
