import type { APIRoute } from 'astro'
import { publicarBeat } from '../../../lib/sustentacion/bus'

/**
 * Publica el beat actual de la sustentación.
 *
 * Es PÚBLICO a propósito, igual que el control remoto de una presentación: el
 * canvas corre en el navegador del presentador y no puede llevar una sesión de
 * admin en cada flecha. Lo que autoriza es el secreto derivado por HMAC del id
 * de sesión, que solo se entrega por /api/admin/sustentacion/sesion.
 *
 * Responde rápido y sin ceremonia: el publicador del navegador ni siquiera lee
 * la respuesta (ver lib/sustentacion/publicar.ts), así que lo único que importa
 * aquí es no quedarse colgado.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request }) => {
  let body: { sessionId?: unknown; secreto?: unknown; beat?: unknown; titulo?: unknown; dato?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const secreto = typeof body.secreto === 'string' ? body.secreto : ''
  if (!sessionId || !secreto) return json(400, { error: 'faltan sessionId o secreto' })

  const beat = typeof body.beat === 'number' ? body.beat : Number(body.beat)
  const titulo = typeof body.titulo === 'string' ? body.titulo : ''
  const dato = typeof body.dato === 'string' ? body.dato : null

  const r = await publicarBeat(sessionId, secreto, { beat, titulo, dato })
  if (!r.ok) return json(r.status, { error: r.error })
  return json(200, r.snapshot)
}
