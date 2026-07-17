import type { APIRoute } from 'astro'
import { and, eq } from 'drizzle-orm'
import { getSession } from 'auth-astro/server'
import { db } from '../../../../../db'
import { clientUsers, clients } from '../../../../../db/schema'
import { createSession, setSessionCookie } from '../../../../../lib/portal/session'
import { audit } from '../../../../../lib/portal/audit'
import { clientIp } from '../../../../../lib/device-info'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * "Ver como cliente": crea una sesión real del portal (no la de demo, no una
 * base separada) para el primer usuario activo del cliente, marcada como
 * impersonación. El middleware la vuelve de solo lectura por ese marcador; ver
 * el comentario junto al gate del portal.
 *
 * El login de admin queda grabado en la propia fila de sesión
 * (`impersonatedBy`) y en el log de auditoría del cliente — ambos con la
 * identidad de QUIÉN entró, no solo que alguien entró.
 */
export const POST: APIRoute = async (context) => {
  // El middleware ya exige sesión de admin para todo /api/admin/*, pero el
  // login concreto (para el audit log) hay que leerlo aquí.
  const session = await getSession(context.request)
  const login = (session?.user as { login?: string } | undefined)?.login ?? 'admin'

  const clientId = Number(context.params.id)
  if (!Number.isInteger(clientId)) return json(400, { error: 'cliente inválido' })

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return json(404, { error: 'cliente no encontrado' })
  if (!client.portalEnabled) return json(400, { error: 'este cliente no tiene el portal habilitado' })

  // Prefiere un owner activo; si no hay, cualquier usuario activo. Sin ninguno,
  // no hay a quién "ver como" — el cliente no ha aceptado ninguna invitación.
  const users = await db
    .select({ id: clientUsers.id, role: clientUsers.role })
    .from(clientUsers)
    .where(and(eq(clientUsers.clientId, clientId), eq(clientUsers.status, 'active')))

  const target = users.find((u) => u.role === 'owner') ?? users[0]
  if (!target) return json(400, { error: 'este cliente todavía no tiene ningún usuario activo' })

  const token = await createSession({
    clientUserId: target.id,
    ip: clientIp(context.request.headers),
    userAgent: context.request.headers.get('user-agent'),
    impersonatedBy: login,
  })
  setSessionCookie(context.cookies, token)

  audit({
    clientId,
    clientUserId: target.id,
    action: 'impersonate.start',
    detail: `admin: ${login}`,
    ip: clientIp(context.request.headers),
  })

  return json(200, { ok: true, redirect: '/portal' })
}
