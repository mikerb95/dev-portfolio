import type { APIRoute } from 'astro'
import { getSession, toPublicSnapshot } from '../../../../lib/present/session'

/**
 * Snapshot público de una sesión. Es lo que pide cada cliente al conectar y al
 * reconectar, y también el plan B si el bus de Upstash no está disponible
 * (`client-sync.ts` cae a consultar aquí cada segundo).
 *
 * Solo lectura, por definición: no hay verbo aquí que mueva la presentación.
 * `no-store` es obligatorio — esta ruta es pública y el middleware cachea las
 * páginas públicas 300 s en el edge, lo que congelaría el slide para todo el
 * salón.
 */
export const GET: APIRoute = async ({ params }) => {
  const session = await getSession(params.sessionId ?? '')

  if (!session) {
    return new Response(JSON.stringify({ state: 'ended', reason: 'not-found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  return new Response(JSON.stringify(toPublicSnapshot(session)), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
