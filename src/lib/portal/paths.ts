// Clasificación de rutas del portal. Helpers puros y testeables, aparte del
// middleware, porque de esta lista depende que una página quede protegida o
// abierta: merece tests propios y no perderse dentro de un condicional largo.

/** ¿La ruta pertenece al portal de clientes (página o API)? */
export function isPortalPath(pathname: string): boolean {
  return pathname === '/portal' || pathname.startsWith('/portal/') || pathname.startsWith('/api/portal/')
}

// Rutas del portal accesibles SIN sesión, por definición: son las que sirven
// para conseguir una. Allowlist explícita, nunca patrones abiertos — si una
// ruta nueva no se añade aquí a conciencia, nace protegida. El fallo seguro es
// "pide login de más", no "deja pasar".
const PUBLIC_EXACT = new Set([
  '/portal/login',
  '/portal/olvide',
  '/api/portal/login',
  '/api/portal/reset',
])

const PUBLIC_PREFIXES = [
  '/portal/invitacion/', // aceptar invitación (token en la URL)
  '/portal/restablecer/', // elegir contraseña nueva (token en la URL)
  '/api/portal/invitacion/',
  '/api/portal/restablecer/',
]

/** ¿Esta ruta del portal se puede visitar sin sesión? */
export function isPortalPublicPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (PUBLIC_EXACT.has(path)) return true
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p))
}
