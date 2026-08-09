// Validación compartida de payloads de cliente (el prefijo "_" excluye el archivo del routing).

import { normalizePhone } from '../../../../lib/phone'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX = { name: 120, email: 160, company: 120, notes: 2000, logoUrl: 500 } as const

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

// Datos de facturación: pares clave/valor libres porque cada país (y cada
// cliente) pide etiquetas distintas - NIT aquí, RFC en México, VAT en la UE.
// Los límites existen porque estas cadenas se imprimen en el PDF de la factura:
// una clave larguísima no rompe nada, pero desmaqueta el encabezado.
const BILLING = { maxPairs: 12, maxKey: 40, maxValue: 200 } as const

export type ClientPayload = {
  name: string
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
  logoUrl: string | null
  billingInfo: string | null
}

/**
 * Normaliza los pares de facturación a JSON, o null si no queda ninguno.
 *
 * El orden de las claves se conserva tal cual llega: es el orden en que se
 * imprimen en la factura y en el PDF, así que es información, no un detalle.
 */
function validateBillingInfo(raw: unknown): { value: string | null } | { error: string } {
  if (raw == null || raw === '') return { value: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Los datos de facturación son inválidos' }

  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    // Los saltos de línea y caracteres de control reventarían el layout del PDF
    // (que dibuja una línea por par), así que se colapsan a espacios.
    const key = String(k).replace(CONTROL_CHARS, ' ').trim()
    const value = (typeof v === 'string' ? v : String(v ?? '')).replace(CONTROL_CHARS, ' ').trim()
    if (!key || !value) continue // par a medio llenar: se descarta en silencio
    if (key.length > BILLING.maxKey) return { error: `Cada etiqueta de facturación puede tener hasta ${BILLING.maxKey} caracteres` }
    if (value.length > BILLING.maxValue) return { error: `Cada dato de facturación puede tener hasta ${BILLING.maxValue} caracteres` }
    out[key] = value
  }

  const keys = Object.keys(out)
  if (keys.length > BILLING.maxPairs) return { error: `Máximo ${BILLING.maxPairs} datos de facturación` }
  return { value: keys.length ? JSON.stringify(out) : null }
}

export function validateClient(body: unknown): { data: ClientPayload } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Payload inválido' }
  const b = body as Record<string, unknown>

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = str(b.name)
  const email = str(b.email)
  const company = str(b.company)
  const notes = str(b.notes)
  const phoneRaw = str(b.phone)
  const logoUrl = str(b.logoUrl)

  if (!name) return { error: 'El nombre es requerido' }
  if (name.length > MAX.name) return { error: `El nombre no puede superar ${MAX.name} caracteres` }
  if (email && !EMAIL_RE.test(email)) return { error: 'El email no tiene un formato válido' }
  if (email.length > MAX.email) return { error: `El email no puede superar ${MAX.email} caracteres` }
  if (company.length > MAX.company) return { error: `La empresa no puede superar ${MAX.company} caracteres` }
  if (notes.length > MAX.notes) return { error: `Las notas no pueden superar ${MAX.notes} caracteres` }

  // Se guarda en E.164 o no se guarda: un teléfono "casi bien" no empareja con
  // el cobro de campo que lo busca normalizado, y el fallo sería silencioso.
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null
  if (phoneRaw && !phone) return { error: 'El teléfono no es válido (usa 3104641228 o +57 310 464 1228)' }

  // El logo termina en un <img src> del portal del cliente: solo https evita
  // que una URL 'javascript:' o un data: URI entren al HTML por esta puerta.
  if (logoUrl) {
    if (logoUrl.length > MAX.logoUrl) return { error: `La URL del logo no puede superar ${MAX.logoUrl} caracteres` }
    let parsed: URL
    try {
      parsed = new URL(logoUrl)
    } catch {
      return { error: 'La URL del logo no es válida' }
    }
    if (parsed.protocol !== 'https:') return { error: 'La URL del logo debe empezar por https://' }
  }

  const billing = validateBillingInfo(b.billingInfo)
  if ('error' in billing) return { error: billing.error }

  return {
    data: {
      name,
      email: email || null,
      phone,
      company: company || null,
      notes: notes || null,
      logoUrl: logoUrl || null,
      billingInfo: billing.value,
    },
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
