import type { APIRoute } from 'astro'
import { esAsistente } from '../../../lib/aeo/agentes'
import { contar } from '../../../lib/aeo/conteo'

export const prerender = false

// Beacon público de src/components/ReferidoIA.astro: una visita que llegó desde
// un asistente de IA. Igual que /api/vitals, se valida con mano dura y se
// responde 204 pase lo que pase: solo entra un id de la lista fija de
// asistentes, así que lo peor que puede hacer un abuso es inflar un contador,
// y el rate limit por IP del middleware ya lo acota.
export const POST: APIRoute = async ({ request }) => {
  let fuente: unknown
  try {
    fuente = ((await request.json()) as Record<string, unknown>)?.fuente
  } catch {
    return new Response(null, { status: 204 })
  }
  if (esAsistente(fuente)) await contar({ tipo: 'referido', fuente })
  return new Response(null, { status: 204 })
}
