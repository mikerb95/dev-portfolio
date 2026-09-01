import type { APIRoute } from 'astro'
import { clientIp } from '../../../../lib/ratelimit'
import { recordSecurityEvent } from '../../../../lib/security/events'
import {
  anularCuentaCobro,
  createCuentaCobro,
  emitirCuentaCobro,
  marcarPagada,
  updateCuentaCobro,
  type SaveCuentaCobroInput,
} from '../../../../lib/cuentas-cobro-db'
import { CONCEPTOS_DEFAULT, type ConceptoId, type CuentaCobroItem } from '../../../../lib/cuentas-cobro'

// CRUD de cuentas de cobro desde el panel. La sesión de admin la impone el
// middleware (matcher isAdmin), no este archivo.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Estos documentos llevan cédula, dirección y número de cuenta bancaria.
    // Nunca en caché, ni en la CDN ni en el navegador.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * Normaliza las líneas del formulario.
 *
 * Los importes llegan en PESOS, que es como se teclean, y se convierten a
 * centavos aquí, en el borde. Hacia dentro todo son enteros. Mismo contrato que
 * el endpoint de facturas del portal.
 */
function parseItems(raw: unknown): CuentaCobroItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null

  const items: CuentaCobroItem[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') return null
    const { description, quantity, unitPrice } = r as Record<string, unknown>

    const desc = typeof description === 'string' ? description.trim().slice(0, 300) : ''
    const qty = Number(quantity)
    const price = Number(unitPrice)

    if (!desc) return null
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100_000) return null
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) return null

    items.push({ description: desc, quantity: qty, unitCents: Math.round(price * 100) })
  }
  return items
}

const VALID_CONCEPTOS = new Set<string>(CONCEPTOS_DEFAULT.map((c) => c.id))

/** Solo conceptos del catálogo: un id inventado no puede llegar al snapshot. */
function parseRetenciones(raw: unknown): ConceptoId[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((v): v is ConceptoId => typeof v === 'string' && VALID_CONCEPTOS.has(v)))]
}

const str = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s || null
}

/** Fecha desde 'YYYY-MM-DD' o ISO. Una fecha inválida es null, nunca Invalid Date. */
const date = (v: unknown): Date | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseInput(data: Record<string, unknown>): SaveCuentaCobroInput | { error: string } {
  const clientId = Number(data.clientId)
  if (!Number.isInteger(clientId) || clientId <= 0) return { error: 'clientId inválido' }

  const items = parseItems(data.items)
  if (!items) return { error: 'los conceptos de la cuenta de cobro son inválidos' }

  const projectId = data.projectId == null || data.projectId === '' ? null : Number(data.projectId)
  if (projectId != null && !Number.isInteger(projectId)) return { error: 'projectId inválido' }

  return {
    clientId,
    projectId,
    items,
    retenciones: parseRetenciones(data.retenciones),
    concept: str(data.concept, 500),
    city: str(data.city, 120),
    contractRef: str(data.contractRef, 120),
    periodStart: date(data.periodStart),
    periodEnd: date(data.periodEnd),
    ssPlanilla: str(data.ssPlanilla, 60),
    ssPeriodo: str(data.ssPeriodo, 20),
    notes: str(data.notes, 1000),
    dueAt: date(data.dueAt),
  }
}

/** Bitácora del micro-SIEM: fire-and-forget, jamás bloquea el response. */
function log(request: Request, ruleId: string, statusCode: number) {
  void recordSecurityEvent({
    classification: { category: 'cuenta_cobro', severity: 'low', ruleId },
    ip: clientIp(request),
    method: request.method,
    path: '/api/admin/cuentas-cobro',
    query: null,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode,
    action: 'logged',
  })
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data = await request.json()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * POST crea un borrador. Con `?action=issue|void|paid` e `id`, transiciona una
 * cuenta existente.
 */
export const POST: APIRoute = async ({ request, url }) => {
  const action = url.searchParams.get('action')

  if (action) {
    const data = (await body(request)) ?? {}
    const id = Number(data.id ?? url.searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id inválido' })

    if (action === 'issue') {
      const res = await emitirCuentaCobro(id)
      if (!res.ok) {
        // 422, no 400: la petición está bien formada, el documento es el que
        // todavía no se puede emitir. La lista de faltantes va al formulario.
        log(request, 'cuenta_cobro.issue_rejected', 422)
        return json(422, { error: 'la cuenta de cobro no está completa', errors: res.errors })
      }
      log(request, 'cuenta_cobro.issued', 200)
      return json(200, { ok: true, cuenta: res.cuenta })
    }

    if (action === 'void') {
      const ok = await anularCuentaCobro(id)
      log(request, 'cuenta_cobro.voided', ok ? 200 : 409)
      return ok ? json(200, { ok: true }) : json(409, { error: 'una cuenta pagada no se anula' })
    }

    if (action === 'paid') {
      const ok = await marcarPagada(id)
      log(request, 'cuenta_cobro.paid', ok ? 200 : 409)
      return ok ? json(200, { ok: true }) : json(409, { error: 'una cuenta anulada no se marca pagada' })
    }

    return json(400, { error: 'acción desconocida' })
  }

  const data = await body(request)
  if (!data) return json(400, { error: 'JSON inválido' })

  const input = parseInput(data)
  if ('error' in input) return json(400, input)

  const cuenta = await createCuentaCobro(input)
  log(request, 'cuenta_cobro.created', 201)
  return json(201, { ok: true, cuenta })
}

/** Actualiza un borrador completo (líneas incluidas). */
export const PATCH: APIRoute = async ({ request, url }) => {
  const data = await body(request)
  if (!data) return json(400, { error: 'JSON inválido' })

  const id = Number(data.id ?? url.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id inválido' })

  const input = parseInput(data)
  if ('error' in input) return json(400, input)

  try {
    await updateCuentaCobro(id, input)
  } catch (e) {
    // El módulo lanza cuando la cuenta ya no es un borrador. Es un conflicto de
    // estado, no un error del servidor.
    return json(409, { error: e instanceof Error ? e.message : 'no se pudo actualizar' })
  }

  return json(200, { ok: true })
}
