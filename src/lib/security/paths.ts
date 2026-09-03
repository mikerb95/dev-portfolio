// Helpers puros de clasificación de rutas para el enforcement. Testeables.

// Assets que NO deben contar para el paraguas de rate limit (una página carga
// muchos y en Vercel suelen servirse desde la CDN, no desde la función).
const ASSET_PREFIXES = ['/_astro/', '/_image', '/fonts/', '/favicon']
const ASSET_EXT_RE = /\.(js|css|map|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|txt|xml|json|webmanifest)$/i

/**
 * ¿Esta ruta debe contar para el rate limit por IP? Excluye assets estáticos
 * para no inflar el contador con recursos legítimos de una sola visita.
 */
export function isRateLimitablePath(pathname: string): boolean {
  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return false
  if (ASSET_EXT_RE.test(pathname)) return false
  return true
}

/** ¿Es una ruta de autenticación (objetivo típico de fuerza bruta)? */
export function isAuthPath(pathname: string): boolean {
  return (
    // Cubre tanto el catch-all de auth-astro como el login passwordless de
    // WebAuthn en /api/auth/webauthn/* (puerta de entrada alternativa a GitHub).
    pathname.startsWith('/api/auth/') ||
    pathname === '/login' ||
    pathname === '/entrar' ||
    // Portal de clientes: mismo tratamiento que el login del admin. El bloqueo
    // por cuenta (lib/portal/login.ts) es la otra capa; esta acota el volumen
    // por IP antes de que llegue a tocar la base.
    isPortalAuthPath(pathname)
  )
}

/**
 * Links de cobro (/c/AB3K9F) y su checkout. El código corto es el único secreto
 * que los protege, así que merecen un límite propio: sin él, el paraguas global
 * (600/min) dejaría probar códigos a un ritmo cómodo. Con 30/min, recorrer un
 * espacio de 31^6 toma milenios.
 */
export function isCobroLinkPath(pathname: string): boolean {
  return pathname.startsWith('/c/') || pathname.startsWith('/api/c/')
}

/**
 * Canje del código de grupo del banco de capacitación. Mismo problema que los
 * links de cobro: el código son ocho caracteres de un alfabeto de 29 y es lo
 * único que separa a cualquiera del material restringido. Solo el endpoint de
 * canje, no el banco entero: leer /capacitacion es libre.
 */
export function isTrainingAccessPath(pathname: string): boolean {
  return pathname === '/api/capacitacion/acceso'
}

/**
 * Vista del público de una presentación: `/{pin}` en la raíz del dominio.
 *
 * Merece un límite propio por la misma razón que `/c/[code]`: el PIN es corto
 * (cuatro caracteres) y es lo único que separa a cualquiera del deck. La forma
 * del PIN (dos letras y dos dígitos, sin caracteres ambiguos) es exactamente
 * la que hay que reconocer aquí; nada más de un segmento la cumple.
 *
 * Deliberadamente NO importa `lib/present/pin.ts`: este módulo lo carga el
 * middleware en cada request y debe seguir siendo puro y sin dependencias. La
 * regex es la misma forma, y `tests/present-pin.test.ts` cruza ambas para que
 * no se separen.
 */
const PIN_PATH_RE = /^\/(?=(?:[a-hj-km-np-z2-9]){4}$)(?=(?:[^a-hj-km-np-z]*[a-hj-km-np-z]){2}[^a-hj-km-np-z]*$)[a-hj-km-np-z2-9]{4}$/i

export function isPinPath(pathname: string): boolean {
  return PIN_PATH_RE.test(pathname)
}

/** Snapshot público de una sesión: lo consulta cada dispositivo del salón. */
export function isPresentSnapshotPath(pathname: string): boolean {
  return pathname.startsWith('/api/present/')
}

/**
 * Rutas de credenciales del portal. Separado de `isAuthPath` porque estas
 * merecen además un límite propio, más estrecho, dentro del middleware.
 */
export function isPortalAuthPath(pathname: string): boolean {
  return (
    pathname === '/api/portal/login' ||
    pathname === '/api/portal/reset' ||
    pathname.startsWith('/api/portal/invitacion') ||
    pathname.startsWith('/api/portal/restablecer')
  )
}

/**
 * ¿Puede esta ruta ser enmarcada por una página de nuestro propio origen?
 *
 * Existe para la presentación de sustentación, que proyecta el portal en vivo
 * dentro de un iframe. La cabecera que decide eso viaja en la página ENMARCADA,
 * no en la que enmarca: relajarla en /sustentacion no habría servido de nada,
 * hay que relajarla en /portal.
 *
 * Allowlist deliberadamente estrecha:
 *  · /admin queda fuera y conserva `frame-ancestors 'none'`.
 *  · Las APIs quedan fuera porque no se enmarcan. `frame-ancestors` solo aplica
 *    a documentos cargados en un frame; el XHR que el iframe haga contra
 *    /api/portal/* es mismo origen y no la mira.
 *  · /status, /engineering, /docs/kanban y /lab/site-check son páginas
 *    públicas (no pasan por la rama `isPrivate` del middleware) que también se
 *    enmarcan desde la presentación del beat de la demo, así que necesitan la
 *    misma relajación.
 *    Mismo origen que /presentacion en producción: por eso el mando puede
 *    además desplazarlas desde dentro.
 *
 * Se cubre el subárbol entero de /portal y no una lista de rutas sueltas a
 * propósito: con rutas sueltas, abrir una factura concreta
 * (/portal/facturas/3) en mitad de la sustentación dejaría el iframe en
 * blanco delante del jurado.
 */
export function isFramablePath(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false
  // Astro sirve la misma página con y sin barra final (`trailingSlash: 'ignore'`
  // por defecto), pero la comparación literal solo reconocería una de las dos
  // formas: `/lab/site-check/` habría salido con `frame-ancestors 'none'` y el
  // iframe en blanco, sin más error visible que el marco vacío.
  const ruta = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return (
    ruta === '/portal' ||
    ruta.startsWith('/portal/') ||
    ruta === '/status' ||
    ruta === '/engineering' ||
    ruta === '/docs/kanban' ||
    ruta === '/lab/site-check'
  )
}
