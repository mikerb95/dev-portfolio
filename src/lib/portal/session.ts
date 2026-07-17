// Sesiones del portal de clientes.
//
// Deliberadamente NO reutiliza la auth del admin (JWT de Auth.js). Son dos
// poblaciones distintas con dos superficies de riesgo distintas: una sesión de
// cliente jamás debe poder convertirse en una de admin por un bug de callback,
// y la cookie es otra, así que ni siquiera viajan juntas.
//
// El token es opaco (256 bits de aleatoriedad) y en la base solo vive su
// sha-256. Esto significa que un volcado de `portal_sessions` no permite
// suplantar a nadie, y que revocar es un UPDATE con efecto inmediato — sin la
// ventana de "el JWT sigue siendo válido hasta que expire" que tiene el admin.

import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { APIContext } from 'astro'
import { db } from '../../db'
import { clientUsers, clients, portalSessions } from '../../db/schema'

export const PORTAL_COOKIE = 'portal_session'

// 30 días con renovación deslizante: cómodo para un cliente que entra una vez
// al mes a mirar su factura, y aun así revocable en un clic.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// No reescribimos `lastSeen` en cada request: solo si el registro ya está rancio.
const WRITE_THROTTLE_MS = 5 * 60 * 1000

export type PortalRole = 'owner' | 'member' | 'billing'

export type PortalSession = {
  sessionId: string
  user: {
    id: number
    email: string
    name: string | null
    role: PortalRole
  }
  client: {
    id: number
    name: string
    company: string | null
    logoUrl: string | null
  }
  /** Login de admin si esta sesión es "ver como cliente"; null en una entrada real. */
  impersonatedBy: string | null
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

/** El id de sesión es el hash del token; el token en claro solo lo tiene el navegador. */
export const sessionIdFromToken = (token: string): string => sha256(token)

/**
 * Crea la sesión y devuelve el token en claro (única vez que existe fuera del
 * navegador). El llamador lo pone en la cookie con `setSessionCookie`.
 */
export async function createSession(params: {
  clientUserId: number
  ip?: string | null
  userAgent?: string | null
  now?: Date
}): Promise<string> {
  const now = params.now ?? new Date()
  const token = randomBytes(32).toString('base64url')
  await db.insert(portalSessions).values({
    id: sessionIdFromToken(token),
    clientUserId: params.clientUserId,
    ip: params.ip ?? null,
    userAgent: params.userAgent?.slice(0, 300) ?? null,
    createdAt: now,
    lastSeen: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  })
  return token
}

type CookieSetter = {
  set: (name: string, value: string, opts: Record<string, unknown>) => void
  delete: (name: string, opts?: Record<string, unknown>) => void
}

export function setSessionCookie(cookies: CookieSetter, token: string): void {
  cookies.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function clearSessionCookie(cookies: CookieSetter): void {
  cookies.delete(PORTAL_COOKIE, { path: '/' })
}

/**
 * Resuelve la sesión a partir de la cookie: valida vigencia, revocación y que
 * el usuario siga activo y su cliente siga con portal habilitado.
 *
 * Devuelve null ante cualquier duda. Deshabilitar un usuario o apagar el portal
 * de un cliente tiene efecto en el siguiente request, sin esperar a que expire
 * la sesión — por eso el JOIN se hace aquí y no se cachea en la cookie.
 */
export async function resolveSession(token: string | undefined | null, now = new Date()): Promise<PortalSession | null> {
  if (!token) return null

  const id = sessionIdFromToken(token)
  const [row] = await db
    .select({
      sessionId: portalSessions.id,
      expiresAt: portalSessions.expiresAt,
      revokedAt: portalSessions.revokedAt,
      lastSeen: portalSessions.lastSeen,
      userId: clientUsers.id,
      email: clientUsers.email,
      name: clientUsers.name,
      role: clientUsers.role,
      status: clientUsers.status,
      clientId: clients.id,
      clientName: clients.name,
      company: clients.company,
      logoUrl: clients.logoUrl,
      portalEnabled: clients.portalEnabled,
    })
    .from(portalSessions)
    .innerJoin(clientUsers, eq(portalSessions.clientUserId, clientUsers.id))
    .innerJoin(clients, eq(clientUsers.clientId, clients.id))
    .where(eq(portalSessions.id, id))
    .limit(1)

  if (!row) return null
  if (row.revokedAt) return null
  if (row.expiresAt.getTime() <= now.getTime()) return null
  if (row.status !== 'active') return null
  if (!row.portalEnabled) return null

  // Renovación deslizante: cada uso empuja la expiración. Con throttle para no
  // escribir en cada request.
  if (now.getTime() - row.lastSeen.getTime() > WRITE_THROTTLE_MS) {
    await db
      .update(portalSessions)
      .set({ lastSeen: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(portalSessions.id, id))
      .catch(() => {})
  }

  return {
    sessionId: row.sessionId,
    user: { id: row.userId, email: row.email, name: row.name, role: row.role as PortalRole },
    client: { id: row.clientId, name: row.clientName, company: row.company, logoUrl: row.logoUrl },
  }
}

/** Lee la sesión del request actual. Null si no hay o no es válida. */
export const getPortalSession = (context: APIContext | { cookies: { get: (n: string) => { value: string } | undefined } }) =>
  resolveSession(context.cookies.get(PORTAL_COOKIE)?.value)

/**
 * Puerta de entrada de todo endpoint del portal: o hay sesión, o hay Response.
 *
 * Este helper es el ÚNICO lugar del que debe salir un `clientId` para las
 * queries del portal. Tomarlo de la URL o del body sería exactamente la fuga
 * entre tenants que todo el diseño trata de hacer imposible.
 */
export async function requirePortalSession(
  context: APIContext
): Promise<{ session: PortalSession; response?: never } | { session?: never; response: Response }> {
  const session = await getPortalSession(context)
  if (!session) {
    return {
      response: new Response(JSON.stringify({ error: 'sesión requerida' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    }
  }
  return { session }
}

/** Igual que requirePortalSession, pero además exige uno de los roles dados. */
export async function requireRole(
  context: APIContext,
  roles: readonly PortalRole[]
): Promise<{ session: PortalSession; response?: never } | { session?: never; response: Response }> {
  const result = await requirePortalSession(context)
  if (result.response) return result
  if (!roles.includes(result.session.user.role)) {
    return {
      response: new Response(JSON.stringify({ error: 'no tienes permiso para esta acción' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    }
  }
  return result
}

/** Revoca una sesión concreta (cerrar sesión, o "cerrar en este dispositivo"). */
export async function revokeSession(sessionId: string, now = new Date()): Promise<void> {
  await db.update(portalSessions).set({ revokedAt: now }).where(eq(portalSessions.id, sessionId))
}

/**
 * Revoca todas las sesiones de un usuario. Se llama tras cambiar la contraseña
 * o restablecerla: si alguien entró con la contraseña vieja, pierde el acceso
 * en ese mismo instante.
 */
export async function revokeAllSessions(clientUserId: number, opts?: { except?: string; now?: Date }): Promise<void> {
  const now = opts?.now ?? new Date()
  await db
    .update(portalSessions)
    .set({ revokedAt: now })
    .where(and(eq(portalSessions.clientUserId, clientUserId), isNull(portalSessions.revokedAt)))

  // Reactivar la sesión actual, si se pidió conservarla (cambio de contraseña
  // desde el propio portal: no tiene sentido echar a quien la está cambiando).
  if (opts?.except) {
    await db.update(portalSessions).set({ revokedAt: null }).where(eq(portalSessions.id, opts.except))
  }
}

/** Lista las sesiones vivas de un usuario (pantalla "dispositivos conectados"). */
export async function listSessions(clientUserId: number, now = new Date()) {
  const rows = await db
    .select()
    .from(portalSessions)
    .where(and(eq(portalSessions.clientUserId, clientUserId), isNull(portalSessions.revokedAt)))
  return rows.filter((r) => r.expiresAt.getTime() > now.getTime()).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
}
