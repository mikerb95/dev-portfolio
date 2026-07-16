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
