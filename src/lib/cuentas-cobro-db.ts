// Persistencia de las cuentas de cobro. Este módulo SÍ toca base de datos; la
// lógica que merece tests sin BD vive en `cuentas-cobro.ts`, que es puro y se
// importa también desde el navegador. Misma separación que cobros.ts /
// cobros-db.ts. Ver docs/plan-cuentas-de-cobro.md.

import { and, desc, eq, gte, like, lt, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { appSettings, clients, invoiceItems, invoices, projects } from '../db/schema'
// El reintento de numeración es el mismo mecanismo que el de las facturas del
// portal, así que comparte también su detector de colisiones del UNIQUE.
import { esConflictoUnique } from './portal/invoices'
import {
  computeCuentaCobro,
  itemTotal,
  parseCuentaCobroConfig,
  parseDeudor,
  parseEmisor,
  topeIva,
  validateCuentaCobro,
  type ConceptoId,
  type CuentaCobroConfig,
  type CuentaCobroItem,
  type Deudor,
  type Emisor,
  type Retencion,
  type TopeIva,
} from './cuentas-cobro'

export type CuentaCobro = typeof invoices.$inferSelect

/** Estados en los que el documento ya no se toca. Igual que en facturas. */
const IMMUTABLE = new Set(['paid', 'void'])
export const esInmutable = (status: string): boolean => IMMUTABLE.has(status)

// Discriminante de la tabla compartida. Toda consulta de este módulo lo lleva:
// sin él, un id equivocado dejaría que el panel de cuentas de cobro editara una
// factura del portal.
const esCuenta = eq(invoices.docType, 'cuenta_cobro')

// ── Configuración ───────────────────────────────────────────────────────────

/** Config + datos del emisor en una sola lectura de `app_settings`. */
export async function loadEmisorYConfig(): Promise<{ emisor: Emisor; config: CuentaCobroConfig }> {
  const rows = await db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings)
  return { emisor: parseEmisor(rows), config: parseCuentaCobroConfig(rows) }
}

// ── Numeración ──────────────────────────────────────────────────────────────

/**
 * Siguiente correlativo: CC-2026-001. Serie propia, separada de la INV- de las
 * facturas: son documentos distintos y compartir consecutivo dejaría huecos
 * inexplicables en cada una de las dos numeraciones.
 *
 * Se calcula del máximo existente, no de un contador aparte, para que no pueda
 * desincronizarse; la carrera la corta el UNIQUE de `number` y el llamador
 * reintenta. Mismo diseño que `nextInvoiceNumber`.
 */
export async function nextCuentaCobroNumber(now = new Date()): Promise<string> {
  const prefix = `CC-${now.getFullYear()}-`
  const [row] = await db
    .select({ max: sql<string | null>`max(${invoices.number})` })
    .from(invoices)
    .where(like(invoices.number, `${prefix}%`))

  const lastSeq = row?.max ? Number(row.max.slice(prefix.length)) : 0
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

// ── Escrituras ──────────────────────────────────────────────────────────────

export type SaveCuentaCobroInput = {
  clientId: number
  projectId?: number | null
  items: CuentaCobroItem[]
  retenciones?: ConceptoId[]
  concept?: string | null
  city?: string | null
  contractRef?: string | null
  periodStart?: Date | null
  periodEnd?: Date | null
  ssPlanilla?: string | null
  ssPeriodo?: string | null
  notes?: string | null
  dueAt?: Date | null
}

/** Guarda los totales y el snapshot de retenciones que corresponden a estas líneas. */
function totalesPara(input: SaveCuentaCobroInput, config: CuentaCobroConfig) {
  const t = computeCuentaCobro(input.items, input.retenciones ?? [], config)
  return {
    subtotalCents: t.subtotalCents,
    taxCents: t.taxCents, // 0 por construcción: el emisor no es responsable de IVA
    totalCents: t.totalCents,
    retentions: JSON.stringify(t.retentions),
    retentionsCents: t.retentionsCents,
    netCents: t.netCents,
  }
}

const lineasDe = (id: number, items: CuentaCobroItem[]) =>
  items.map((item, i) => ({
    invoiceId: id,
    description: item.description,
    quantity: item.quantity,
    unitCents: item.unitCents,
    totalCents: itemTotal(item),
    sortOrder: i,
  }))

/** Crea una cuenta de cobro en borrador. Todavía sin snapshots: se congelan al emitir. */
export async function createCuentaCobro(input: SaveCuentaCobroInput, now = new Date()): Promise<CuentaCobro> {
  const { config } = await loadEmisorYConfig()

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [cuenta] = await db
        .insert(invoices)
        .values({
          clientId: input.clientId,
          projectId: input.projectId ?? null,
          number: await nextCuentaCobroNumber(now),
          docType: 'cuenta_cobro',
          status: 'draft',
          currency: 'COP', // el documento es colombiano por definición
          ...totalesPara(input, config),
          concept: input.concept ?? null,
          city: input.city ?? null,
          contractRef: input.contractRef ?? null,
          periodStart: input.periodStart ?? null,
          periodEnd: input.periodEnd ?? null,
          ssPlanilla: input.ssPlanilla ?? null,
          ssPeriodo: input.ssPeriodo ?? null,
          notes: input.notes ?? null,
          dueAt: input.dueAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (input.items.length) await db.insert(invoiceItems).values(lineasDe(cuenta.id, input.items))
      return cuenta
    } catch (e) {
      if (attempt === 4 || !esConflictoUnique(e)) throw e
    }
  }
  throw new Error('no se pudo asignar número de cuenta de cobro')
}

/** Reemplaza líneas, datos y totales de un borrador. */
export async function updateCuentaCobro(id: number, input: SaveCuentaCobroInput, now = new Date()): Promise<void> {
  const [cuenta] = await db.select().from(invoices).where(and(esCuenta, eq(invoices.id, id))).limit(1)
  if (!cuenta) throw new Error('cuenta de cobro no encontrada')
  if (esInmutable(cuenta.status)) throw new Error('una cuenta de cobro pagada o anulada no se puede modificar')
  // Emitida tampoco: el documento ya salió con un número y unos datos. Corregir
  // una cuenta entregada se hace anulándola y emitiendo otra, no con un UPDATE.
  if (cuenta.status !== 'draft') throw new Error('solo se puede modificar un borrador')

  const { config } = await loadEmisorYConfig()

  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id))
  if (input.items.length) await db.insert(invoiceItems).values(lineasDe(id, input.items))

  await db
    .update(invoices)
    .set({
      projectId: input.projectId ?? null,
      ...totalesPara(input, config),
      concept: input.concept ?? null,
      city: input.city ?? null,
      contractRef: input.contractRef ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      ssPlanilla: input.ssPlanilla ?? null,
      ssPeriodo: input.ssPeriodo ?? null,
      notes: input.notes ?? null,
      dueAt: input.dueAt ?? null,
      updatedAt: now,
    })
    .where(and(esCuenta, eq(invoices.id, id)))
}

export type EmitResult = { ok: true; cuenta: CuentaCobro } | { ok: false; errors: string[] }

/**
 * Emite la cuenta de cobro: borrador → pendiente.
 *
 * Aquí pasan las dos cosas que definen el documento:
 *  1. Se valida contra `validateCuentaCobro`. Emitir sin cédula, sin NIT del
 *     deudor o sin datos bancarios produce un documento que contabilidad
 *     devuelve, y descubrirlo tres semanas después no es aceptable.
 *  2. Se CONGELAN emisor, deudor y retenciones en la propia fila. A partir de
 *     aquí, reimprimir el PDF no vuelve a leer `app_settings` ni `clients`:
 *     cambiar de banco en marzo no puede reescribir lo entregado en enero.
 */
export async function emitirCuentaCobro(id: number, now = new Date()): Promise<EmitResult> {
  const detalle = await cuentaCobro(id)
  if (!detalle) return { ok: false, errors: ['cuenta de cobro no encontrada'] }
  if (detalle.cuenta.status !== 'draft') return { ok: false, errors: ['la cuenta ya fue emitida'] }

  const { emisor, config } = await loadEmisorYConfig()
  const deudor = parseDeudor(detalle.clientName, detalle.company, detalle.billingInfo)
  const items = detalle.items.map((i) => ({ description: i.description, quantity: i.quantity, unitCents: i.unitCents }))

  const errors = validateCuentaCobro({
    docType: 'cuenta_cobro',
    concept: detalle.cuenta.concept,
    city: detalle.cuenta.city,
    items,
    emisor,
    deudor,
    taxCents: detalle.cuenta.taxCents,
  })
  if (errors.length) return { ok: false, errors }

  // Los totales se recalculan aquí, no se confía en lo guardado: entre la
  // última edición y la emisión pudo cambiar una tarifa en ajustes.
  const totales = computeCuentaCobro(items, retencionIdsDe(detalle.cuenta), config)

  const [cuenta] = await db
    .update(invoices)
    .set({
      status: 'sent',
      issuedAt: now,
      updatedAt: now,
      issuerSnapshot: JSON.stringify(emisor),
      payerSnapshot: JSON.stringify(deudor),
      retentions: JSON.stringify(totales.retentions),
      retentionsCents: totales.retentionsCents,
      netCents: totales.netCents,
      subtotalCents: totales.subtotalCents,
      taxCents: totales.taxCents,
      totalCents: totales.totalCents,
    })
    .where(and(esCuenta, eq(invoices.id, id), eq(invoices.status, 'draft')))
    .returning()

  return cuenta ? { ok: true, cuenta } : { ok: false, errors: ['la cuenta ya fue emitida'] }
}

/** Anula. Solo si no está pagada: lo cobrado no se reescribe. */
export async function anularCuentaCobro(id: number, now = new Date()): Promise<boolean> {
  const res = await db
    .update(invoices)
    .set({ status: 'void', updatedAt: now })
    .where(and(esCuenta, eq(invoices.id, id), ne(invoices.status, 'paid')))
  return res.rowsAffected > 0
}

/** Marca pagada a mano: aquí no hay pasarela, el cliente consigna a la cuenta. */
export async function marcarPagada(id: number, now = new Date()): Promise<boolean> {
  const res = await db
    .update(invoices)
    .set({ status: 'paid', paidAt: now, updatedAt: now })
    .where(and(esCuenta, eq(invoices.id, id), ne(invoices.status, 'void')))
  return res.rowsAffected > 0
}

// ── Lecturas ────────────────────────────────────────────────────────────────

/** Qué conceptos de retención lleva la cuenta, leídos de su snapshot. */
export function retencionIdsDe(cuenta: Pick<CuentaCobro, 'retentions'>): ConceptoId[] {
  return parseRetenciones(cuenta.retentions).map((r) => r.id)
}

/** Lee el snapshot de retenciones. Un JSON corrupto devuelve lista vacía, no lanza. */
export function parseRetenciones(raw: string | null): Retencion[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Retencion[]) : []
  } catch {
    return []
  }
}

/** Lee un snapshot de emisor o deudor. Null si no se emitió todavía. */
export function parseSnapshot<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Listado del panel, con el cliente y el proyecto resueltos. */
export async function allCuentasCobro() {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      totalCents: invoices.totalCents,
      retentionsCents: invoices.retentionsCents,
      netCents: invoices.netCents,
      concept: invoices.concept,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
      clientId: invoices.clientId,
      clientName: clients.name,
      company: clients.company,
      projectTitle: projects.title,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(projects, eq(invoices.projectId, projects.id))
    .where(esCuenta)
    .orderBy(desc(invoices.createdAt))
}

/** Una cuenta con sus líneas y los datos del cliente. */
export async function cuentaCobro(id: number) {
  const [row] = await db
    .select({
      cuenta: invoices,
      clientName: clients.name,
      company: clients.company,
      billingInfo: clients.billingInfo,
      projectTitle: projects.title,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(projects, eq(invoices.projectId, projects.id))
    .where(and(esCuenta, eq(invoices.id, id)))
    .limit(1)

  if (!row) return null

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(invoiceItems.sortOrder, invoiceItems.id)

  return { ...row, items }
}

/**
 * Semáforo del tope de 3.500 UVT (art. 437 par. 3 ET).
 *
 * Cuenta lo EMITIDO, no lo cobrado: el tope mira ingresos del año, y una cuenta
 * emitida y todavía sin pagar ya es un ingreso comprometido. Los borradores y
 * las anuladas no cuentan porque no son documentos vivos.
 */
export async function topeIvaDelAnio(
  year = new Date().getFullYear(),
  // La config se puede inyectar para no releer `app_settings` cuando el
  // llamador ya la tiene. El listado del panel la carga por su cuenta para
  // pintar el catálogo de retenciones, y sin esto la leía dos veces por carga.
  configPrecargada?: CuentaCobroConfig
): Promise<TopeIva> {
  const desde = new Date(year, 0, 1)
  const hasta = new Date(year + 1, 0, 1)

  const [row] = await db
    .select({ total: sql<number | null>`sum(${invoices.totalCents})` })
    .from(invoices)
    // gte/lt y no un `sql` crudo con las fechas interpoladas: la columna es
    // `timestamp` (segundos), y en una plantilla cruda drizzle no conoce esa
    // conversión, así que ata el Date con otra unidad y la comparación no
    // encuentra nada. Falla en silencio devolviendo cero, que es justo el modo
    // de fallo peligroso en un semáforo de cumplimiento.
    .where(and(esCuenta, ne(invoices.status, 'draft'), ne(invoices.status, 'void'), gte(invoices.issuedAt, desde), lt(invoices.issuedAt, hasta)))

  const config = configPrecargada ?? (await loadEmisorYConfig()).config
  return topeIva(Number(row?.total ?? 0), config)
}

export async function cuentaCountByStatus(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: invoices.status, n: sql<number>`count(*)` })
    .from(invoices)
    .where(esCuenta)
    .groupBy(invoices.status)
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]))
}

export type { Deudor, Emisor }
