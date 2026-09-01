// Allowlist de logins de GitHub autorizados para el panel.
// Fuente única usada por el callback de auth y por el middleware (defensa en profundidad).

import { serverEnv } from './env'

export const ALLOWED_GITHUB_LOGINS = (serverEnv('ALLOWED_GITHUB_LOGINS') ?? 'mikerb95')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export const isAllowedLogin = (login?: string | null): boolean =>
  !!login && ALLOWED_GITHUB_LOGINS.includes(login.toLowerCase())
