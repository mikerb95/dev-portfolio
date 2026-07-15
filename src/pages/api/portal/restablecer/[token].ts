import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { clientUsers } from '../../../../db/schema'
import { consumeToken, resolveToken } from '../../../../lib/portal/invitations'
import { hashPassword, passwordProblem } from '../../../../lib/portal/passwords'
import { createSession, revokeAllSessions, setSessionCookie } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Fija la contraseña nueva tras un restablecimiento y deja al usuario dentro.
 *
 * Revoca TODAS las sesiones previas: un reset suele significar "creo que
 * alguien entró en mi cuenta", y sería absurdo cambiar la contraseña dejando
 * viva la sesión del intruso. La sesión nueva se crea después, así que quien
 * restablece no se echa a sí mismo.
 */
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const reset = await resolveToken(params.token)
  if (!reset || reset.kind !== 'reset') {
    return json(400, { error: 'El enlace de restablecimiento ya no es válido.' })
  }

  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const password = typeof data.password === 'string' ? data.password : ''
  const problem = passwordProblem(password)
  if (problem) return json(400, { error: problem })

  if (!(await consumeToken(reset.invitationId))) {
    return json(400, { error: 'El enlace de restablecimiento ya no es válido.' })
  }

  await db
    .update(clientUsers)
    .set({
      passwordHash: await hashPassword(password),
      // Un reset correcto limpia el bloqueo: el dueño demostró control del
      // buzón, y dejarlo bloqueado castigaría a la víctima del ataque.
      status: 'active',
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(clientUsers.id, reset.clientUserId))

  await revokeAllSessions(reset.clientUserId)

  const ip = clientIp(request.headers)
  audit({ clientId: reset.clientId, clientUserId: reset.clientUserId, action: 'password.reset', ip })

  const token = await createSession({
    clientUserId: reset.clientUserId,
    ip,
    userAgent: request.headers.get('user-agent'),
  })
  setSessionCookie(cookies, token)

  return json(200, { ok: true, redirect: '/portal' })
}
