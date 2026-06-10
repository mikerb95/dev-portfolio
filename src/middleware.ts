import { defineMiddleware } from 'astro:middleware'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from './lib/auth'

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdmin) {
    const session = await getSession(context.request)
    if (!session) return context.redirect('/api/auth/signin')

    // Defensa en profundidad: revalida la allowlist en cada request.
    // Si la sesión trae login (logins nuevos), se exige que esté autorizado.
    const login = (session?.user as { login?: string } | undefined)?.login
    if (login && !isAllowedLogin(login)) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  const res = await next()

  if (isAdmin) {
    res.headers.set('X-Frame-Options', 'DENY')
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('Referrer-Policy', 'no-referrer')
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }

  // Páginas públicas: headers de seguridad base + caché en el edge de Vercel.
  // s-maxage solo aplica a la CDN (no al navegador); SWR sirve la copia vieja
  // mientras revalida, así el contenido editado en /admin tarda ≤5 min en verse.
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  const isPublicPage = !pathname.startsWith('/api') && context.request.method === 'GET'
  if (isPublicPage && res.status === 200 && !res.headers.has('Cache-Control')) {
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  }

  return res
})
