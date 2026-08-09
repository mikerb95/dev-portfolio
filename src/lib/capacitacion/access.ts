import { createHmac, timingSafeEqual, randomInt } from 'node:crypto'

// Pase del banco de recursos. Igual en espíritu al pase de demo
// (src/lib/demo.ts): NO es autenticación de una persona, es un pase firmado
// que dice "este navegador estuvo en una capacitación".
//
// Qué protege y qué no: los recursos `con_codigo` no son secretos - son el
// material que se entrega a quien asistió. La firma existe para que el pase no
// se pueda fabricar con un TTL arbitrario, y el código de grupo para poder
// caducar el acceso de una cohorte sin tocar el de las demás. Nada aquí
// sustituye al login del portal de clientes: si un recurso llegara a contener
// datos de un cliente, no va en el banco, va en `portal_documents`.
//
// Módulo SOLO de servidor (usa node:crypto). El vocabulario compartido con el
// navegador vive en ./tipos.

export const TRAINING_COOKIE = 'capacitacion_pass'
export const TRAINING_TTL_SEC = 30 * 24 * 60 * 60 // 30 días

// Alfabeto sin caracteres ambiguos: el código se dicta en voz alta al cerrar
// la sesión y se teclea en un celular. Sin O/0, I/1/l, ni S/5.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789'
export const CODE_LENGTH = 8

/** Código de grupo nuevo, en el formato legible `XXXX-XXXX`. */
export function generateAccessCode(): string {
  let raw = ''
  for (let i = 0; i < CODE_LENGTH; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

/**
 * Normaliza lo que teclea el asistente: mayúsculas, sin espacios ni guiones.
 * Se compara siempre normalizado para que "abcd efgh" y "ABCD-EFGH" sean el
 * mismo código - la alternativa es soporte telefónico por un guion.
 */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Forma esperada de un código ya normalizado. Filtro barato antes de tocar la base. */
export function isWellFormedCode(input: string): boolean {
  const norm = normalizeAccessCode(input)
  if (norm.length !== CODE_LENGTH) return false
  return [...norm].every((c) => CODE_ALPHABET.includes(c))
}

/**
 * Firma el pase: `<codeId>.<expUnixSec>.<hmac>`. El id del código va dentro de
 * lo firmado para poder revocar una cohorte concreta: si el código se revoca,
 * el pase deja de valer aunque no haya expirado.
 */
export function signTrainingPass(secret: string, codeId: number, expiresAtSec: number): string {
  const payload = `${Math.floor(codeId)}.${Math.floor(expiresAtSec)}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function createTrainingPass(secret: string, codeId: number, nowMs = Date.now()): string {
  return signTrainingPass(secret, codeId, Math.floor(nowMs / 1000) + TRAINING_TTL_SEC)
}

export type TrainingPass = { codeId: number; expiresAtSec: number }

/**
 * Verifica firma y vigencia. Devuelve null ante cualquier duda: malformado,
 * firma inválida, expirado o secreto ausente. Quien llama decide si además el
 * código sigue vivo en la base (revocación), que es una comprobación distinta
 * y que sí toca la base.
 */
export function verifyTrainingPass(
  secret: string | undefined,
  token: string | undefined | null,
  nowMs = Date.now()
): TrainingPass | null {
  if (!secret || !token) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null

  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d+\.\d+$/.test(payload) || !/^[0-9a-f]+$/i.test(sig)) return null

  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  // Longitudes distintas ⇒ rechazo directo: timingSafeEqual lanza si difieren.
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null

  const [codeId, exp] = payload.split('.').map(Number)
  if (exp * 1000 <= nowMs) return null

  return { codeId, expiresAtSec: exp }
}

export type EstadoCodigo = {
  expiresAt?: Date | null
  revokedAt?: Date | null
  maxUses?: number | null
  uses?: number
}

/**
 * ¿El código sigue sirviendo? Puro a propósito (recibe la fila, no la
 * consulta) para poder probar el vencimiento y el tope de usos sin base.
 */
export function codigoUtilizable(codigo: EstadoCodigo | null | undefined, now = new Date()): boolean {
  if (!codigo) return false
  if (codigo.revokedAt) return false
  if (codigo.expiresAt && codigo.expiresAt.getTime() <= now.getTime()) return false
  if (codigo.maxUses != null && (codigo.uses ?? 0) >= codigo.maxUses) return false
  return true
}
