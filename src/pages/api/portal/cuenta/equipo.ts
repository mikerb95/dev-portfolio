import type { APIRoute } from 'astro'
import { requireRole } from '../../../../lib/portal/session'
import { changeRole, disableMember, enableMember } from '../../../../lib/portal/team'
import { inviteUser, isValidEmail } from '../../../../lib/portal/invitations'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ROLES: readonly string[] = ['owner', 'member', 'billing']

/** Invita a alguien al equipo del propio cliente. Solo `owner`. */
export const POST: APIRoute = async (context) => {
  const auth = await requireRole(context, ['owner'])
  if (auth.response) return auth.response
  const { session } = auth

  // Invitar manda correo a terceros: sin límite, esto sería un cañón de spam
  // firmado con mi dominio, y mi reputación de envío la que se quema.
  const { allowed } = await enforceLimit(`portal-invite:${session.client.id}`, { limit: 10, windowMs: 60 * 60_000 })
  if (!allowed) return json(429, { error: 'Has enviado muchas invitaciones seguidas. Espera un momento.' })

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const email = typeof data.email === 'string' ? data.email : ''
  if (!isValidEmail(email)) return json(400, { error: 'El correo no tiene un formato válido.' })

  const role = typeof data.role === 'string' && ROLES.includes(data.role) ? (data.role as 'owner' | 'member' | 'billing') : 'member'
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : null

  // El clientId sale de la sesión: un owner solo puede invitar a SU equipo.
  const result = await inviteUser({
    clientId: session.client.id,
    email,
    name,
    role,
    invitedBy: `user:${session.user.id}`,
  })

  if (!result.ok) return json(400, { error: result.error })

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'invite.sent',
    detail: `${email} · ${role}`,
    ip: clientIp(context.request.headers),
  })

  // Si el correo no salió, se dice: mejor que el owner sepa que tiene que
  // pasar el enlace a mano a que crea que su compañero ya fue invitado.
  return json(201, { ok: true, emailSent: result.emailSent, error: result.emailSent ? undefined : result.emailError })
}

/** Cambia el estado o el rol de un miembro del equipo. Solo `owner`. */
export const PATCH: APIRoute = async (context) => {
  const auth = await requireRole(context, ['owner'])
  if (auth.response) return auth.response
  const { session } = auth

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const userId = Number(data.userId)
  if (!Number.isInteger(userId)) return json(400, { error: 'Usuario inválido.' })

  // Un owner no se toca a sí mismo desde aquí: se quedaría fuera de su propio
  // portal sin forma de volver a entrar salvo escribiéndome.
  if (userId === session.user.id) return json(400, { error: 'No puedes modificar tu propio acceso.' })

  const action = String(data.action ?? '')

  // Todas estas funciones reciben el clientId de la sesión y comprueban que el
  // usuario objetivo sea de ese cliente: un id de otra empresa no hace nada.
  if (action === 'disable') {
    const result = await disableMember(session.client.id, userId)
    if (!result.ok) return json(400, { error: result.error })
    audit({ clientId: session.client.id, clientUserId: session.user.id, action: 'user.disabled', entityId: userId })
    return json(200, { ok: true })
  }

  if (action === 'enable') {
    const result = await enableMember(session.client.id, userId)
    if (!result.ok) return json(400, { error: result.error })
    return json(200, { ok: true })
  }

  if (action === 'role') {
    const role = String(data.role ?? '')
    if (!ROLES.includes(role)) return json(400, { error: 'Rol desconocido.' })
    const result = await changeRole(session.client.id, userId, role as 'owner' | 'member' | 'billing')
    if (!result.ok) return json(400, { error: result.error })
    audit({
      clientId: session.client.id,
      clientUserId: session.user.id,
      action: 'user.role_changed',
      entityId: userId,
      detail: role,
    })
    return json(200, { ok: true })
  }

  return json(400, { error: 'Acción desconocida.' })
}
