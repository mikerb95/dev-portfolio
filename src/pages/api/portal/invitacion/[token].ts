import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { clientUsers } from '../../../../db/schema'
import { consumeToken, resolveToken } from '../../../../lib/portal/invitations'
import { hashPassword, passwordProblem } from '../../../../lib/portal/passwords'
import { createSession, setSessionCookie } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Acepta una invitación: fija nombre y contraseña, activa la cuenta y deja al
 * usuario dentro. No se le pide volver a escribir la contraseña que acaba de
 * elegir — ya demostró control del buzón y acaba de elegirla; mandarlo al login
 * sería fricción sin ganancia de seguridad.
 */
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const invitation = await resolveToken(params.token)
  if (!invitation || invitation.kind !== 'invite') {
    return json(400, { error: 'El enlace de invitación ya no es válido.' })
  }

  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const name = typeof data.name === 'string' ? data.name.trim().slice(0, 120) : ''
  const password = typeof data.password === 'string' ? data.password : ''
  if (!name) return json(400, { error: 'Escribe tu nombre.' })

  const problem = passwordProblem(password)
  if (problem) return json(400, { error: problem })

  // Consumir ANTES de escribir: si dos clics en el enlace corren a la vez, solo
  // uno gana el UPDATE atómico y el otro se va con un error, en vez de que los
  // dos activen la cuenta y uno pise la contraseña del otro.
  if (!(await consumeToken(invitation.invitationId))) {
    return json(400, { error: 'El enlace de invitación ya no es válido.' })
  }

  await db
    .update(clientUsers)
    .set({ name, passwordHash: await hashPassword(password), status: 'active', failedAttempts: 0, lockedUntil: null })
    .where(eq(clientUsers.id, invitation.clientUserId))

  const ip = clientIp(request.headers)
  audit({ clientId: invitation.clientId, clientUserId: invitation.clientUserId, action: 'invite.accepted', ip })
  audit({ clientId: invitation.clientId, clientUserId: invitation.clientUserId, action: 'password.set', ip })

  const token = await createSession({
    clientUserId: invitation.clientUserId,
    ip,
    userAgent: request.headers.get('user-agent'),
  })
  setSessionCookie(cookies, token)

  return json(200, { ok: true, redirect: '/portal' })
}
