import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { clients } from '../../../../db/schema'
import { inviteUser, isValidEmail } from '../../../../lib/portal/invitations'
import { audit } from '../../../../lib/portal/audit'

// Gestión del portal desde el panel. La autenticación de admin ya la impone el
// middleware para todo /api/admin: aquí no se repite.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ROLES: readonly string[] = ['owner', 'member', 'billing']

/** Activa o desactiva el portal de un cliente. */
export const PATCH: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const clientId = Number(data.clientId)
  if (!Number.isInteger(clientId)) return json(400, { error: 'clientId inválido' })
  if (typeof data.portalEnabled !== 'boolean') return json(400, { error: 'portalEnabled debe ser booleano' })

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return json(404, { error: 'cliente no encontrado' })

  await db.update(clients).set({ portalEnabled: data.portalEnabled }).where(eq(clients.id, clientId))

  // Apagar el portal corta las sesiones vivas sin tocarlas: resolveSession
  // comprueba `portalEnabled` en cada request, así que el efecto es inmediato.
  return json(200, { ok: true, portalEnabled: data.portalEnabled })
}

/** Invita a un usuario al portal de un cliente. */
export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const clientId = Number(data.clientId)
  if (!Number.isInteger(clientId)) return json(400, { error: 'clientId inválido' })

  const email = typeof data.email === 'string' ? data.email : ''
  if (!isValidEmail(email)) return json(400, { error: 'El correo no tiene un formato válido.' })

  const role = typeof data.role === 'string' && ROLES.includes(data.role) ? (data.role as 'owner' | 'member' | 'billing') : 'owner'
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : null

  // Invitar sin portal habilitado dejaría al invitado con un enlace que no
  // funciona (resolveToken exige portalEnabled). Se habilita aquí mismo: si
  // estoy invitando, es que quiero darle acceso.
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return json(404, { error: 'cliente no encontrado' })
  if (!client.portalEnabled) {
    await db.update(clients).set({ portalEnabled: true }).where(eq(clients.id, clientId))
  }

  const result = await inviteUser({ clientId, email, name, role, invitedBy: 'admin' })
  if (!result.ok) return json(400, { error: result.error })

  audit({ clientId, action: 'invite.sent', detail: `${email} · ${role} · desde el panel` })

  // El enlace se devuelve SIEMPRE, no solo cuando el correo falla: si Resend
  // está caído o aún no configuré el dominio, puedo pasárselo al cliente por
  // otro canal en vez de quedarme bloqueado.
  return json(201, {
    ok: true,
    url: result.url,
    emailSent: result.emailSent,
    emailError: result.emailError,
  })
}
