// Facturación del portal.
//
// Reglas que este módulo hace cumplir:
//  1. Todo el dinero es enteros en centavos. Ningún float toca un importe: en
//     JS, 0.1 + 0.2 !== 0.3, y una factura que no cuadra por un centavo es una
//     llamada del cliente y una excusa que no quiero dar.
//  2. Los totales se recalculan SIEMPRE en el servidor a partir de las líneas.
//     Un total que llegue del cliente se ignora.
//  3. La numeración es correlativa por año y UNIQUE en base: emitir dos
//     facturas con el mismo número es un problema contable, no un detalle.
//  4. Una factura pagada o anulada es inmutable. La contabilidad no se reescribe.

import { and, count, desc, eq, inArray, like, ne, sql } from 'drizzle-orm'
import { db } from '../../db'
import { clients, invoiceItems, invoices, payments, projects } from '../../db/schema'

export type Invoice = typeof invoices.$inferSelect
export type InvoiceItem = typeof invoiceItems.$inferSelect
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Borrador',
  sent: 'Pendiente',
  paid: 'Pagada',
  overdue: 'Vencida',
  void: 'Anulada',
}

// Estados en los que la factura ya no se toca. Cobrada o anulada, el documento
// es historia: corregirla se hace con una nota de crédito, no con un UPDATE.
const IMMUTABLE: ReadonlySet<InvoiceStatus> = new Set(['paid', 'void'])
export const isImmutable = (s: InvoiceStatus): boolean => IMMUTABLE.has(s)

/** ¿El cliente puede pagar esta factura ahora mismo? */
export const isPayable = (s: InvoiceStatus): boolean => s === 'sent' || s === 'overdue'

// ── Cálculo de totales (puro, testeable) ────────────────────────────────────

export type ItemInput = { description: string; quantity: number; unitCents: number }

/**
 * Total de una línea. `quantity` es real (2.5 horas es legítimo), así que el
 * producto se redondea a centavo entero AQUÍ y no se arrastra el decimal.
 */
export const lineTotal = (item: ItemInput): number => Math.round(item.quantity * item.unitCents)

export type Totals = { subtotalCents: number; taxCents: number; totalCents: number }

/**
 * Totales de la factura. El impuesto se aplica sobre el subtotal ya redondeado,
 * no sobre cada línea: así el total siempre es exactamente la suma de lo que el
 * cliente ve impreso.
 */
export function computeTotals(items: ItemInput[], taxRate = 0): Totals {
  const subtotalCents = items.reduce((sum, i) => sum + lineTotal(i), 0)
  const taxCents = Math.round(subtotalCents * taxRate)
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents }
}

// ── Numeración ──────────────────────────────────────────────────────────────

/**
 * Siguiente correlativo del año: INV-2026-001.
 *
 * Se calcula del máximo existente, no de un contador aparte, para que no pueda
 * desincronizarse. La condición de carrera teórica (dos emisiones simultáneas
 * leyendo el mismo máximo) la corta el UNIQUE de la base: el segundo INSERT
 * falla y el llamador reintenta.
 */
export async function nextInvoiceNumber(now = new Date()): Promise<string> {
  const year = now.getFullYear()
  const prefix = `INV-${year}-`
  const [row] = await db
    .select({ max: sql<string | null>`max(${invoices.number})` })
    .from(invoices)
    .where(like(invoices.number, `${prefix}%`))

  const lastSeq = row?.max ? Number(row.max.slice(prefix.length)) : 0
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

// ── Lecturas del portal (siempre filtradas por cliente) ─────────────────────

export type InvoiceSummary = {
  dueCents: number
  dueCount: number
  overdueCount: number
  paidThisYearCents: number
  currency: string
}

/** Resumen para las tarjetas del dashboard. */
export async function clientInvoiceSummary(clientId: number, now = new Date()): Promise<InvoiceSummary> {
  const rows = await db
    .select({ status: invoices.status, totalCents: invoices.totalCents, currency: invoices.currency, paidAt: invoices.paidAt })
    .from(invoices)
    // Los borradores NO existen para el cliente: son míos hasta que los emito.
    .where(and(eq(invoices.clientId, clientId), ne(invoices.status, 'draft')))

  const pending = rows.filter((r) => r.status === 'sent' || r.status === 'overdue')
  const paidThisYear = rows.filter((r) => r.status === 'paid' && r.paidAt && r.paidAt.getFullYear() === now.getFullYear())

  return {
    dueCents: pending.reduce((s, r) => s + r.totalCents, 0),
    dueCount: pending.length,
    overdueCount: rows.filter((r) => r.status === 'overdue').length,
    paidThisYearCents: paidThisYear.reduce((s, r) => s + r.totalCents, 0),
    currency: rows[0]?.currency ?? 'COP',
  }
}

/** Facturas visibles del cliente (nunca los borradores). */
export async function clientInvoices(clientId: number) {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
      projectTitle: projects.title,
    })
    .from(invoices)
    .leftJoin(projects, eq(invoices.projectId, projects.id))
    .where(and(eq(invoices.clientId, clientId), ne(invoices.status, 'draft')))
    .orderBy(desc(invoices.issuedAt), desc(invoices.id))
}

/**
 * Una factura del cliente con sus líneas. El `clientId` va en el WHERE: pedir
 * la factura de otro devuelve null, no un 403 — que un id ajeno responda
 * "prohibido" ya confirma que ese id existe.
 */
export async function clientInvoice(clientId: number, invoiceId: number) {
  const [invoice] = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      currency: invoices.currency,
      subtotalCents: invoices.subtotalCents,
      taxCents: invoices.taxCents,
      totalCents: invoices.totalCents,
      notes: invoices.notes,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
      paymentId: invoices.paymentId,
      projectTitle: projects.title,
      clientName: clients.name,
      company: clients.company,
      billingInfo: clients.billingInfo,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(projects, eq(invoices.projectId, projects.id))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId), ne(invoices.status, 'draft')))
    .limit(1)

  if (!invoice) return null

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(invoiceItems.sortOrder, invoiceItems.id)

  return { invoice, items }
}

// ── Escrituras (admin) ──────────────────────────────────────────────────────

export type SaveInvoiceInput = {
  clientId: number
  projectId?: number | null
  items: ItemInput[]
  taxRate?: number
  currency?: string
  notes?: string | null
  dueAt?: Date | null
}

/** Crea una factura en borrador con sus líneas y totales calculados. */
export async function createInvoice(input: SaveInvoiceInput, now = new Date()): Promise<Invoice> {
  const totals = computeTotals(input.items, input.taxRate ?? 0)

  // Reintento por la carrera de numeración: el UNIQUE de la base es la única
  // fuente de verdad, así que si otro proceso ganó el número, se pide el
  // siguiente y se vuelve a intentar.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [invoice] = await db
        .insert(invoices)
        .values({
          clientId: input.clientId,
          projectId: input.projectId ?? null,
          number: await nextInvoiceNumber(now),
          status: 'draft',
          currency: input.currency ?? 'COP',
          ...totals,
          notes: input.notes ?? null,
          dueAt: input.dueAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (input.items.length) {
        await db.insert(invoiceItems).values(
          input.items.map((item, i) => ({
            invoiceId: invoice.id,
            description: item.description,
            quantity: item.quantity,
            unitCents: item.unitCents,
            totalCents: lineTotal(item),
            sortOrder: i,
          }))
        )
      }
      return invoice
    } catch (e) {
      if (attempt === 4 || !/unique|constraint/i.test(String(e))) throw e
    }
  }
  throw new Error('no se pudo asignar número de factura')
}

/** Reemplaza líneas y totales de un borrador. */
export async function updateInvoiceItems(invoiceId: number, items: ItemInput[], taxRate = 0, now = new Date()): Promise<void> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!invoice) throw new Error('factura no encontrada')
  if (isImmutable(invoice.status as InvoiceStatus)) throw new Error('una factura pagada o anulada no se puede modificar')

  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId))
  if (items.length) {
    await db.insert(invoiceItems).values(
      items.map((item, i) => ({
        invoiceId,
        description: item.description,
        quantity: item.quantity,
        unitCents: item.unitCents,
        totalCents: lineTotal(item),
        sortOrder: i,
      }))
    )
  }
  await db.update(invoices).set({ ...computeTotals(items, taxRate), updatedAt: now }).where(eq(invoices.id, invoiceId))
}

/**
 * Emite la factura: borrador → pendiente. A partir de aquí el cliente la ve.
 * Solo transiciona desde `draft`, así que reemitir es un no-op seguro.
 */
export async function issueInvoice(invoiceId: number, now = new Date()): Promise<Invoice | null> {
  const [invoice] = await db
    .update(invoices)
    .set({ status: 'sent', issuedAt: now, updatedAt: now })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'draft')))
    .returning()
  return invoice ?? null
}

/** Anula una factura. Solo si no está pagada: para eso está la nota de crédito. */
export async function voidInvoice(invoiceId: number, now = new Date()): Promise<boolean> {
  const res = await db
    .update(invoices)
    .set({ status: 'void', updatedAt: now })
    .where(and(eq(invoices.id, invoiceId), ne(invoices.status, 'paid')))
  return res.rowsAffected > 0
}

/**
 * Marca la factura como pagada. La llama el webhook de la pasarela cuando el
 * pago queda aprobado.
 *
 * El `WHERE status in ('sent','overdue')` es lo que la hace idempotente: un
 * webhook repetido (que la pasarela reintenta por diseño) no reescribe `paidAt`
 * ni vuelve a notificar.
 */
export async function markInvoicePaid(invoiceId: number, paymentId: number, now = new Date()): Promise<Invoice | null> {
  const [invoice] = await db
    .update(invoices)
    .set({ status: 'paid', paidAt: now, paymentId, updatedAt: now })
    .where(and(eq(invoices.id, invoiceId), inArray(invoices.status, ['sent', 'overdue'])))
    .returning()
  return invoice ?? null
}

/**
 * Marca como vencidas las facturas pendientes cuya fecha pasó. Lo llama el cron
 * diario. Devuelve las que cambiaron, para poder notificar solo a esas.
 */
export async function sweepOverdue(now = new Date()): Promise<Invoice[]> {
  return db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: now })
    .where(and(eq(invoices.status, 'sent'), sql`${invoices.dueAt} is not null`, sql`${invoices.dueAt} < ${now}`))
    .returning()
}

/** Facturas del panel de admin (todas, incluidos borradores). */
export async function allInvoices() {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
      clientId: invoices.clientId,
      clientName: clients.name,
      company: clients.company,
      projectTitle: projects.title,
      paymentReference: payments.reference,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(projects, eq(invoices.projectId, projects.id))
    .leftJoin(payments, eq(invoices.paymentId, payments.id))
    .orderBy(desc(invoices.createdAt))
}

export async function invoiceCountByStatus(): Promise<Record<string, number>> {
  const rows = await db.select({ status: invoices.status, n: count() }).from(invoices).groupBy(invoices.status)
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}
