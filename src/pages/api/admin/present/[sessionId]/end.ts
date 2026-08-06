import type { APIRoute } from 'astro'
import { forceEndSession } from '../../../../../lib/present/session'

/**
 * Cierre desde el panel, sin el secreto del presentador.
 *
 * Existe porque el secreto solo lo tiene la página del control remoto: si ese
 * celular se quedó sin batería a mitad de la charla, la sesión seguiría viva
 * ocupando su PIN durante seis horas y no habría forma de cerrarla. La
 * autorización aquí es la sesión de admin, que es la misma persona.
 */
export const POST: APIRoute = async ({ params }) => {
  const session = await forceEndSession(params.sessionId ?? '')
  if (!session) {
    return new Response(JSON.stringify({ error: 'sesión no encontrada o expirada' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  return new Response(JSON.stringify({ ok: true, state: session.state }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
