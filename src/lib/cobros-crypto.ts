// Parte criptográfica de los cobros: código corto y tokens del histórico.
// Vive aparte de cobros.ts porque `node:crypto` no existe en el navegador y
// /cobrar necesita las funciones de presentación (mensaje, formato) en cliente.
// Este módulo es solo-servidor.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

// Sin 0/O/1/I/L: el código se dicta por teléfono y se teclea a mano cuando el
// link no se puede tocar. 31^6 ≈ 8.8e8 combinaciones; con rate limit en
// /c/[code], adivinar uno es inviable. La unicidad la garantiza el UNIQUE de BD.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LEN = 6

/** Código aleatorio con CSPRNG (randomInt, no Math.random). */
export function newShortCode(len = CODE_LEN): string {
  let out = ''
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

/**
 * HMAC-SHA256(teléfono) truncado a 16 bytes. Prueba que quien abre el link lo
 * recibió de mí: un teléfono no es una credencial (cualquiera conoce números
 * ajenos), el token sí. 128 bits es de sobra contra fuerza bruta y cabe en un
 * mensaje de WhatsApp sin verse absurdo.
 */
export function historyToken(phone: string, secret: string): string {
  return createHmac('sha256', secret).update(`mis-pagos:${phone}`, 'utf8').digest('hex').slice(0, 32)
}

/** Comparación en tiempo constante: un `===` filtraría el token por timing. */
export function verifyHistoryToken(phone: string, token: unknown, secret: string): boolean {
  if (typeof token !== 'string') return false
  const expected = historyToken(phone, secret)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(token, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * El token vive en la URL, así que el teléfono NO puede ir también en claro
 * (quedaría en historiales y logs). El link lleva un identificador opaco del
 * teléfono y el token; el servidor busca por este identificador.
 */
export function phoneRef(phone: string, secret: string): string {
  return createHmac('sha256', secret).update(`ref:${phone}`, 'utf8').digest('hex').slice(0, 16)
}
