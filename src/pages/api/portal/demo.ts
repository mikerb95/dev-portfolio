import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db, demoAvailable, runInDemoContext } from '../../../db'
import { clientUsers } from '../../../db/schema'
import { createSession, setSessionCookie } from '../../../lib/portal/session'
import { createPortalDemoToken, PORTAL_DEMO_COOKIE, PORTAL_DEMO_EMAIL } from '../../../lib/portal/demo'

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
export const GET: APIRoute = async ({ cookies, redirect }) => {
  if (!demoAvailable) return redirect('/portal/login?m=demo-unavailable')

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
    // Base de demo configurada pero sin sembrar todavía, o caída: no hay nada
    // que el visitante pueda hacer, así que se le explica en vez de un 500 seco.
    return redirect('/portal/login?m=demo-unavailable')
  }
}
