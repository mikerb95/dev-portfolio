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

import { and, eq, isNull, lt } from 'drizzle-orm'
import { db } from '../db'
import { adminSessions } from '../db/schema'
import { describeDevice } from './device-info'
import { sendPush } from './notify'
import { siteUrl } from './site'
import { recordSecurityEvent } from './security/events'

// Re-export de los helpers puros para no romper los sitios que ya los importan.
export { DEVICE_COOKIE, clientIp, describeDevice } from './device-info'

// Solo reescribimos `lastSeen` si el registro tiene más de este tiempo, para no
// hacer un write en cada request. La lectura sí ocurre en cada request de admin
// (barata en Turso) para que la revocación tenga efecto inmediato.
const WRITE_THROTTLE_MS = 5 * 60 * 1000

// Ventana de inactividad: una sesión sin actividad en 24h se revoca sola.
// Se aplica en recordSession (efecto inmediato al volver el dispositivo) y en
// el barrido del cron (mantiene la lista del panel al día).
const IDLE_EXPIRY_MS = 24 * 60 * 60 * 1000

// Las sesiones revocadas se conservan un tiempo (auditoría) y luego se purgan.
const REVOKED_RETENTION_DAYS = 90

const SITE_URL = siteUrl()

export type RecordResult = { revoked: boolean }

/**
 * Registra/actualiza la sesión del dispositivo actual y devuelve si está
 * revocada. Una sola lectura por request; escritura con throttle.
 *
 * Solo LANZA si no puede leer la fila, que es el único caso en que no se sabe
 * si la sesión fue revocada: el middleware responde a eso cerrando el panel.
 * Las escrituras (última actividad, alta, expiración) son contabilidad y se
 * tragan sus fallos: con la cuota de escrituras de Turso agotada la lectura
 * sigue funcionando, y dejar fuera al admin por no poder anotar la hora de su
 * visita sería cerrar el panel sin motivo.
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

  // Expiración por inactividad: si el dispositivo vuelve tras >24h sin
  // actividad, la sesión se revoca aquí mismo aunque el cron no haya barrido.
  if (existing?.lastSeen && now.getTime() - existing.lastSeen.getTime() > IDLE_EXPIRY_MS) {
    await db
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(eq(adminSessions.id, params.id))
      .catch(() => {})
    return { revoked: true }
  }

  if (!existing) {
    const registrada = await db
      .insert(adminSessions)
      .values({
        id: params.id,
        login: params.login ?? null,
        userAgent: params.userAgent,
        ip: params.ip,
        firstSeen: now,
        lastSeen: now,
      })
      .then(
        () => true,
        () => false
      )
    // Sin fila no hay aviso: el siguiente request reintenta el alta, y avisar
    // en cada uno llenaría el teléfono de "Nueva sesión" por un solo login.
    if (!registrada) return { revoked: false }
    // Alerta de seguridad: dispositivo nunca visto con sesión de admin.
    // Best-effort: un fallo del push no debe bloquear el request.
    await sendPush(
      'Nueva sesión de admin',
      `${describeDevice(params.userAgent)} · IP ${params.ip ?? 'desconocida'} · @${params.login ?? '?'}`,
      { priority: 4, tags: 'key', click: `${SITE_URL}/admin/sessions` }
    ).catch(() => {})
    // Y al micro-SIEM, que es donde queda el historial: el push se pierde en el
    // teléfono. Una sesión nueva es un login nuevo (GitHub o llave), porque el
    // `sid` nace al firmar el JWT. El login va tras la almohadilla de la ruta:
    // la tabla no tiene columna de detalle.
    await recordSecurityEvent({
      ip: params.ip,
      classification: { category: 'admin_action', severity: 'low', ruleId: 'admin.login' },
      method: 'GET',
      path: `/admin#@${params.login ?? '?'}`,
      userAgent: params.userAgent,
      statusCode: 200,
    })
    return { revoked: false }
  }

  const stale = !existing.lastSeen || now.getTime() - existing.lastSeen.getTime() > WRITE_THROTTLE_MS
  if (stale) {
    await db
      .update(adminSessions)
      .set({ lastSeen: now, userAgent: params.userAgent, ip: params.ip, login: params.login ?? existing.login })
      .where(eq(adminSessions.id, params.id))
      .catch(() => {})
  }
  return { revoked: false }
}

/**
 * Barrido para el cron: revoca sesiones con >24h de inactividad (para que
 * desaparezcan del panel sin esperar a que el dispositivo vuelva) y purga las
 * revocadas hace más de 90 días.
 */
export async function sweepSessions(now = new Date()): Promise<void> {
  const idleCutoff = new Date(now.getTime() - IDLE_EXPIRY_MS)
  await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(and(isNull(adminSessions.revokedAt), lt(adminSessions.lastSeen, idleCutoff)))

  const purgeCutoff = new Date(now.getTime() - REVOKED_RETENTION_DAYS * 86_400_000)
  await db.delete(adminSessions).where(lt(adminSessions.revokedAt, purgeCutoff))
}
