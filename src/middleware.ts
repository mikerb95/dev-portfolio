import { defineMiddleware } from 'astro:middleware'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from './lib/auth'
import { maybeChaos } from './lib/chaos'
import { clientIp } from './lib/device-info'
import { DEVICE_COOKIE, recordSession } from './lib/device-sessions'
import { observeRequest, recordEnforcementEvent } from './lib/security/sensor'
import { isBlocked } from './lib/security/blocklist'
import { enforceLimit } from './lib/security/ratelimit-durable'
import { isAuthPath, isRateLimitablePath } from './lib/security/paths'

// Cookies del JWT de Auth.js a borrar cuando se revoca una sesión (dev y prod).
const AUTH_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url

  // LAB · chaos engineering: fallos inyectados por flags con TTL (máx 15 min).
  // Fail-open y con /admin, /api/admin y /api/auth excluidos por código:
  // sin flags activos este camino cuesta una lectura cacheada cada ~5s.
  const chaosResponse = await maybeChaos(pathname)
  if (chaosResponse) return chaosResponse

  // Sensor de seguridad (micro-SIEM). FASE 0: solo observa y registra requests
  // hostiles según el clasificador de firmas; no bloquea. Síncrono y no-op para
  // el 99% del tráfico (regex/lookup en memoria); la escritura es fire-and-forget.
  // Ver docs/plan-security-observability.md.
  const method = context.request.method
  const query = context.url.search.replace(/^\?/, '')
  const reqHeaders = context.request.headers

  observeRequest({ method, path: pathname, query, headers: reqHeaders })

  // Enforcement de seguridad (FASE 1). Todo el bloque es fail-open: cualquier
  // fallo deja pasar el request (nunca tumbamos el sitio por el enforcement).
  const ip = clientIp(reqHeaders)

  // 1) Blocklist: una IP bloqueada (manual o auto) recibe 403 seco, sin pistas.
  //    La lectura está cacheada 30s en memoria (isBlocked); la allowlist protege
  //    al admin. Lista vacía hasta que la Fase 2 o el panel añadan bloqueos.
  if (await isBlocked(ip)) {
    recordEnforcementEvent({
      category: 'blocklist',
      severity: 'high',
      ruleId: 'blocklist.hit',
      action: 'blocked',
      statusCode: 403,
      method,
      path: pathname,
      query,
      headers: reqHeaders,
    })
    return new Response('Forbidden', { status: 403 })
  }

  // 2) Rate limit de dos capas (memoria → durable). Solo consulta Turso cuando
  //    el contador local entra en la zona de peligro (deferUntil).
  if (ip) {
    // Endpoints de autenticación: objetivo típico de fuerza bruta. Un humano
    // legítimo nunca hace 30 requests/min aquí → excederlo es sondeo.
    if (isAuthPath(pathname)) {
      const r = await enforceLimit(`auth:${ip}`, { limit: 30, windowMs: 60_000, deferUntil: 0.5 })
      if (!r.allowed) {
        recordEnforcementEvent({
          category: 'auth_probing',
          severity: 'high',
          ruleId: 'ratelimit.auth',
          action: 'rate_limited',
          statusCode: 429,
          method,
          path: pathname,
          query,
          headers: reqHeaders,
        })
        return new Response(JSON.stringify({ error: 'demasiados intentos, espera un minuto' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        })
      }
    }

    // Paraguas global anti-scraping agresivo. Límite generoso para no rozar a
    // usuarios reales; solo cuenta rutas dinámicas (no assets estáticos).
    if (isRateLimitablePath(pathname)) {
      const r = await enforceLimit(`ip:${ip}`, { limit: 600, windowMs: 60_000, deferUntil: 0.8 })
      if (!r.allowed) {
        recordEnforcementEvent({
          category: 'api_abuse',
          severity: 'medium',
          ruleId: 'ratelimit.global',
          action: 'rate_limited',
          statusCode: 429,
          method,
          path: pathname,
          query,
          headers,
        })
        return new Response(JSON.stringify({ error: 'demasiadas solicitudes' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        })
      }
    }
  }

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
  const resHeaders = new Headers(res.headers)

  resHeaders.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  if (isAdmin) {
    resHeaders.set('X-Frame-Options', 'DENY')
    resHeaders.set('X-Content-Type-Options', 'nosniff')
    resHeaders.set('Referrer-Policy', 'no-referrer')
    resHeaders.set('X-Robots-Tag', 'noindex, nofollow')
    resHeaders.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    return new Response(res.body, { status: res.status, headers: resHeaders })
  }

  // Páginas públicas: headers de seguridad base + caché en el edge de Vercel.
  // s-maxage solo aplica a la CDN (no al navegador); SWR sirve la copia vieja
  // mientras revalida, así el contenido editado en /admin tarda ≤5 min en verse.
  resHeaders.set('X-Content-Type-Options', 'nosniff')
  resHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  resHeaders.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  )

  const isPublicPage = !pathname.startsWith('/api') && context.request.method === 'GET'
  if (isPublicPage && res.status === 200 && !resHeaders.has('Cache-Control')) {
    resHeaders.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  }

  return new Response(res.body, { status: res.status, headers: resHeaders })
})
