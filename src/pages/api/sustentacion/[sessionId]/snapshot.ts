import type { APIRoute } from 'astro'
import { getSesion, toBeatSnapshot } from '../../../../lib/sustentacion/bus'

/**
 * Snapshot del beat actual. Público: lo consulta cada celular del salón.
 *
 * Es la capa 2 y 3 del seguidor (resync periódico y polling de rescate). Sin
 * él, un mensaje perdido del bus dejaría a media sala en el beat anterior para
 * siempre, porque pub/sub no garantiza entrega.
 *
 * No devuelve nada que el público no vea ya proyectado: un índice, un título y
 * un dato. El secreto del presentador no está aquí ni en Redis (se deriva).
 */
export const GET: APIRoute = async ({ params }) => {
  const sesion = await getSesion(String(params.sessionId ?? ''))
  if (!sesion) {
    return new Response(JSON.stringify({ error: 'sesión no encontrada o expirada' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  return new Response(JSON.stringify(toBeatSnapshot(sesion)), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
