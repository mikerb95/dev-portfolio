import type { APIRoute } from 'astro'
import { validarEntrada } from '../../lib/asesor/bucle'
import { AsesorNoDisponible, disponible, responder } from '../../lib/asesor/motor'

// Asesor público de la burbuja de WhatsApp (docs/plan-asistente.md, capacidad
// 3). El límite por IP lo pone el middleware (isAsesorPath); el tope de gasto
// diario, el motor. No guarda la conversación: el navegador la reenvía.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** La burbuja pregunta al abrirse si ofrecer la opción de IA. */
export const GET: APIRoute = async () => json(200, { disponible: await disponible() })

export const POST: APIRoute = async ({ request }) => {
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return json(400, { error: 'formato' })
  }
  const entrada = validarEntrada(cuerpo)
  if ('error' in entrada) return json(400, entrada)

  try {
    const r = await responder(entrada)
    return json(200, { texto: r.texto, whatsapp: r.whatsapp, calculos: r.calculos })
  } catch (err) {
    if (err instanceof AsesorNoDisponible) return json(503, { error: 'no_disponible' })
    console.error('[asesor]', err instanceof Error ? err.message : err)
    return json(502, { error: 'fallo' })
  }
}
