// Resultado de un pago para mostrarle a quien vuelve del checkout de Wompi.
// Módulo puro (isomorfo): el endpoint lo usa para validar y consultar, la
// página /pay/gracias para decidir qué texto pintar.

import type { PaymentStatus } from './payments-state'

/** Las llaves de Wompi dicen a qué ambiente pertenecen; la API debe coincidir. */
export const wompiApiBase = (publicKey: string): string =>
  publicKey.startsWith('pub_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'

// Los ids de transacción de Wompi son dígitos y guiones (ej. 1234-1668624561-38705).
// Validar el formato evita armar URLs hacia la API con lo que venga en ?id=.
export const isValidTxId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9-]{5,64}$/.test(id)

export type PayOrigin = 'pay' | 'cobro' | 'portal'

export type PayResult = {
  status: PaymentStatus
  amountCents: number | null
  reference: string
  origin: PayOrigin
  method: string | null
}

export type ResultView = {
  tone: 'ok' | 'wait' | 'fail'
  eyebrow: string
  title: string
  body: string
  // Enlace para volver a intentarlo, si tiene sentido desde aquí.
  retry: { href: string; label: string } | null
}

const METHOD_LABEL: Record<string, string> = {
  CARD: 'tarjeta',
  PSE: 'PSE',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  BANCOLOMBIA_TRANSFER: 'Bancolombia',
  BANCOLOMBIA_QR: 'QR Bancolombia',
  BANCOLOMBIA_COLLECT: 'corresponsal Bancolombia',
}

export const methodLabel = (method: string | null): string | null =>
  method ? METHOD_LABEL[method] ?? null : null

const retryFor = (origin: PayOrigin): ResultView['retry'] =>
  origin === 'pay' ? { href: '/pay', label: 'Intentar de nuevo' }
    : origin === 'portal' ? { href: '/portal', label: 'Volver al portal' }
    // Un cobro vive en el link que llegó por WhatsApp: no lo exponemos aquí.
    : null

export function resultView(r: Pick<PayResult, 'status' | 'origin' | 'method'>): ResultView {
  const via = methodLabel(r.method)

  if (r.status === 'approved') {
    return {
      tone: 'ok',
      eyebrow: 'Pago aprobado',
      title: 'Gracias',
      body: 'Tu pago quedó aprobado. Wompi te envía el comprobante al correo en unos minutos.',
      retry: null,
    }
  }

  if (r.status === 'pending' || r.status === 'created') {
    return {
      tone: 'wait',
      eyebrow: 'Confirmando',
      title: 'Casi listo',
      body: via
        ? `Estamos esperando la confirmación de ${via}. Puede tardar unos minutos; te llegará un correo apenas se apruebe.`
        : 'Estamos esperando la confirmación del banco. Puede tardar unos minutos; te llegará un correo apenas se apruebe.',
      retry: null,
    }
  }

  return {
    tone: 'fail',
    eyebrow: 'Pago no completado',
    title: 'No se pudo completar',
    body: r.origin === 'cobro'
      ? 'No se hizo ningún cobro. Puedes intentarlo otra vez desde el mismo link, con otro medio de pago.'
      : 'No se hizo ningún cobro. Puedes intentarlo otra vez con otro medio de pago.',
    retry: retryFor(r.origin),
  }
}

/** Estados en los que vale la pena volver a preguntar en unos segundos. */
export const isSettling = (status: PaymentStatus): boolean => status === 'pending' || status === 'created'
