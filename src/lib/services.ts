// Normalización compartida para servicios/costos (project_services).
import { encryptJson } from './crypto'

export const SERVICE_CATEGORIES = [
  'hosting', 'database', 'auth', 'cdn', 'email', 'storage',
  'dns', 'domain', 'monitoring', 'payment', 'repository', 'other',
] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  hosting: 'Hosting', database: 'Base de datos', auth: 'Autenticación',
  cdn: 'CDN', email: 'Email', storage: 'Almacenamiento', dns: 'DNS',
  domain: 'Dominio', monitoring: 'Monitoreo', payment: 'Pagos',
  repository: 'Repositorio', other: 'Otro',
}

// Proveedores sugeridos (texto libre; no es un enum estricto)
export const PROVIDERS = [
  'GitHub', 'GitLab', 'AWS', 'Azure', 'GCP', 'Vercel', 'Netlify', 'Cloudflare',
  'Turso', 'Supabase', 'Neon', 'PlanetScale', 'MongoDB Atlas', 'Upstash',
  'Namecheap', 'GoDaddy', 'Google Workspace', 'Zoho', 'Resend', 'SendGrid',
  'Mailgun', 'Stripe', 'PayPal', 'Sentry', 'Otro',
] as const

export const PAYERS = ['me', 'client_reimbursable', 'client_direct'] as const
export type Payer = (typeof PAYERS)[number]

export const PAYER_LABELS: Record<Payer, string> = {
  me: 'Lo asumo yo',
  client_reimbursable: 'Reembolsable',
  client_direct: 'Lo paga el cliente',
}

const toDate = (v: unknown): Date | null => {
  if (!v) return null
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}
const toNum = (v: unknown): number | null => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Construye el objeto de valores para insert/update de project_services
 * incluyendo solo las claves presentes en el body. Cifra `secrets` si vienen.
 * Puede lanzar si ENCRYPTION_KEY no está configurada y se intentan guardar secretos.
 */
export function normalizeServiceInput(body: Record<string, any>): Record<string, unknown> {
  const v: Record<string, unknown> = {}
  const setIf = (k: string, val: unknown) => { if (body[k] !== undefined) v[k] = val }

  setIf('name', typeof body.name === 'string' ? body.name.trim() : body.name)
  setIf('category', body.category)
  setIf('provider', body.provider || null)
  setIf('url', body.url || null)
  setIf('username', body.username || null)
  setIf('notes', body.notes || null)
  if (body.projectId !== undefined) v.projectId = body.projectId ? Number(body.projectId) : null
  if (body.clientId !== undefined) v.clientId = body.clientId ? Number(body.clientId) : null
  if (body.cost !== undefined) v.cost = toNum(body.cost)
  setIf('currency', body.currency || 'USD')
  setIf('billingCycle', body.billingCycle || 'monthly')
  if (body.renewalDate !== undefined) v.renewalDate = toDate(body.renewalDate)
  if (body.autoRenew !== undefined) v.autoRenew = !!body.autoRenew
  if (body.active !== undefined) v.active = !!body.active
  setIf('payer', body.payer || 'me')
  if (body.billedToClient !== undefined) v.billedToClient = toNum(body.billedToClient)
  if (body.secrets !== undefined) {
    const hasSecrets = body.secrets && typeof body.secrets === 'object' &&
      Object.values(body.secrets).some((x) => x != null && String(x).trim() !== '')
    v.secrets = hasSecrets ? encryptJson(body.secrets) : null
  }
  return v
}
