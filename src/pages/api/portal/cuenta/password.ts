import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { clientUsers } from '../../../../db/schema'
import { requirePortalSession, revokeAllSessions } from '../../../../lib/portal/session'
import { hashPassword, passwordProblem, verifyPassword } from '../../../../lib/portal/passwords'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Cambia la contraseña desde dentro del portal.
 *
 * Exige la actual aunque ya haya sesión: una sesión robada (equipo prestado,
 * portátil abierto) no debe poder quedarse con la cuenta para siempre. Pedir la
 * actual es lo que convierte "tengo tu sesión un rato" en algo temporal.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requirePortalSession(context)
  if (auth.response) return auth.response
  const { session } = auth

  // La contraseña actual se puede adivinar desde aquí igual que en el login:
  // este límite le quita el oxígeno a ese camino alternativo.
  const { allowed } = await enforceLimit(`portal-pwd:${session.user.id}`, { limit: 10, windowMs: 15 * 60_000 })
  if (!allowed) return json(429, { error: 'Demasiados intentos. Espera unos minutos.' })

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const current = typeof data.current === 'string' ? data.current : ''
  const next = typeof data.next === 'string' ? data.next : ''

  const problem = passwordProblem(next)
  if (problem) return json(400, { error: problem })

  const [user] = await db.select().from(clientUsers).where(eq(clientUsers.id, session.user.id)).limit(1)
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    return json(400, { error: 'La contraseña actual no es correcta.' })
  }

  if (await verifyPassword(next, user.passwordHash)) {
    return json(400, { error: 'La contraseña nueva debe ser distinta de la actual.' })
  }

  await db
    .update(clientUsers)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(clientUsers.id, session.user.id))

  // Fuera todos los demás dispositivos: si alguien tenía la contraseña vieja,
  // aquí pierde el acceso. La sesión actual sobrevive (`except`) para no echar
  // a quien acaba de hacer lo correcto.
  await revokeAllSessions(session.user.id, { except: session.sessionId })

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'password.changed',
    ip: clientIp(context.request.headers),
  })

  return json(200, { ok: true })
}
