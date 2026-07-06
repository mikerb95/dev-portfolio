// Validación compartida de payloads de cliente (el prefijo "_" excluye el archivo del routing).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX = { name: 120, email: 160, company: 120, notes: 2000 } as const

export type ClientPayload = {
  name: string
  email: string | null
  company: string | null
  notes: string | null
}

export function validateClient(body: unknown): { data: ClientPayload } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Payload inválido' }
  const b = body as Record<string, unknown>

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = str(b.name)
  const email = str(b.email)
  const company = str(b.company)
  const notes = str(b.notes)

  if (!name) return { error: 'El nombre es requerido' }
  if (name.length > MAX.name) return { error: `El nombre no puede superar ${MAX.name} caracteres` }
  if (email && !EMAIL_RE.test(email)) return { error: 'El email no tiene un formato válido' }
  if (email.length > MAX.email) return { error: `El email no puede superar ${MAX.email} caracteres` }
  if (company.length > MAX.company) return { error: `La empresa no puede superar ${MAX.company} caracteres` }
  if (notes.length > MAX.notes) return { error: `Las notas no pueden superar ${MAX.notes} caracteres` }

  return {
    data: {
      name,
      email: email || null,
      company: company || null,
      notes: notes || null,
    },
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
