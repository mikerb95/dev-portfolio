import type { APIRoute } from 'astro'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../../../db'
import { adminSessions } from '../../../db/schema'

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
 * Revoca una sesión (`{ id }`) o todas menos la actual
 * (`{ others: true, currentId }`). El middleware borrará el JWT del dispositivo
 * revocado en su siguiente request.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const now = new Date()

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
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })
  await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(and(eq(adminSessions.id, id), isNull(adminSessions.revokedAt)))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
