import { defineMiddleware } from 'astro:middleware'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from './lib/auth'

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdmin) {
    const session = await getSession(context.request)
    if (!session) return context.redirect('/login?callbackUrl=%2Fentrar')

    // Defensa en profundidad: revalida la allowlist en cada request.
    // Si la sesión trae login (logins nuevos), se exige que esté autorizado.
    const login = (session?.user as { login?: string } | undefined)?.login
    if (login && !isAllowedLogin(login)) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  const res = await next()
  const headers = new Headers(res.headers)

  if (isAdmin) {
    headers.set('X-Frame-Options', 'DENY')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('X-Robots-Tag', 'noindex, nofollow')
    return new Response(res.body, { status: res.status, headers })
  }

  // Páginas públicas: headers de seguridad base + caché en el edge de Vercel.
  // s-maxage solo aplica a la CDN (no al navegador); SWR sirve la copia vieja
  // mientras revalida, así el contenido editado en /admin tarda ≤5 min en verse.
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  const isPublicPage = !pathname.startsWith('/api') && context.request.method === 'GET'
  if (isPublicPage && res.status === 200 && !headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  }

  return new Response(res.body, { status: res.status, headers })
})
