// Cobros de campo: código corto del link, token del histórico y plantilla del
// mensaje de WhatsApp. Puro (node:crypto) y testeable: sin BD ni red.
// Ver docs/plan-cobrar.md.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { formatPhone } from './phone'
import { isTerminal, type PaymentStatus } from './payments'

// ── Código corto del link ───────────────────────────────────────────────────

// Sin 0/O/1/I/L: el código se dicta por teléfono y se teclea a mano cuando el
// link no se puede tocar. 32^6 ≈ 1.07e9 combinaciones; con rate limit en
// /c/[code], adivinar uno es inviable. La unicidad la garantiza el UNIQUE de BD.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6

/** Código aleatorio con CSPRNG (randomInt, no Math.random). */
export function newShortCode(len = CODE_LEN): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`)

/** Valida la forma del código antes de tocar la BD (filtra sondeos baratos). */
export const isValidShortCode = (s: unknown): s is string => typeof s === 'string' && CODE_RE.test(s)

// ── Token del histórico (/mis-pagos?t=) ─────────────────────────────────────

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

// ── Vencimiento ─────────────────────────────────────────────────────────────

export const EXPIRY_OPTIONS = [
  { value: '24h', label: '24 horas', hours: 24 },
  { value: '72h', label: '3 días', hours: 72 },
  { value: '7d', label: '7 días', hours: 168 },
  { value: 'never', label: 'Sin vencimiento', hours: null },
] as const

export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]['value']

export const DEFAULT_EXPIRY: ExpiryOption = '72h'

export const isValidExpiry = (v: unknown): v is ExpiryOption =>
  EXPIRY_OPTIONS.some((o) => o.value === v)

/** Calcula el vencimiento; null = sin vencimiento. */
export function expiryDate(option: ExpiryOption, from: Date = new Date()): Date | null {
  const hours = EXPIRY_OPTIONS.find((o) => o.value === option)?.hours
  return hours == null ? null : new Date(from.getTime() + hours * 3_600_000)
}

/**
 * ¿El link ya no sirve para pagar? Solo importa en estados no terminales: un
 * pago aprobado no "vence", y uno anulado ya está cerrado por otra vía.
 */
export function isExpired(
  p: { expiresAt: Date | null; status: string },
  now: Date = new Date(),
): boolean {
  if (!p.expiresAt) return false
  if (isTerminal(p.status as PaymentStatus)) return false
  return p.expiresAt.getTime() <= now.getTime()
}

/** Texto humano del tiempo restante: 'vence en 2 h', 'vencido'. */
export function timeLeft(expiresAt: Date | null, now: Date = new Date()): string {
  if (!expiresAt) return 'sin vencimiento'
  const ms = expiresAt.getTime() - now.getTime()
  if (ms <= 0) return 'vencido'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `vence en ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `vence en ${hours} h`
  return `vence en ${Math.round(hours / 24)} días`
}

// ── Dinero ──────────────────────────────────────────────────────────────────

/** Centavos → '$150.000' (formato colombiano, sin decimales cuando son cero). */
export function fmtCOP(cents: number): string {
  const pesos = cents / 100
  const hasDecimals = pesos % 1 !== 0
  return `$${pesos.toLocaleString('es-CO', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Monto enmascarado para la vista sin token: '$ ***.500'. Conserva los últimos
 * 3 dígitos para que el dueño reconozca su pago sin publicar el valor a un
 * tercero que solo tecleó un número de celular.
 */
export function maskAmount(cents: number): string {
  const pesos = Math.round(cents / 100)
  const s = String(pesos)
  return s.length <= 3 ? '$ •••' : `$ •••.${s.slice(-3)}`
}

// ── Plantilla del mensaje de WhatsApp ───────────────────────────────────────

export type MessageInput = {
  clientName?: string | null
  amountCents: number
  concept?: string | null
  payUrl: string
  historyUrl: string
  expiresAt: Date | null
}

/**
 * Mensaje por defecto. Es solo el punto de partida: en /cobrar se edita antes
 * de enviarlo, y editarlo no cambia el monto ni el link (esos ya están fijados
 * en el pago). Sin emojis decorativos: esto va a un cliente que pidió un
 * servicio, no a una campaña de marketing.
 */
export function buildWhatsAppMessage(input: MessageInput): string {
  const saludo = input.clientName ? `Hola ${input.clientName},` : 'Hola,'
  const concepto = input.concept ? ` por ${input.concept}` : ''
  const vence = input.expiresAt
    ? `\nEl link vence el ${input.expiresAt.toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })}.`
    : ''

  return (
    `${saludo}\n\n` +
    `Te comparto el link para el pago de ${fmtCOP(input.amountCents)}${concepto}:\n` +
    `${input.payUrl}\n` +
    `${vence}\n\n` +
    `Puedes ver el historial de tus pagos aquí:\n${input.historyUrl}\n\n` +
    `Gracias,\nMike — CodeByMike`
  )
}
