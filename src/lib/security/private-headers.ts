// Headers de seguridad del sitio, en un módulo puro para que el middleware los
// aplique igual en la respuesta normal y en sus salidas tempranas.
//
// Antes vivían en línea al final del middleware, así que todo `return` previo
// (el 302 a /login, el 403 de la allowlist, el 503 de la revocación, el 401 del
// portal) salía sin ellos: un redirect de /admin con el HSTS por defecto de
// Vercel y sin X-Robots-Tag. Lo encontró el vigía del repo (6 oct 2026).

export const CSP_REPORTING = ' report-to csp-endpoint; report-uri /api/security/csp-report;'
export const CONNECT_SRC_BASE = "connect-src 'self';"

/** Headers que lleva toda respuesta del sitio, pública o privada. */
export function aplicarHeadersBase(h: Headers, { microfono = false }: { microfono?: boolean } = {}): void {
  h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  // Observabilidad continua de CSP (la política ya corre en ENFORCE; esto
  // solo reporta lo bloqueado) y permisos de navegador que el sitio no usa.
  h.set('Reporting-Endpoints', 'csp-endpoint="/api/security/csp-report"')
  h.set(
    'Permissions-Policy',
    `camera=(), ${microfono ? 'microphone=(self)' : 'microphone=()'}, geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()`
  )
}

export interface OpcionesPrivadas {
  /** La sustentación enmarca algunas rutas privadas desde el mismo origen. */
  framable: boolean
  connectSrc?: string
}

/** Headers endurecidos de toda ruta privada (panel, portal, deck, Cotiza). */
export function aplicarHeadersPrivados(h: Headers, { framable, connectSrc = CONNECT_SRC_BASE }: OpcionesPrivadas): void {
  // X-Frame-Options se OMITE en las rutas enmarcables en vez de ponerse en
  // SAMEORIGIN. Es la cabecera vieja, no entiende 'self' de forma consistente
  // entre navegadores, y dejarla en DENY junto a `frame-ancestors 'self'` es
  // contradictorio: algunos aplican la más restrictiva y el iframe queda en
  // blanco sin más pista que un aviso en consola. Manda la CSP.
  if (!framable) h.set('X-Frame-Options', 'DENY')
  // Nada privado en ninguna caché. Sin esto la respuesta salía con el
  // `public, max-age=0, must-revalidate` que Vercel pone por defecto: un
  // proxy compartido podía guardarla, y el navegador conservaba páginas del
  // panel (o un secreto recién revelado) tras cerrar sesión. Se respeta lo
  // que la ruta ya decidió si ya es no-store o private.
  if (!/no-store|private/i.test(h.get('Cache-Control') ?? '')) {
    h.set('Cache-Control', 'private, no-store')
  }
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'no-referrer')
  h.set('X-Robots-Tag', 'noindex, nofollow')
  h.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; " +
      connectSrc +
      ` frame-ancestors ${framable ? "'self'" : "'none'"}; base-uri 'self'; form-action 'self';` +
      CSP_REPORTING
  )
}

/**
 * Copia una respuesta temprana del middleware con los headers privados. Se
 * copia en vez de mutar porque `context.redirect()` y `Response.redirect()`
 * devuelven headers inmutables.
 */
export function endurecerPrivada(res: Response, opciones: OpcionesPrivadas): Response {
  const h = new Headers(res.headers)
  aplicarHeadersBase(h)
  aplicarHeadersPrivados(h, opciones)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
}
