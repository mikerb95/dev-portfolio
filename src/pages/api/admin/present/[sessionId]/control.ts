import type { APIRoute } from 'astro'
import { getSession, runCommand, toPublicSnapshot } from '../../../../../lib/present/session'
import { parseCommand } from '../../../../../lib/present/state'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * El único endpoint que mueve una presentación.
 *
 * Vive bajo `/api/admin/` a propósito: así hereda el gate de sesión del
 * middleware en vez de estrenar un guard paralelo (regla del repo). Encima de
 * eso valida el secreto del presentador, que la página del control recibe en el
 * HTML y nunca viaja en una URL. La vista del público no tiene forma de llegar
 * aquí: ni conoce el secreto ni pasaría el gate de admin.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const sessionId = params.sessionId ?? ''

  let body: { secret?: unknown; type?: unknown; slide?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const secret = typeof body.secret === 'string' ? body.secret : ''
  if (!secret) return json(400, { error: 'falta el secreto del presentador' })

  const cmd = parseCommand(body)
  if (!cmd) return json(400, { error: 'comando desconocido' })

  const outcome = await runCommand(sessionId, secret, cmd)
  if (!outcome.ok) return json(outcome.status, { error: outcome.error })

  return json(200, toPublicSnapshot(outcome.session))
}

/** Estado actual para el control remoto (incluye lo que el público no ve). */
export const GET: APIRoute = async ({ params }) => {
  const session = await getSession(params.sessionId ?? '')
  if (!session) return json(404, { error: 'sesión no encontrada o expirada' })
  return json(200, toPublicSnapshot(session))
}
