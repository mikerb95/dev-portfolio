// PIN de una sesión de presentación. Módulo PURO e isomorfo: lo importa el
// servidor (generación) y también el navegador (validación del campo "entrar
// con PIN"), así que no puede tocar `node:crypto` ni la base.
//
// Cuatro caracteres, exactamente dos letras y dos dígitos en cualquier orden.
// La mezcla no es estética: un PIN de solo letras se confunde con una ruta real
// del sitio (`/tools`, `/docs`), y uno de solo dígitos se lee como un año o un
// número de versión. Obligar a que convivan letra y dígito hace que la forma
// misma del PIN sea reconocible desde el fondo del salón y, sobre todo,
// imposible de confundir con una ruta: ninguna ruta de este sitio mezcla
// letras y dígitos en cuatro caracteres.

/** Sin `i`, `l`, `o`: se confunden con 1 y 0 en cualquier tipografía. */
export const PIN_LETTERS = 'abcdefghjkmnpqrstuvwxyz'
/** Sin `0` ni `1`: se confunden con O y l. */
export const PIN_DIGITS = '23456789'

export const PIN_LENGTH = 4
const LETTERS_PER_PIN = 2

const LETTER_RE = new RegExp(`^[${PIN_LETTERS}]$`)
const DIGIT_RE = new RegExp(`^[${PIN_DIGITS}]$`)

/**
 * Tamaño del espacio de PINs: C(4,2) posiciones × 23² letras × 8² dígitos.
 * Exportado porque el test lo usa para afirmar que el reintento por colisión
 * nunca puede agotar el espacio en un salón real.
 */
export const PIN_SPACE_SIZE =
  6 * PIN_LETTERS.length ** LETTERS_PER_PIN * PIN_DIGITS.length ** (PIN_LENGTH - LETTERS_PER_PIN)

/**
 * ¿Tiene este string la forma exacta de un PIN? Es el primer filtro de
 * `/{pin}`: lo que no pasa por aquí es un 404 normal y ni siquiera llega a
 * consultar Redis, así que la ruta comodín no se convierte en un sondeo barato
 * contra el almacén de sesiones.
 */
export function isPinShape(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string' || raw.length !== PIN_LENGTH) return false
  const pin = raw.toLowerCase()
  let letters = 0
  let digits = 0
  for (const ch of pin) {
    if (LETTER_RE.test(ch)) letters++
    else if (DIGIT_RE.test(ch)) digits++
    else return false
  }
  return letters === LETTERS_PER_PIN && digits === PIN_LENGTH - LETTERS_PER_PIN
}

/**
 * Forma canónica de un PIN para buscarlo en Redis. `/A7B3` y `/a7b3` son el
 * mismo PIN: nadie escribe mayúsculas a mano desde un celular y el QR ya no
 * distingue. Devuelve null si no tiene la forma válida — quien llama nunca
 * debe construir una clave de Redis con texto sin validar.
 */
export function normalizePin(raw: string | null | undefined): string | null {
  if (!isPinShape(raw)) return null
  return (raw as string).toLowerCase()
}

/** Entero uniforme en [0, max) sin sesgo de módulo, sobre WebCrypto. */
function randomBelow(max: number): number {
  // El rechazo elimina el sesgo del último bloque incompleto de 256 valores.
  const limit = Math.floor(256 / max) * max
  const buf = new Uint8Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

function pick(alphabet: string): string {
  return alphabet[randomBelow(alphabet.length)]
}

/**
 * Un PIN candidato, con las dos letras en posiciones aleatorias. NO comprueba
 * colisiones: eso lo hace `generatePin`, que es quien conoce las rutas
 * reservadas y los PINs vivos.
 */
export function randomPin(): string {
  const chars: string[] = [pick(PIN_DIGITS), pick(PIN_DIGITS), pick(PIN_LETTERS), pick(PIN_LETTERS)]
  // Fisher-Yates: reparte las dos letras entre las cuatro posiciones con la
  // misma probabilidad para cada una de las 6 combinaciones.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export type PinGuards = {
  /** ¿Choca con una ruta real del sitio? (ver reserved.ts) */
  isReserved: (pin: string) => boolean
  /** ¿Hay una sesión viva con este PIN? Puede consultar Redis. */
  isTaken: (pin: string) => boolean | Promise<boolean>
}

export class PinExhaustedError extends Error {
  constructor(attempts: number) {
    super(`no se pudo generar un PIN libre en ${attempts} intentos`)
    this.name = 'PinExhaustedError'
  }
}

/**
 * PIN libre: ni reservado por una ruta del sitio ni en uso por otra sesión.
 *
 * El reintento es la parte que importa. Con 203.136 combinaciones y un puñado
 * de sesiones vivas, la probabilidad de que 20 intentos seguidos colisionen es
 * indistinguible de cero — si se agotan, es que Redis está devolviendo basura,
 * y entonces lanzar es correcto: presentar con un PIN que no resuelve es peor
 * que no presentar.
 */
export async function generatePin(guards: PinGuards, maxAttempts = 20): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pin = randomPin()
    if (guards.isReserved(pin)) continue
    if (await guards.isTaken(pin)) continue
    return pin
  }
  throw new PinExhaustedError(maxAttempts)
}
