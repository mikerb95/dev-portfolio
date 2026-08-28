import type { APIRoute } from 'astro'
import { leerEstado } from '../../../lib/sustentacion/control'

/**
 * Beat actual. Lo consultan el canvas y los seguidores, y lo consultan MUCHO:
 * es la vía de sincronización de 200-300 ms que hace que el avance se sienta
 * instantáneo sin depender de que el SSE aguante en 5G.
 *
 * Por eso hace lo mínimo posible: como mucho dos lecturas de Redis (el puntero
 * de la sesión en curso y la sesión), cero consultas a Turso, cero trabajo de
 * render. Con `?sessionId=` es una sola lectura, y es lo que usa el canvas, que
 * ya conoce su sesión.
 *
 * `no-store` es obligatorio aquí: un solo segundo de caché de CDN sobre este
 * endpoint congelaría la presentación de media sala en el beat anterior.
 *
 * CUANDO REDIS NO RESPONDE devuelve 503 con `redis: false` y un mensaje claro,
 * nunca un 200 con un beat inventado. El canvas distingue las dos cosas: ante
 * el 503 conserva el último beat conocido y sigue funcionando con el teclado.
 * Lo que no puede pasar nunca es una pantalla en blanco delante del jurado.
 */
export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId')
  const r = await leerEstado(sessionId)

  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

  if (!r.ok) {
    return new Response(JSON.stringify({ error: r.error, redis: r.status !== 503 }), {
      status: r.status,
      headers,
    })
  }
  return new Response(JSON.stringify(r.estado), { status: 200, headers })
}
