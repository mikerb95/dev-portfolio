// Registro de sesiones de administrador por dispositivo.
//
// La auth es JWT (stateless): no hay store de sesión en servidor. Este módulo
// mantiene una tabla propia para poder (a) listar en qué dispositivos hay una
// sesión de admin abierta y (b) cerrarla remotamente (revocación).
//
// La identidad de la sesión es el `sid` que firmamos dentro del JWT al iniciar
// sesión (ver auth.config.ts). Como el JWT es una cookie por-navegador, cada
// dispositivo tiene su propio `sid`, y revocarlo no se puede eludir borrando la
// cookie `device_id` porque la comprobación se hace contra el JWT.

import { eq } from 'drizzle-orm'
import { db } from '../db'
import { adminSessions } from '../db/schema'

// Re-export de los helpers puros para no romper los sitios que ya los importan.
export { DEVICE_COOKIE, clientIp, describeDevice } from './device-info'

// Solo reescribimos `lastSeen` si el registro tiene más de este tiempo, para no
// hacer un write en cada request. La lectura sí ocurre en cada request de admin
// (barata en Turso) para que la revocación tenga efecto inmediato.
const WRITE_THROTTLE_MS = 5 * 60 * 1000

export type RecordResult = { revoked: boolean }

/**
 * Registra/actualiza la sesión del dispositivo actual y devuelve si está
 * revocada. Una sola lectura por request; escritura con throttle.
 */
export async function recordSession(params: {
  id: string
  login: string | null | undefined
  userAgent: string | null
  ip: string | null
}): Promise<RecordResult> {
  const now = new Date()
  const [existing] = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.id, params.id))
    .limit(1)

  if (existing?.revokedAt) return { revoked: true }

  if (!existing) {
    await db.insert(adminSessions).values({
      id: params.id,
      login: params.login ?? null,
      userAgent: params.userAgent,
      ip: params.ip,
      firstSeen: now,
      lastSeen: now,
    })
    return { revoked: false }
  }

  const stale = !existing.lastSeen || now.getTime() - existing.lastSeen.getTime() > WRITE_THROTTLE_MS
  if (stale) {
    await db
      .update(adminSessions)
      .set({ lastSeen: now, userAgent: params.userAgent, ip: params.ip, login: params.login ?? existing.login })
      .where(eq(adminSessions.id, params.id))
  }
  return { revoked: false }
}
