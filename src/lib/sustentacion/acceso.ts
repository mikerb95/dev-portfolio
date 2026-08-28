// Acceso por CONTRASEÑA al panel de la sustentación.
//
// Por qué existe, y por qué no es "otra forma de entrar al admin"
// ----------------------------------------------------------------
// Abrir la sesión de sustentación es lo único de toda la cadena que exige
// sesión de admin, porque es lo que acuña las credenciales (los dos PINes) y no
// puede autorizarse con una credencial que todavía no existe. Eso deja el día
// de la sustentación colgando de GitHub OAuth: de la red del salón, de que
// GitHub responda y de que la cookie no haya caducado.
//
// Esta puerta quita esa dependencia con una contraseña en variable de entorno.
// Es DELIBERADAMENTE más débil que el OAuth (es un secreto compartido, sin
// segundo factor y sin caducidad propia), así que lo que la hace aceptable no
// es la contraseña: es el ALCANCE.
//
// Abre exactamente tres rutas y ninguna más:
//
//   · /sustentacion                        el escenario que se proyecta
//   · /admin/sustentacion                  abrir la sesión y leer los PINes
//   · /api/admin/sustentacion/sesion       el alta que dispara esa página
//
// El resto de /admin (la bóveda de secretos, los cobros, las finanzas, los
// clientes, los backups) sigue detrás de GitHub y de la allowlist. Una
// contraseña filtrada cuesta una sesión de sustentación reemitida, no el panel.
//
// Sin `SUSTENTACION_PASSWORD` configurada, esta puerta NO EXISTE: no hay
// contraseña por defecto ni cadena vacía que valga. Un despliegue sin la
// variable se comporta como antes de que este archivo existiera.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const ACCESO_COOKIE = 'sustentacion_acceso'

/**
 * Doce horas. Cubre de sobra la jornada (la sesión de sustentación dura seis) y
 * evita tener que volver a teclearla si el día se alarga, que es exactamente el
 * problema que esta puerta viene a resolver.
 */
export const ACCESO_TTL_SEG = 12 * 60 * 60

/**
 * Las rutas que abre esta llave. Comparación EXACTA y nunca por prefijo: con
 * `startsWith('/admin/sustentacion')` bastaría con que algún día se añadiera un
 * `/admin/sustentacion/algo` que enseñe otra cosa para que esta contraseña lo
 * abriera sin que nadie lo hubiera decidido.
 */
const RUTAS_PERMITIDAS = new Set([
  '/sustentacion',
  '/admin/sustentacion',
  '/api/admin/sustentacion/sesion',
])

export function esRutaDeSustentacion(pathname: string): boolean {
  return RUTAS_PERMITIDAS.has(pathname.replace(/\/+$/, '') || '/')
}

/** Comparación en tiempo constante, sin filtrar la longitud por excepción. */
function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * ¿Es esta la contraseña configurada? Falso siempre que no haya una configurada:
 * la ausencia de la variable cierra la puerta, no la abre.
 */
export function contrasenaCorrecta(
  candidata: string | null | undefined,
  esperada: string | null | undefined
): boolean {
  if (typeof candidata !== 'string' || !candidata) return false
  if (typeof esperada !== 'string' || !esperada) return false
  return igualSeguro(candidata, esperada)
}

function firma(secreto: string, expiraMs: number): string {
  // Prefijo propio: esta firma no puede valer como pase del escenario
  // (`sust:pase:v1`) ni como secreto de sesión, aunque salgan de la misma clave.
  return createHmac('sha256', secreto).update(`sust:acceso:v1:${expiraMs}`).digest('hex')
}

/** `<expiraMs>.<firma>`. Se emite solo tras comprobar la contraseña. */
export function firmarAcceso(secreto: string, ahoraMs = Date.now()): string {
  const expira = ahoraMs + ACCESO_TTL_SEG * 1000
  return `${expira}.${firma(secreto, expira)}`
}

/**
 * ¿Vale este acceso ahora? Sin secreto de firma nunca vale: un despliegue sin
 * `AUTH_SECRET` que aceptara cualquier cookie sería una puerta abierta e
 * indistinguible a simple vista de una cerrada.
 */
export function verificarAcceso(
  token: string | null | undefined,
  secreto: string | null | undefined,
  ahoraMs = Date.now()
): boolean {
  if (!token || !secreto) return false

  const corte = token.indexOf('.')
  if (corte <= 0) return false

  const expira = Number(token.slice(0, corte))
  if (!Number.isFinite(expira) || expira <= ahoraMs) return false

  return igualSeguro(token.slice(corte + 1), firma(secreto, expira))
}
