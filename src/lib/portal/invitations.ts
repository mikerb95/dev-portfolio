// Invitaciones y restablecimiento de contraseña del portal.
//
// Los dos flujos son el mismo mecanismo con distinto TTL y distinta plantilla:
// un token de un solo uso que viaja por email y demuestra control del buzón.
// En la base solo vive el sha-256 del token — igual que las sesiones, un
// volcado de la tabla no permite entrar a nadie.
//
// Decisión importante en `startPasswordReset`: la respuesta al usuario es
// idéntica exista o no la cuenta. Un mensaje distinto convertiría el formulario
// en un oráculo para enumerar qué correos son clientes míos.

import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { clientInvitations, clientUsers, clients } from '../../db/schema'
import { sendInvitationEmail, sendResetEmail, SITE_URL } from '../email'
import type { PortalRole } from './session'

// 72h para invitar: da margen a un cliente que abre el correo el lunes.
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000
// 30 min para reset: aquí el buzón ya es un vector activo, así que corto.
export const RESET_TTL_MS = 30 * 60 * 1000

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const isValidEmail = (email: string): boolean => EMAIL_RE.test(normalizeEmail(email))

export type InviteResult =
  | { ok: true; url: string; emailSent: boolean; emailError?: string; userId: number }
  | { ok: false; error: string }

/**
 * Invita a una persona al portal de un cliente. Idempotente por email: invitar
 * dos veces al mismo correo reemplaza la invitación anterior en vez de crear un
 * segundo usuario (y el token viejo deja de servir).
 */
export async function inviteUser(params: {
  clientId: number
  email: string
  name?: string | null
  role?: PortalRole
  invitedBy: string
  now?: Date
}): Promise<InviteResult> {
  const now = params.now ?? new Date()
  const email = normalizeEmail(params.email)
  if (!isValidEmail(email)) return { ok: false, error: 'El correo no tiene un formato válido.' }

  const [client] = await db.select().from(clients).where(eq(clients.id, params.clientId)).limit(1)
  if (!client) return { ok: false, error: 'El cliente no existe.' }

  const role = params.role ?? 'member'

  // El email es UNIQUE global: si ya existe, tiene que ser de ESTE cliente.
  // Reasignar a alguien de una empresa a otra sería una fuga de tenant servida
  // en bandeja, así que se rechaza explícitamente.
  const [existing] = await db.select().from(clientUsers).where(eq(clientUsers.email, email)).limit(1)
  if (existing && existing.clientId !== params.clientId) {
    return { ok: false, error: 'Ese correo ya pertenece a otro cliente.' }
  }
  if (existing?.status === 'active') {
    return { ok: false, error: 'Ese usuario ya tiene acceso activo. Si perdió la contraseña, debe usar “olvidé mi contraseña”.' }
  }

  let userId: number
  if (existing) {
    await db
      .update(clientUsers)
      .set({ role, name: params.name ?? existing.name, status: 'invited' })
      .where(eq(clientUsers.id, existing.id))
    userId = existing.id
  } else {
    const [row] = await db
      .insert(clientUsers)
      .values({ clientId: params.clientId, email, name: params.name ?? null, role, status: 'invited', createdAt: now })
      .returning({ id: clientUsers.id })
    userId = row.id
  }

  // Las invitaciones anteriores de este correo mueren aquí: solo el último
  // enlace enviado debe funcionar.
  await db
    .update(clientInvitations)
    .set({ acceptedAt: now })
    .where(and(eq(clientInvitations.email, email), eq(clientInvitations.kind, 'invite'), isNull(clientInvitations.acceptedAt)))

  const token = randomBytes(32).toString('base64url')
  await db.insert(clientInvitations).values({
    clientId: params.clientId,
    clientUserId: userId,
    email,
    role,
    kind: 'invite',
    tokenHash: sha256(token),
    invitedBy: params.invitedBy,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    createdAt: now,
  })

  const url = `${SITE_URL}/portal/invitacion/${token}`
  const sent = await sendInvitationEmail({
    to: email,
    clientName: client.company ?? client.name,
    url,
    expiresHours: INVITE_TTL_MS / 3_600_000,
  })

  return { ok: true, url, emailSent: sent.ok, emailError: sent.skipped ? 'RESEND_API_KEY no configurada' : sent.error, userId }
}

/**
 * Arranca un restablecimiento. SIEMPRE resuelve sin revelar si el correo
 * existe; el llamador responde lo mismo en todos los casos.
 */
export async function startPasswordReset(params: { email: string; now?: Date }): Promise<void> {
  const now = params.now ?? new Date()
  const email = normalizeEmail(params.email)
  if (!isValidEmail(email)) return

  const [user] = await db.select().from(clientUsers).where(eq(clientUsers.email, email)).limit(1)
  // Cuenta inexistente o deshabilitada: se sale en silencio, sin pistas.
  if (!user || user.status === 'disabled') return

  await db
    .update(clientInvitations)
    .set({ acceptedAt: now })
    .where(and(eq(clientInvitations.email, email), eq(clientInvitations.kind, 'reset'), isNull(clientInvitations.acceptedAt)))

  const token = randomBytes(32).toString('base64url')
  await db.insert(clientInvitations).values({
    clientId: user.clientId,
    clientUserId: user.id,
    email,
    role: user.role,
    kind: 'reset',
    tokenHash: sha256(token),
    invitedBy: `user:${user.id}`,
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    createdAt: now,
  })

  await sendResetEmail({ to: email, url: `${SITE_URL}/portal/restablecer/${token}`, expiresMinutes: RESET_TTL_MS / 60_000 })
}

export type ResolvedToken = {
  invitationId: number
  clientUserId: number
  clientId: number
  email: string
  kind: 'invite' | 'reset'
  clientName: string
  userName: string | null
}

/**
 * Valida un token de invitación/reset. Null si no existe, ya se usó, caducó o
 * el usuario fue deshabilitado entretanto.
 */
export async function resolveToken(token: string | undefined, now = new Date()): Promise<ResolvedToken | null> {
  if (!token) return null

  const [row] = await db
    .select({
      invitationId: clientInvitations.id,
      clientUserId: clientInvitations.clientUserId,
      clientId: clientInvitations.clientId,
      email: clientInvitations.email,
      kind: clientInvitations.kind,
      expiresAt: clientInvitations.expiresAt,
      acceptedAt: clientInvitations.acceptedAt,
      clientName: clients.name,
      company: clients.company,
      portalEnabled: clients.portalEnabled,
      userStatus: clientUsers.status,
      userName: clientUsers.name,
    })
    .from(clientInvitations)
    .innerJoin(clients, eq(clientInvitations.clientId, clients.id))
    .leftJoin(clientUsers, eq(clientInvitations.clientUserId, clientUsers.id))
    .where(eq(clientInvitations.tokenHash, sha256(token)))
    .limit(1)

  if (!row || row.acceptedAt) return null
  if (row.expiresAt.getTime() <= now.getTime()) return null
  if (!row.portalEnabled) return null
  if (row.userStatus === 'disabled') return null
  if (row.clientUserId == null) return null

  return {
    invitationId: row.invitationId,
    clientUserId: row.clientUserId,
    clientId: row.clientId,
    email: row.email,
    kind: row.kind,
    clientName: row.company ?? row.clientName,
    userName: row.userName,
  }
}

/**
 * Consume el token: lo marca aceptado de forma atómica y devuelve si ganó la
 * carrera. El `WHERE … IS NULL` es lo que hace el "un solo uso" real — dos
 * clics simultáneos en el enlace del correo solo pueden acertar una vez.
 */
export async function consumeToken(invitationId: number, now = new Date()): Promise<boolean> {
  const res = await db
    .update(clientInvitations)
    .set({ acceptedAt: now })
    .where(and(eq(clientInvitations.id, invitationId), isNull(clientInvitations.acceptedAt)))
  return res.rowsAffected > 0
}
