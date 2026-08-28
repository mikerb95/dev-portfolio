// El PIN de PRESENTADOR: la credencial que autoriza a mover la presentación.
// Módulo PURO e isomorfo (sin `node:crypto`, sin `../db`, sin Redis), porque
// lo importa también el `<script>` del control remoto para validar la forma de
// lo que se teclea antes de gastar una petición.
//
// Por qué NO es el mismo PIN que el del asistente
// ------------------------------------------------
// El PIN de asistente son cuatro caracteres pensados para leerse desde el
// fondo del salón: es público por diseño, va proyectado en la pantalla y en el
// QR. Si esa misma cadena diera el control, cualquiera del público podría
// mover la sustentación desde su celular mientras yo hablo. Son, por tanto,
// dos credenciales con dos amenazas distintas:
//
//   · asistente   → se quiere que la adivinen. Corta, legible, 4 caracteres.
//   · presentador → se quiere que NADIE la adivine. Larga, nunca proyectada.
//
// Y son de LONGITUD distinta a propósito: siendo 4 y 10, los dos espacios son
// disjuntos por construcción, así que es imposible que una sesión emita el
// mismo valor para los dos roles por mala suerte. `sonDistintos()` lo afirma
// igualmente, porque una invariante que solo vive en un comentario se rompe la
// primera vez que alguien cambia una constante.

import { PIN_DIGITS, PIN_LETTERS } from '../present/pin'

/**
 * Mismo alfabeto sin confusiones que el PIN de asistente (sin `i`/`l`/`o`, sin
 * `0`/`1`): esto se teclea en un celular, a oscuras, con prisa.
 */
export const PIN_PRESENTADOR_ALFABETO = PIN_LETTERS + PIN_DIGITS

/**
 * Diez caracteres sobre 31 símbolos: 31¹⁰ ≈ 8,2 × 10¹⁴ combinaciones, unos 49
 * bits. Con el rate limit de `/comando` (ver control.ts), agotar una fracción
 * apreciable de ese espacio llevaría más siglos que minutos dura la
 * sustentación.
 */
export const PIN_PRESENTADOR_LONGITUD = 10

/** En grupos de cinco al mostrarlo. Se teclea mal un bloque de diez seguidos. */
const TAMANO_GRUPO = 5

const VALIDO_RE = new RegExp(`^[${PIN_PRESENTADOR_ALFABETO}]{${PIN_PRESENTADOR_LONGITUD}}$`)

/**
 * Forma canónica de lo que llega del control remoto. Quita los guiones que
 * añade `formatearPinPresentador` y cualquier espacio que meta el teclado
 * predictivo del celular, y baja a minúsculas: nadie escribe mayúsculas a mano
 * y el autocorrector del móvil capitaliza la primera letra sin preguntar.
 *
 * Devuelve null si no tiene la forma válida - quien llama NUNCA debe comparar
 * ni construir una clave con texto sin normalizar.
 */
export function normalizarPinPresentador(bruto: string | null | undefined): string | null {
  if (typeof bruto !== 'string') return null
  const limpio = bruto.toLowerCase().replace(/[^a-z0-9]/g, '')
  return VALIDO_RE.test(limpio) ? limpio : null
}

/** ¿Tiene forma de PIN de presentador? Primer filtro, sin tocar Redis. */
export function esFormaPinPresentador(bruto: string | null | undefined): boolean {
  return normalizarPinPresentador(bruto) !== null
}

/** `ab3kd-9mn2p`. Solo para MOSTRARLO; nunca para compararlo. */
export function formatearPinPresentador(pin: string): string {
  const norm = normalizarPinPresentador(pin)
  if (!norm) return pin
  const grupos: string[] = []
  for (let i = 0; i < norm.length; i += TAMANO_GRUPO) {
    grupos.push(norm.slice(i, i + TAMANO_GRUPO))
  }
  return grupos.join('-')
}

/**
 * Convierte bytes crudos en un PIN, sin sesgo de módulo.
 *
 * Separado de quien produce los bytes (un HMAC en el servidor, ver
 * `control.ts`) para que la conversión se pueda probar con vectores fijos sin
 * arrastrar la clave secreta hasta el test.
 *
 * El rechazo del último bloque incompleto de 256 (31 × 8 = 248) es lo que
 * garantiza que las 31 letras salgan equiprobables: sin él, los 8 primeros
 * símbolos del alfabeto aparecerían un 12,5% más a menudo, que es justo la
 * pista por donde se empieza a adivinar una credencial.
 */
export function pinDesdeBytes(bytes: Uint8Array): string {
  const n = PIN_PRESENTADOR_ALFABETO.length
  const limite = Math.floor(256 / n) * n
  let pin = ''
  for (const b of bytes) {
    if (b >= limite) continue
    pin += PIN_PRESENTADOR_ALFABETO[b % n]
    if (pin.length === PIN_PRESENTADOR_LONGITUD) return pin
  }
  // Un SHA-256 son 32 bytes y se rechazan 8 de cada 256: quedarse corto exige
  // que 23 de 32 bytes caigan en la zona de rechazo, con probabilidad del
  // orden de 10⁻²⁵. Si pasa, es un bug de quien pasó los bytes, no mala suerte.
  throw new Error('bytes insuficientes para derivar un PIN de presentador')
}

/**
 * La invariante que hace que todo esto sirva de algo: las dos credenciales de
 * una sesión no pueden coincidir. Se comprueba al crear la sesión, no solo en
 * el test, porque el día que alguien iguale las longitudes esto tiene que
 * fallar ruidosamente y no en silencio delante del jurado.
 */
export function sonDistintos(pinAsistente: string, pinPresentador: string): boolean {
  return pinAsistente.toLowerCase() !== pinPresentador.toLowerCase()
}
