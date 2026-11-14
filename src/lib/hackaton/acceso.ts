// Quién puede escribir en el tablero de la hackatón (RF-047).
//
// La página es pública y la lectura también; escribir exige una de dos llaves:
// la sesión de administrador o el token del enlace del equipo. Las dos fallan
// CERRADAS: esto es autorización, no observabilidad, y en la duda el tablero
// queda en modo lectura (que es exactamente lo que ve cualquier visitante).

import type { AstroCookies } from 'astro'
import { eq } from 'drizzle-orm'
import { getSession } from 'auth-astro/server'
import { db } from '../../db'
import { adminSessions } from '../../db/schema'
import { isAllowedLogin } from '../auth'
import { resolveDeviceSessionId } from '../device-info'
import { tokenValido } from './store'

export const CABECERA_TOKEN = 'x-equipo-token'

export type Llave = 'admin' | 'equipo' | null

/**
 * Sesión de admin VIGENTE. Esta ruta no pasa por el gate de /admin del
 * middleware, así que la revocación de sesiones hay que mirarla aquí: sin esto
 * una cookie revocada desde el panel seguiría escribiendo en el tablero.
 * Se exige que la sesión ya exista en admin_sessions (la registra el
 * middleware al entrar a /admin), no se da de alta desde aquí.
 */
export async function esAdminVigente(request: Request, cookies: AstroCookies): Promise<boolean> {
  try {
    const sesion = await getSession(request)
    const login = (sesion?.user as { login?: string } | undefined)?.login
    if (!sesion || !isAllowedLogin(login)) return false
    const sid = (sesion as { sid?: string }).sid
    const id = resolveDeviceSessionId(sid, cookies)
    const [fila] = await db
      .select({ revokedAt: adminSessions.revokedAt })
      .from(adminSessions)
      .where(eq(adminSessions.id, id))
      .limit(1)
    return Boolean(fila) && !fila.revokedAt
  } catch {
    return false
  }
}

export async function llaveDe(request: Request, cookies: AstroCookies): Promise<Llave> {
  const token = request.headers.get(CABECERA_TOKEN)
  if (token && (await tokenValido(token))) return 'equipo'
  if (await esAdminVigente(request, cookies)) return 'admin'
  return null
}
