// Cobros de campo: vencimiento, formato de dinero y plantilla del mensaje de
// WhatsApp. Puro y SIN `node:crypto`: /cobrar importa estas funciones también
// en el navegador para regenerar el mensaje al reenviar un cobro.
// La parte criptográfica (código corto, tokens) vive en cobros-crypto.ts.
// Ver docs/plan-cobrar.md.

import { isTerminal, type PaymentStatus } from './payments-state'
import { CODE_ALPHABET, CODE_LEN } from './cobros-codes'

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`)

/** Valida la forma del código antes de tocar la BD (filtra sondeos baratos). */
export const isValidShortCode = (s: unknown): s is string => typeof s === 'string' && CODE_RE.test(s)

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
 * Monto enmascarado para la vista sin token: '$ •••.500'. Conserva los últimos
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
  /** Link firmado del histórico. Ausente al reenviar: el cliente ya lo recibió. */
  historyUrl?: string | null
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
  const historial = input.historyUrl
    ? `\n\nPuedes ver el historial de tus pagos aquí:\n${input.historyUrl}`
    : ''

  return (
    `${saludo}\n\n` +
    `Te comparto el link para el pago de ${fmtCOP(input.amountCents)}${concepto}:\n` +
    `${input.payUrl}\n` +
    `${vence}` +
    `${historial}\n\n` +
    `Gracias,\nMike — CodeByMike`
  )
}
