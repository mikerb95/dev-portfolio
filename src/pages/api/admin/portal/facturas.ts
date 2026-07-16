import type { APIRoute } from 'astro'
import {
  createInvoice,
  issueInvoice,
  updateInvoiceItems,
  voidInvoice,
  type ItemInput,
} from '../../../../lib/portal/invoices'
import { notifyClient } from '../../../../lib/portal/notifications'
import { formatMoney } from '../../../../lib/portal/format'

// CRUD de facturas desde el panel. La sesión de admin la impone el middleware.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Normaliza las líneas que llegan del formulario.
 *
 * Los importes se aceptan en PESOS (que es como se teclean) y se convierten a
 * centavos aquí, en el borde. Hacia dentro todo son enteros: es la única forma
 * de que los totales cuadren siempre.
 */
function parseItems(raw: unknown): ItemInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null

  const items: ItemInput[] = []
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

/** Crea una factura en borrador. */
export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const clientId = Number(data.clientId)
  if (!Number.isInteger(clientId)) return json(400, { error: 'clientId inválido' })

  const items = parseItems(data.items)
  if (!items) return json(400, { error: 'las líneas de la factura son inválidas' })

  const taxRate = Number(data.taxRate ?? 0)
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    return json(400, { error: 'el impuesto debe ir entre 0 y 1 (0.19 = 19%)' })
  }

  const projectId = Number(data.projectId)
  const dueAt = typeof data.dueAt === 'string' && data.dueAt ? new Date(data.dueAt) : null
  if (dueAt && Number.isNaN(dueAt.getTime())) return json(400, { error: 'fecha de vencimiento inválida' })

  const invoice = await createInvoice({
    clientId,
    projectId: Number.isInteger(projectId) ? projectId : null,
    items,
    taxRate,
    currency: typeof data.currency === 'string' ? data.currency : 'COP',
    notes: typeof data.notes === 'string' ? data.notes.slice(0, 2000) : null,
    dueAt,
  })

  return json(201, { ok: true, id: invoice.id, number: invoice.number, totalCents: invoice.totalCents })
}

/** Reemplaza las líneas de un borrador. */
export const PUT: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const invoiceId = Number(data.invoiceId)
  if (!Number.isInteger(invoiceId)) return json(400, { error: 'invoiceId inválido' })

  const items = parseItems(data.items)
  if (!items) return json(400, { error: 'las líneas de la factura son inválidas' })

  const taxRate = Number(data.taxRate ?? 0)
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) return json(400, { error: 'impuesto inválido' })

  try {
    await updateInvoiceItems(invoiceId, items, taxRate)
    return json(200, { ok: true })
  } catch (e) {
    // updateInvoiceItems se niega a tocar una factura pagada o anulada.
    return json(409, { error: e instanceof Error ? e.message : 'no se pudo actualizar' })
  }
}

/**
 * Emite o anula una factura.
 *
 * Emitir es el momento en que la factura deja de ser mía y pasa a existir para
 * el cliente: ahí es donde se notifica, y no antes.
 */
export const PATCH: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const invoiceId = Number(data.invoiceId)
  if (!Number.isInteger(invoiceId)) return json(400, { error: 'invoiceId inválido' })

  const action = String(data.action ?? '')

  if (action === 'issue') {
    const invoice = await issueInvoice(invoiceId)
    // Null = no estaba en borrador. Reemitir no debe mandar un segundo correo.
    if (!invoice) return json(409, { error: 'la factura ya fue emitida o no está en borrador' })

    await notifyClient({
      clientId: invoice.clientId,
      type: 'invoice',
      title: `Nueva factura ${invoice.number}`,
      body: `Por ${formatMoney(invoice.totalCents, invoice.currency)}${
        invoice.dueAt ? `, con vencimiento el ${invoice.dueAt.toLocaleDateString('es-CO')}` : ''
      }. Puedes consultarla y pagarla desde tu portal.`,
      href: `/portal/facturas/${invoice.id}`,
      emailCta: 'Ver y pagar la factura',
    })

    return json(200, { ok: true, number: invoice.number })
  }

  if (action === 'void') {
    const ok = await voidInvoice(invoiceId)
    if (!ok) return json(409, { error: 'una factura pagada no se puede anular (usa una nota de crédito)' })
    return json(200, { ok: true })
  }

  return json(400, { error: 'acción desconocida' })
}
