// Allowlist de cuentas de GitHub autorizadas para el panel.
// Fuente única usada por el callback de auth y por el middleware (defensa en profundidad).

import { serverEnv } from './env'

export const ALLOWED_GITHUB_LOGINS = (serverEnv('ALLOWED_GITHUB_LOGINS') ?? 'mikerb95')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export const isAllowedLogin = (login?: string | null): boolean =>
  !!login && ALLOWED_GITHUB_LOGINS.includes(login.toLowerCase())

// Ids numéricos de GitHub autorizados. El login se puede cambiar, y GitHub
// libera el nombre viejo para que lo reclame cualquiera: con una allowlist solo
// por login, renombrar la cuenta le daría el panel a quien se quedara con
// `mikerb95`. El id no cambia nunca, así que es lo que decide en el login con
// GitHub; el login sigue siendo la identidad legible del resto del panel
// (sesiones, llaves). 69970540 es el id de @mikerb95.
export const ALLOWED_GITHUB_IDS = (serverEnv('ALLOWED_GITHUB_IDS') ?? '69970540')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const isAllowedGithubId = (id?: string | number | null): boolean =>
  (typeof id === 'number' || typeof id === 'string') && ALLOWED_GITHUB_IDS.includes(String(id))

/**
 * Ventana de "login reciente" para las acciones que dan acceso permanente
 * (dar de alta una llave de seguridad). Un JWT robado sirve mientras no se
 * revoque; una llave registrada con él sobreviviría a esa revocación. Pedir
 * haber entrado hace poco obliga a pasar otra vez por GitHub o por una llave
 * existente, que es justo lo que quien roba una cookie no tiene.
 */
export const RECENT_AUTH_MS = 10 * 60_000

// Margen para relojes de instancias distintas: el `authTime` lo pone la
// función que emitió el JWT y lo lee otra, que puede ir unos segundos detrás.
const CLOCK_SKEW_MS = 60_000

export function isRecentAuth(authTime: unknown, now = Date.now()): boolean {
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) return false
  return now - authTime <= RECENT_AUTH_MS && authTime - now <= CLOCK_SKEW_MS
}
