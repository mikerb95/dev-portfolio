import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../../../db'
import { adminSessions } from '../../../db/schema'
import { recordAdminEvent } from '../../../lib/security/events'

/** Sesiones de admin activas (no revocadas), más reciente primero. */
export const GET: APIRoute = async () => {
  const rows = await db
    .select()
    .from(adminSessions)
    .where(isNull(adminSessions.revokedAt))
    .orderBy(desc(adminSessions.lastSeen))
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Revoca una sesión (`{ id }`), todas menos la actual
 * (`{ others: true, currentId }`) o la propia (`{ self: true }`, al cerrar
 * sesión). El middleware borrará el JWT del dispositivo revocado en su
 * siguiente request.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const now = new Date()

  // Cerrar sesión. signOut() de Auth.js solo borra la cookie de ESTE navegador:
  // una copia del JWT (equipo prestado, extensión) seguía valiendo, y como cada
  // uso la mantiene activa, ni la expiración por inactividad la cortaba. El id
  // sale del JWT firmado, nunca del body: solo se puede cerrar la propia.
  if (body?.self === true) {
    const session = await getSession(request)
    const sid = (session as { sid?: string } | null)?.sid
    if (!sid) return new Response(JSON.stringify({ error: 'sesión sin id' }), { status: 400 })
    await db
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.id, sid), isNull(adminSessions.revokedAt)))
    await recordAdminEvent(request, 'session.logout')
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  if (body?.others === true) {
    const currentId = typeof body.currentId === 'string' ? body.currentId : ''
    await db
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(
        and(
          isNull(adminSessions.revokedAt),
          currentId ? ne(adminSessions.id, currentId) : undefined
        )
      )
    await recordAdminEvent(request, 'sessions.revoked_others', { severity: 'medium' })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })
  await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(and(eq(adminSessions.id, id), isNull(adminSessions.revokedAt)))
  await recordAdminEvent(request, 'session.revoked', { severity: 'medium' })
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
