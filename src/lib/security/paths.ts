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
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/auth-webauthn/') ||
    pathname === '/login' ||
    pathname === '/entrar' ||
    pathname === '/entrar/verificar'
  )
}
