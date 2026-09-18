// Reglas del formulario público de /pay. Módulo puro (isomorfo): lo importan
// el endpoint de checkout y el <script> de la página, para que el navegador
// avise lo mismo que el servidor va a rechazar.

export type PayKind = 'servicio' | 'apoyo'

export const PAY_MIN_COP = 1_000
export const PAY_MAX_COP = 5_000_000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type PayForm = {
  kind: PayKind
  name: string
  email: string
  concept: string | null
  message: string | null
  // Lo que ve el admin en el listado y viaja a la fila de payments.
  description: string
}

// Sin caracteres de control ni espacios repetidos: estos textos terminan en el
// admin y en correos, y un salto de línea inyectado no tiene nada que hacer ahí.
const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

export function parsePayForm(body: Record<string, unknown>): { ok: true; data: PayForm } | { ok: false; error: string } {
  const kind = body.kind
  if (kind !== 'servicio' && kind !== 'apoyo') return { ok: false, error: 'Elige qué tipo de pago vas a hacer.' }

  const name = clean(body.payerName, 120)
  if (name.length < 2) return { ok: false, error: 'Escribe tu nombre.' }

  const email = clean(body.payerEmail, 200)
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Escribe un correo válido para enviarte el comprobante.' }

  const concept = clean(body.concept, 200) || null
  if (kind === 'servicio' && !concept) return { ok: false, error: 'Cuéntame qué estás pagando (proyecto, cotización o cuenta de cobro).' }

  // En el mensaje sí se respetan los saltos de línea que escribió la persona.
  const message = typeof body.message === 'string'
    ? body.message.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '').trim().slice(0, 500) || null
    : null

  const description = kind === 'servicio' ? `Servicio: ${concept}` : 'Apoyo'
  return { ok: true, data: { kind, name, email, concept, message, description } }
}

/** "1.250.000", "$ 1250000" o "1250000" → 1250000. Null si no hay dígitos. */
export function parseCop(input: string): number | null {
  const digits = input.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

export const formatCop = (n: number): string => new Intl.NumberFormat('es-CO').format(n)
