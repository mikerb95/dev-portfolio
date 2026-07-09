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

export const DEVICE_COOKIE = 'device_id'
// Solo reescribimos `lastSeen` si el registro tiene más de este tiempo, para no
// hacer un write en cada request. La lectura sí ocurre en cada request de admin
// (barata en Turso) para que la revocación tenga efecto inmediato.
const WRITE_THROTTLE_MS = 5 * 60 * 1000

/** IP del cliente a partir de los headers de proxy de Vercel. */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return headers.get('x-real-ip') || null
}

/** Etiqueta legible "Navegador · SO" a partir del User-Agent. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return 'Dispositivo desconocido'
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari'
    : 'Navegador'
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'SO desconocido'
  return `${browser} · ${os}`
}

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
