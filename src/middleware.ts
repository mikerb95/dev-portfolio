import { defineMiddleware } from 'astro:middleware'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from './lib/auth'
import { maybeChaos } from './lib/chaos'
import { clientIp, resolveDeviceSessionId } from './lib/device-info'
import { recordSession } from './lib/device-sessions'
import { observeRequest, recordEnforcementEvent } from './lib/security/sensor'
import { isBlocked } from './lib/security/blocklist'
import { enforceLimit } from './lib/security/ratelimit-durable'
import { isAuthPath, isCobroLinkPath, isPortalAuthPath, isRateLimitablePath } from './lib/security/paths'
import { DEMO_COOKIE, isDemoAllowedMethod, isDemoBlockedPath, verifyDemoToken } from './lib/demo'
import { demoAvailable, runInDemoContext } from './db'
import { getPortalSession } from './lib/portal/session'
import { isPortalPath, isPortalPublicPath } from './lib/portal/paths'
import { PORTAL_DEMO_COOKIE, isPortalDemoAllowedMethod, verifyPortalDemoToken } from './lib/portal/demo'

// Cookies del JWT de Auth.js a borrar cuando se revoca una sesión (dev y prod).
const AUTH_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

const demoDenied = (motivo: string) =>
  new Response(JSON.stringify({ error: motivo, demo: true }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Evalúa el pase de demo de un request sin sesión a /admin.
 *  · `false`    → no hay pase válido; sigue el camino normal (redirect a login).
 *  · `Response` → hay pase, pero este request no cabe en la demo (403).
 *  · `true`     → demo concedida.
 *
 * El pase solo abre la puerta; lo que impide tocar datos reales es que las
 * queries salen de otra base (ver src/db/index.ts). Si la demo no está
 * configurada, esta función siempre dice `false` y el panel se comporta igual
 * que antes de que existiera.
 */
function resolveDemoPass(
  context: { cookies: { get: (name: string) => { value: string } | undefined } },
  pathname: string,
  method: string
): Response | boolean {
  if (!demoAvailable) return false

  const token = context.cookies.get(DEMO_COOKIE)?.value
  if (!verifyDemoToken(import.meta.env.AUTH_SECRET, token)) return false

  if (!isDemoAllowedMethod(method)) {
    return demoDenied('la demo es de solo lectura: esta acción está deshabilitada')
  }
  if (isDemoBlockedPath(pathname)) {
    return demoDenied('esta sección no está disponible en la demo')
  }
  return true
}

/**
 * Igual que `resolveDemoPass`, pero para el pase de demo del PORTAL: cookie
 * distinta, allowlist de mutación distinta (ver lib/portal/demo.ts). Nunca se
 * consulta si ya hay una sesión real del portal — esta función solo se llama
 * cuando `getPortalSession` ya dijo que no hay ninguna.
 */
function resolvePortalDemoPass(
  context: { cookies: { get: (name: string) => { value: string } | undefined } },
  pathname: string,
  method: string
): Response | boolean {
  if (!demoAvailable) return false

  const token = context.cookies.get(PORTAL_DEMO_COOKIE)?.value
  if (!verifyPortalDemoToken(import.meta.env.AUTH_SECRET, token)) return false

  if (!isPortalDemoAllowedMethod(method, pathname)) {
    return demoDenied('la demo del portal es de solo lectura: esta acción está deshabilitada')
  }
  return true
}

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
    // Credenciales del portal: límite propio, más estrecho que el de /api/auth.
    // Allí el JWT y WebAuthn hacen varios roundtrips por login legítimo; aquí un
    // login es UN POST. 10/min por IP no lo roza ni un cliente torpe, y le quita
    // el oxígeno a un ataque de diccionario antes de que llegue a scrypt.
    if (isPortalAuthPath(pathname) && method === 'POST') {
      const r = await enforceLimit(`portal-auth:${ip}`, { limit: 10, windowMs: 60_000, deferUntil: 0.5 })
      if (!r.allowed) {
        recordEnforcementEvent({
          category: 'auth_probing',
          severity: 'high',
          ruleId: 'ratelimit.portal_auth',
          action: 'rate_limited',
          statusCode: 429,
          method,
          path: pathname,
          query,
          headers: reqHeaders,
        })
        return new Response(JSON.stringify({ error: 'Demasiados intentos. Espera un minuto.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        })
      }
    }

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

    // Links de cobro: el código corto es su única protección. Un cliente abre
    // su link un par de veces; 30/min solo lo roza quien está probando códigos.
    if (isCobroLinkPath(pathname)) {
      const r = await enforceLimit(`cobro-link:${ip}`, { limit: 30, windowMs: 60_000, deferUntil: 0.5 })
      if (!r.allowed) {
        recordEnforcementEvent({
          category: 'enumeration',
          severity: 'high',
          ruleId: 'ratelimit.cobro_link',
          action: 'rate_limited',
          statusCode: 429,
          method,
          path: pathname,
          query,
          headers: reqHeaders,
        })
        return new Response(JSON.stringify({ error: 'demasiadas solicitudes, espera un minuto' }), {
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
          headers: reqHeaders,
        })
        return new Response(JSON.stringify({ error: 'demasiadas solicitudes' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        })
      }
    }
  }

  // `/cobrar` vive en la raíz (se teclea desde el celular en la calle) pero es
  // panel: misma sesión, mismo trato que /admin. La ruta pública que genera es
  // /c/[code], que no cae aquí. Ver docs/plan-cobrar.md.
  const isAdmin =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname === '/cobrar' ||
    pathname.startsWith('/cobrar/')

  // El deck de sustentación tiene URL bajo /docs (la sección es pública) pero no
  // es público: solo lo ve la sesión del administrador. Se trata como ruta
  // privada tanto para el gate de sesión como para los headers de respuesta —
  // en particular para que NO herede el `Cache-Control` público de más abajo,
  // que haría que la CDN cachee el HTML y lo sirva a cualquiera.
  const isPrivateDeck = pathname === '/docs/presentacion'

  // Portal de clientes: privado como /admin a efectos de headers (noindex, sin
  // caché en la CDN), pero con una auth completamente distinta — ni comparte
  // cookie con el admin ni pasa por Auth.js. Ver docs/plan-portal-clientes.md.
  const isPortal = isPortalPath(pathname)
  const isPrivate = isAdmin || isPrivateDeck || isPortal

  let portalDemoMode = false

  if (isPortal && !isPortalPublicPath(pathname)) {
    // Sesión real PRIMERO, siempre contra la base real. Un pase de demo nunca
    // debe poder pisar ni disfrazarse de sesión legítima.
    let portalSession = await getPortalSession(context)

    if (!portalSession) {
      const demo = resolvePortalDemoPass(context, pathname, method)
      if (demo instanceof Response) return demo
      if (demo) {
        // La sesión de demo (creada en /api/portal/demo) vive en la base de
        // demo: hay que re-resolverla DENTRO de ese contexto para encontrarla.
        portalSession = await runInDemoContext(() => getPortalSession(context))
        portalDemoMode = true
      }
    }

    if (!portalSession) {
      // Las APIs reciben 401 (su cliente es fetch, no un navegador); las páginas
      // van al login conservando el destino para volver tras autenticarse.
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'sesión requerida' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const next = encodeURIComponent(pathname + context.url.search)
      return context.redirect(`/portal/login?next=${next}`)
    }

    // "Ver como cliente" (ver /admin/clients): solo lectura, sin excepciones —
    // ni siquiera el pago simulado que sí se permite en la demo pública. Aquí
    // los datos SON reales; simular un pago o mandar un mensaje "de parte del
    // cliente" sería confuso o dañino de verdad, no una demostración inocua.
    // Se corta ANTES de tocar el endpoint: es la misma razón que el guard de
    // demo, aplicada a datos que si se rompen, se rompen para siempre.
    if (portalSession.impersonatedBy && method !== 'GET' && method !== 'HEAD') {
      return new Response(
        JSON.stringify({ error: 'estás viendo este portal como el cliente: solo lectura' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Las páginas la leen de locals; el middleware ya pagó la consulta.
    context.locals.portal = portalSession
    context.locals.portalDemo = portalDemoMode
  }

  // El simulador de pago vive en /api/payments/*, FUERA del namespace del
  // portal (isPortalPath no lo cubre): es infraestructura compartida con /pay.
  // Aun así, es la única mutación que la demo del portal permite (ver
  // lib/portal/demo.ts), así que un visitante de la demo que llega aquí para
  // completar su pago de prueba necesita que ESTA petición también corra en
  // contexto de demo — si no, buscaría el pago que acaba de crear en la base
  // real (vacía para él) y fallaría con "pago no encontrado".
  //
  // Nunca pisa una sesión real: si ya hay sesión de portal o de admin, esta
  // ruta resuelve su propia autorización (ver mock/pay.ts) contra la base que
  // le corresponda, sin pasar por aquí.
  if (!portalDemoMode && pathname === '/api/payments/mock/pay' && method === 'POST') {
    const hasRealPortalSession = !!(await getPortalSession(context))
    if (!hasRealPortalSession) {
      const demo = resolvePortalDemoPass(context, pathname, method)
      if (demo === true) portalDemoMode = true
      // Un Response (403) aquí no se corta en seco: mock/pay.ts tiene su
      // propia autorización (admin, o PAYMENTS_MOCK_ENABLED) y puede aceptar
      // el request por una vía que no pasa por la demo del portal.
    }
  }

  let demoMode = false

  // Gate del admin. La condición NO es `isPrivate`: el portal también es
  // privado, pero su auth ya se resolvió arriba y no debe pasar por Auth.js ni
  // por la allowlist de GitHub — un cliente no tiene ni puede tener login de
  // GitHub autorizado, así que este bloque lo expulsaría.
  if (isAdmin || isPrivateDeck) {
    const session = await getSession(context.request)

    if (!session) {
      // Sin sesión, el pase de demo es la única alternativa: datos ficticios y
      // solo lectura. Nunca aplica al deck privado ni si ya hay sesión real.
      const demo = isAdmin ? resolveDemoPass(context, pathname, method) : false
      if (demo instanceof Response) return demo
      if (!demo) {
        // El deck vuelve a sí mismo tras el login; el panel pasa por /entrar.
        const callbackUrl = isPrivateDeck ? encodeURIComponent(pathname) : '%2Fentrar'
        return context.redirect(`/login?callbackUrl=${callbackUrl}`)
      }
      demoMode = true
      context.locals.demo = true
    } else {
      // Defensa en profundidad: revalida la allowlist en cada request.
      const login = (session?.user as { login?: string } | undefined)?.login
      if (!isAllowedLogin(login)) {
        return new Response('Forbidden', { status: 403 })
      }

      // Registro de dispositivo: identidad = `sid` del JWT si existe (sesiones
      // nuevas), o cookie `device_id` como respaldo (sesiones previas). Si la
      // sesión fue revocada desde el panel, se borra el JWT y se fuerza re-login.
      const sid = (session as { sid?: string } | undefined)?.sid
      const sessionId = resolveDeviceSessionId(sid, context.cookies)
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

      // Nota: WebAuthn (llave de seguridad) es una puerta de entrada ALTERNATIVA
      // a GitHub (ver /login y auth.config.ts), no un segundo factor obligatorio
      // encima de GitHub — quien ya entró por cualquiera de las dos no vuelve a
      // pasar por la otra.
    }
  }

  // En demo (admin o portal), TODA lectura sale de la base ficticia: el
  // contexto se propaga por async/await hasta cualquier query que dispare el
  // render de la página o del endpoint.
  const res = demoMode || portalDemoMode ? await runInDemoContext(() => next()) : await next()
  const resHeaders = new Headers(res.headers)

  resHeaders.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  // FASE 6: observabilidad continua de CSP (la política ya corre en modo
  // ENFORCE, esto solo reporta lo que el navegador ya bloqueó) y bloqueo de
  // permisos de navegador que este sitio no usa (portfolio + panel admin, sin
  // cámara/micrófono/geolocalización/pagos vía Payment Request API, etc.).
  resHeaders.set('Reporting-Endpoints', 'csp-endpoint="/api/security/csp-report"')
  resHeaders.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()'
  )
  const CSP_REPORTING = ' report-to csp-endpoint; report-uri /api/security/csp-report;'

  if (isPrivate) {
    resHeaders.set('X-Frame-Options', 'DENY')
    resHeaders.set('X-Content-Type-Options', 'nosniff')
    resHeaders.set('Referrer-Policy', 'no-referrer')
    resHeaders.set('X-Robots-Tag', 'noindex, nofollow')
    resHeaders.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" +
        CSP_REPORTING
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
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" +
      CSP_REPORTING
  )

  const isPublicPage = !pathname.startsWith('/api') && context.request.method === 'GET'
  if (isPublicPage && res.status === 200 && !resHeaders.has('Cache-Control')) {
    resHeaders.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  }

  return new Response(res.body, { status: res.status, headers: resHeaders })
})
