import { defineMiddleware } from 'astro:middleware'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from './lib/auth'
import { maybeChaos } from './lib/chaos'
import { clientIp } from './lib/device-info'
import { DEVICE_COOKIE, recordSession } from './lib/device-sessions'

// Cookies del JWT de Auth.js a borrar cuando se revoca una sesión (dev y prod).
const AUTH_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url

  // LAB · chaos engineering: fallos inyectados por flags con TTL (máx 15 min).
  // Fail-open y con /admin, /api/admin y /api/auth excluidos por código:
  // sin flags activos este camino cuesta una lectura cacheada cada ~5s.
  const chaosResponse = await maybeChaos(pathname)
  if (chaosResponse) return chaosResponse

  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdmin) {
    const session = await getSession(context.request)
    if (!session) return context.redirect('/login?callbackUrl=%2Fentrar')

    // Defensa en profundidad: revalida la allowlist en cada request.
    const login = (session?.user as { login?: string } | undefined)?.login
    if (!isAllowedLogin(login)) {
      return new Response('Forbidden', { status: 403 })
    }

    // Registro de dispositivo: identidad = `sid` del JWT si existe (sesiones
    // nuevas), o cookie `device_id` como respaldo (sesiones previas). Si la
    // sesión fue revocada desde el panel, se borra el JWT y se fuerza re-login.
    const sid = (session as { sid?: string } | undefined)?.sid
    let deviceCookie = context.cookies.get(DEVICE_COOKIE)?.value
    if (!deviceCookie) {
      deviceCookie = crypto.randomUUID()
      context.cookies.set(DEVICE_COOKIE, deviceCookie, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: import.meta.env.PROD,
        maxAge: 60 * 60 * 24 * 365,
      })
    }
    const sessionId = sid ?? deviceCookie
    try {
      const { revoked } = await recordSession({
        id: sessionId,
        login,
        userAgent: context.request.headers.get('user-agent'),
        ip: clientIp(context.request.headers),
      })
      if (revoked) {
        for (const name of AUTH_COOKIES) context.cookies.delete(name, { path: '/' })
        return context.redirect('/entrar?revoked=1')
      }
    } catch {
      // Fail-open: un fallo del registro de sesiones no debe tumbar el panel.
    }
  }

  const res = await next()
  const headers = new Headers(res.headers)

  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  if (isAdmin) {
    headers.set('X-Frame-Options', 'DENY')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('X-Robots-Tag', 'noindex, nofollow')
    headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    return new Response(res.body, { status: res.status, headers })
  }

  // Páginas públicas: headers de seguridad base + caché en el edge de Vercel.
  // s-maxage solo aplica a la CDN (no al navegador); SWR sirve la copia vieja
  // mientras revalida, así el contenido editado en /admin tarda ≤5 min en verse.
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  )

  const isPublicPage = !pathname.startsWith('/api') && context.request.method === 'GET'
  if (isPublicPage && res.status === 200 && !headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  }

  return new Response(res.body, { status: res.status, headers })
})
