import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db, demoAvailable, runInDemoContext } from '../../../db'
import { clientUsers } from '../../../db/schema'
import { createSession, setSessionCookie } from '../../../lib/portal/session'
import { createPortalDemoToken, PORTAL_DEMO_COOKIE, PORTAL_DEMO_EMAIL } from '../../../lib/portal/demo'
import { crearPaseRespaldo, PORTAL_RESPALDO_COOKIE } from '../../../lib/portal/respaldo'
import { serverEnv } from '../../../lib/env'

/**
 * Entrada a la demo pública del portal. Un GET simple (navegación normal desde
 * un <a>, sin JS) que:
 *  1. Crea una sesión de portal de verdad, pero DENTRO de runInDemoContext, así
 *     que el INSERT (y toda lectura que siga) va a la base de demo.
 *  2. Deja dos cookies: `portal_session` (la sesión, igual que un login real) y
 *     `portal_demo_pass` (el pase que el middleware necesita para reconstruir
 *     ese mismo contexto de demo en cada request siguiente).
 *
 * Si la demo no está configurada (falta TURSO_DEMO_URL), no existe: mismo
 * criterio que la demo del admin.
 */
/**
 * Entrada al modo respaldo: emite el pase firmado y manda al portal, que a
 * partir de ahí se sirve del snapshot versionado. Solo se llama cuando ya se
 * comprobó que la base no responde, nunca como primera opción.
 */
function entrarEnRespaldo(cookies: Parameters<APIRoute>[0]['cookies'], redirect: Parameters<APIRoute>[0]['redirect']) {
  cookies.set(PORTAL_RESPALDO_COOKIE, crearPaseRespaldo(serverEnv('AUTH_SECRET')), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60,
  })
  return redirect('/portal')
}

export const GET: APIRoute = async ({ cookies, redirect }) => {
  // Sin base de demo configurada no hay nada vivo que intentar, pero el
  // snapshot no necesita base: es exactamente el caso para el que existe.
  if (!demoAvailable) return entrarEnRespaldo(cookies, redirect)

  try {
    const token = await runInDemoContext(async () => {
      const [user] = await db
        .select({ id: clientUsers.id })
        .from(clientUsers)
        .where(eq(clientUsers.email, PORTAL_DEMO_EMAIL))
        .limit(1)
      if (!user) throw new Error('usuario de demo no sembrado')
      return createSession({ clientUserId: user.id })
    })

    setSessionCookie(cookies, token)
    cookies.set(PORTAL_DEMO_COOKIE, createPortalDemoToken(import.meta.env.AUTH_SECRET), {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60,
    })
    return redirect('/portal')
  } catch {
    // Base de demo configurada pero sin sembrar, o caída (la cuota de Turso es
    // por organización, así que se agota a la vez que la principal). Antes esto
    // era un callejón sin salida; ahora cae al snapshot versionado, que enseña
    // el mismo recorrido sin tocar ninguna base. Se apaga solo: en cuanto la
    // consulta de arriba vuelva a funcionar, no se llega hasta aquí.
    return entrarEnRespaldo(cookies, redirect)
  }
}
