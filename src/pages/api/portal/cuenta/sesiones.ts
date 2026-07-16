import type { APIRoute } from 'astro'
import { listSessions, requirePortalSession, revokeSession } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Cierra una sesión concreta del propio usuario.
 *
 * El id de sesión llega del cliente, así que se comprueba que esté entre las
 * SUYAS antes de revocar: sin eso, conocer (o adivinar) un id ajeno permitiría
 * cerrarle la sesión a cualquiera.
 */
export const DELETE: APIRoute = async (context) => {
  const auth = await requirePortalSession(context)
  if (auth.response) return auth.response
  const { session } = auth

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : ''
  if (!sessionId) return json(400, { error: 'Falta la sesión a cerrar.' })

  const own = await listSessions(session.user.id)
  if (!own.some((s) => s.id === sessionId)) {
    return json(404, { error: 'Esa sesión no existe.' })
  }

  await revokeSession(sessionId)

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'session.revoked',
    ip: clientIp(context.request.headers),
  })

  return json(200, { ok: true })
}
