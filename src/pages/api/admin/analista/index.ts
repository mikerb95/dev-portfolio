import type { APIRoute } from 'astro'
import { SinApiKey } from '../../../../lib/analista/credencial'
import {
  AnalistaOcupado,
  correrAnalisis,
  prepararAnalisis,
  SinPresupuesto,
} from '../../../../lib/analista/motor-api'
import { transmitir } from '../../../../lib/analista/sse'
import { recordAdminEvent } from '../../../../lib/security/events'

// Lanza un análisis del micro-SIEM y transmite en vivo lo que hace el agente.
// Protegido por el middleware de /api/admin y vetado en modo demo
// (lib/demo.ts): cada análisis gasta créditos reales de la API de Claude.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const pregunta = typeof body?.pregunta === 'string' ? body.pregunta.trim().slice(0, 500) : ''
  if (!pregunta) return json(400, { error: 'Falta la pregunta.' })

  let ejecucion
  try {
    ejecucion = await prepararAnalisis(pregunta)
  } catch (err) {
    if (err instanceof SinApiKey) return json(503, { error: err.message })
    if (err instanceof AnalistaOcupado) return json(409, { error: err.message })
    if (err instanceof SinPresupuesto) return json(429, { error: err.message })
    // Sin poder leer el gasto del día no se arranca: es dinero, no
    // observabilidad, así que aquí no aplica el fail-open del resto del SIEM.
    return json(503, { error: 'No se pudo preparar el análisis. Intenta de nuevo en un momento.' })
  }
  await recordAdminEvent(request, 'analista.analisis')

  return transmitir(async (enviar) => {
    enviar({ tipo: 'ejecucion', id: ejecucion.id })
    await correrAnalisis(ejecucion, enviar)
  })
}
