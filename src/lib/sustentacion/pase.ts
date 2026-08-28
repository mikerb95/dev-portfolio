// Pase del ESCENARIO: la llave alternativa para proyectar la sustentación.
//
// Por qué existe
// ---------------
// El escenario (`/sustentacion`) lleva en su HTML el secreto de publicación de
// la sesión, que es lo que autoriza a mover la presentación con el teclado. Lo
// natural era exigir la sesión de admin, y eso hacía: GitHub OAuth.
//
// El problema es de qué depende esa puerta el día de la sustentación. La cadena
// de la presentación ya está construida entera sobre Redis para sobrevivir a la
// cuota agotada de Turso, y el OAuth metía una dependencia NUEVA que no es la
// base de datos pero es igual de externa: GitHub, la red del salón y una cookie
// que puede haber caducado. Un único fallo ahí y el escenario no abre.
//
// Así que hay dos llaves para la misma puerta, y ninguna toca Turso:
//
//   · sesión de admin  → lo normal, desde mi portátil de siempre.
//   · PIN de presentador → el mismo de diez caracteres que ya mueve la
//     presentación desde el celular. Sirve desde CUALQUIER portátil, sin login.
//
// Dar el pase a quien ya tiene el PIN no regala nada: con ese PIN se puede
// mover la presentación entera desde `/api/sustentacion/comando`. La puerta
// nueva no amplía lo que se puede hacer, solo desde dónde se puede hacer.
//
// Módulo del SERVIDOR (usa `node:crypto`) y PURO: no lee Redis ni la base, solo
// firma y verifica. Quien comprueba el PIN contra la sesión es
// `autorizarPorPin` en `control.ts`, con su rate limit.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const PASE_COOKIE = 'sustentacion_pase'

/**
 * Seis horas, el mismo TTL que la sesión de sustentación. Que el pase dure más
 * que la sesión no serviría de nada (no habría sesión que proyectar) y dejaría
 * una credencial viva más tiempo del necesario.
 */
export const PASE_TTL_SEG = 6 * 60 * 60

/**
 * El pase va atado a la SESIÓN, no solo al tiempo. Sin el `sessionId` dentro de
 * lo firmado, un pase de la sustentación de ayer abriría la de hoy: y "emitir
 * PINes nuevos" existe precisamente para cortar el acceso de quien tenía el
 * anterior, así que tiene que cortarlo también aquí.
 *
 * El prefijo separa dominios: esta firma no puede valer como secreto de sesión
 * ni como pase de la demo, aunque las tres salgan de la misma clave.
 */
function firma(secreto: string, sessionId: string, expiraMs: number): string {
  return createHmac('sha256', secreto)
    .update(`sust:pase:v1:${sessionId}:${expiraMs}`)
    .digest('hex')
}

/** `<expiraMs>.<firma>`. Emitido solo tras comprobar el PIN de presentador. */
export function firmarPase(secreto: string, sessionId: string, ahoraMs = Date.now()): string {
  const expira = ahoraMs + PASE_TTL_SEG * 1000
  return `${expira}.${firma(secreto, sessionId, expira)}`
}

/**
 * ¿Es este pase válido para esta sesión y a esta hora?
 *
 * Devuelve false ante cualquier duda, incluida la falta de secreto: un pase que
 * se validara sin clave sería una puerta abierta, y este módulo se importa
 * desde una página que va a estar proyectada.
 */
export function verificarPase(
  token: string | null | undefined,
  secreto: string | null | undefined,
  sessionId: string,
  ahoraMs = Date.now()
): boolean {
  if (!token || !secreto || !sessionId) return false

  const corte = token.indexOf('.')
  if (corte <= 0) return false

  const expira = Number(token.slice(0, corte))
  if (!Number.isFinite(expira) || expira <= ahoraMs) return false

  const recibida = token.slice(corte + 1)
  const esperada = firma(secreto, sessionId, expira)
  // Longitudes distintas hacen que `timingSafeEqual` lance, así que se corta
  // antes. No filtra nada: la longitud de un SHA-256 en hexadecimal es pública.
  if (recibida.length !== esperada.length) return false

  return timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada))
}
