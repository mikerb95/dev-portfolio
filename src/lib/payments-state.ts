// Máquina de estados de un pago. Módulo PURO a propósito: no importa la BD ni
// nada con efectos, así que puede usarse desde libs de presentación (cobros.ts)
// y desde tests sin levantar una conexión a Turso.
//
// `payments.ts` re-exporta todo esto: el resto del código sigue importando de
// allí y no tiene que saber que la máquina vive en su propio archivo.

export type PaymentStatus = 'created' | 'pending' | 'approved' | 'declined' | 'error' | 'voided'

export const PAYMENT_STATUSES: PaymentStatus[] = ['created', 'pending', 'approved', 'declined', 'error', 'voided']

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  created: 'Creado',
  pending: 'Pendiente',
  approved: 'Aprobado',
  declined: 'Rechazado',
  error: 'Error',
  voided: 'Anulado',
}

const TERMINAL: ReadonlySet<PaymentStatus> = new Set(['approved', 'declined', 'error', 'voided'])

/** Transiciones legales de la máquina de estados. */
const ALLOWED: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  created: new Set(['pending', 'approved', 'declined', 'error', 'voided']),
  pending: new Set(['approved', 'declined', 'error', 'voided']),
  // Anulación post-aprobación (refund/void) es la única salida de un terminal.
  approved: new Set(['voided']),
  declined: new Set(),
  error: new Set(),
  voided: new Set(),
}

export const isTerminal = (s: PaymentStatus): boolean => TERMINAL.has(s)

export const canTransition = (from: PaymentStatus, to: PaymentStatus): boolean =>
  from !== to && ALLOWED[from].has(to)

/** Mapea el estado que reporta la pasarela a nuestra máquina de estados. */
export function normalizeGatewayStatus(raw: string | null | undefined): PaymentStatus | null {
  const s = String(raw ?? '').toLowerCase()
  const map: Record<string, PaymentStatus> = {
    created: 'created',
    pending: 'pending',
    approved: 'approved',
    declined: 'declined',
    error: 'error',
    voided: 'voided',
  }
  return map[s] ?? null
}
