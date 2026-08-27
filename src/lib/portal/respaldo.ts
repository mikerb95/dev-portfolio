// Modo respaldo del portal: qué se sirve cuando la base NO responde.
//
// Por qué existe. Turso factura filas leídas y su cuota es por ORGANIZACIÓN,
// así que cuando se agota caen a la vez la base principal y la de la demo. El
// resto del sitio ya sobrevive a eso (ver src/lib/fallback/ y
// docs/runbook-cuota-turso.md): la portada sirve `instantanea.json` y /status
// sondea en vivo. El portal era el único hueco, y justamente el que hay que
// poder enseñar en la sustentación.
//
// LA REGLA DE SEGURIDAD QUE HACE QUE ESTO SEA ACEPTABLE
//
// El invariante del portal es que `clientId` sale siempre de la sesión y viaja
// en el WHERE (ver tests/portal-isolation.test.ts). Este módulo NO lo debilita
// porque no participa de él: en modo respaldo no se ejecuta ninguna consulta.
// Las funciones de datos devuelven este snapshot y vuelven antes de tocar la
// base. No hay `clientId` que filtrar porque no hay query que filtrar.
//
// El aislamiento es por ORIGEN DE DATOS, igual que en /demo: una base distinta
// allí, un JSON versionado aquí. Falsificar el pase no expone nada, porque lo
// que hay detrás es este archivo, que está en el repositorio a la vista.
//
// Y para que el `clientId` sintético no pueda colarse en una consulta real si
// algún día alguien añade una ruta que se salte la guarda, vale -1: ninguna
// fila de ninguna tabla lo tiene, así que el peor caso es una lista vacía.
//
// SE APAGA SOLO. No hay bandera que activar hoy ni desactivar cuando la cuota
// se reinicie: el pase solo se emite cuando la consulta de entrada falla, dura
// 30 minutos, y las guardas solo miran el contexto. En cuanto Turso responda,
// /api/portal/demo vuelve a crear una sesión de verdad y este archivo queda
// inerte. Mismo criterio que `instantanea.json`.

import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { InvoiceSummary } from './invoices'
import type { InvoiceItem, InvoiceStatus } from './invoices'
import type { Milestone } from './projects'
import type { ServiceHealth } from './projects'
import type { ActivityPage, ActivityType } from './activity'
import datos from '../../data/portal-respaldo.json'

export const PORTAL_RESPALDO_COOKIE = 'portal_respaldo'
/** Igual que el pase de demo: corto, porque solo cubre un recorrido. */
const TTL_MS = 30 * 60 * 1000
/** Cliente y usuario imposibles: ninguna fila real los tiene. */
export const RESPALDO_CLIENT_ID = -1
export const RESPALDO_USER_ID = -1

// ── Contexto ────────────────────────────────────────────────────────────────

const contexto = new AsyncLocalStorage<true>()

/** Corre `fn` con el portal en modo respaldo. Lo envuelve el middleware. */
export function runInRespaldoContext<T>(fn: () => T): T {
  return contexto.run(true, fn)
}

/** ¿Este request se está sirviendo del snapshot? */
export function enRespaldo(): boolean {
  return contexto.getStore() === true
}

// ── Pase firmado ────────────────────────────────────────────────────────────

/**
 * Mismo diseño que el pase de la demo: HMAC sobre el vencimiento, sin estado
 * en base (que es justo lo que no hay cuando esto hace falta).
 */
export function crearPaseRespaldo(secret: string | undefined): string {
  const exp = Date.now() + TTL_MS
  return `${exp}.${firma(exp, secret)}`
}

export function verificarPaseRespaldo(valor: string | undefined, secret: string | undefined): boolean {
  if (!valor) return false
  const [crudo, mac] = valor.split('.')
  const exp = Number(crudo)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const esperada = firma(exp, secret)
  if (!mac || mac.length !== esperada.length) return false
  try {
    return timingSafeEqual(Buffer.from(mac), Buffer.from(esperada))
  } catch {
    return false
  }
}

function firma(exp: number, secret: string | undefined): string {
  // El prefijo separa dominios: la misma clave firmando otra cosa no puede
  // producir un valor que valga como pase de respaldo.
  return createHmac('sha256', secret ?? 'sin-secreto').update(`portal-respaldo:v1:${exp}`).digest('hex')
}

// ── Identidad sintética ─────────────────────────────────────────────────────

/**
 * Lo que el middleware pone en `Astro.locals.portal`. Es deliberadamente el
 * mismo visitante que ve la demo, con el mismo rótulo, para que la página no
 * tenga que distinguir dos clases de invitado.
 */
export const SESION_RESPALDO = {
  user: {
    id: RESPALDO_USER_ID,
    clientId: RESPALDO_CLIENT_ID,
    email: 'demo@codebymike.tech',
    name: 'Visitante demo',
    role: 'owner' as const,
    status: 'active' as const,
  },
  client: {
    id: RESPALDO_CLIENT_ID,
    name: datos.cliente.nombre,
    company: datos.cliente.empresa,
    portalEnabled: true,
    billingInfo: JSON.stringify(datos.cliente.datosFacturacion),
  },
}

// ── Snapshot ────────────────────────────────────────────────────────────────
//
// Las fechas se guardan en el JSON como DESPLAZAMIENTOS en días respecto a hoy,
// no como fechas absolutas. Una factura "vence en 9 días" tiene que seguir
// venciendo en 9 días dentro de un mes, o la demo envejece y empieza a mostrar
// todo vencido. Es el mismo truco que usa scripts/seed-demo.mjs.

const dias = (n: number) => new Date(Date.now() + n * 86_400_000)

export function proyectosRespaldo() {
  return datos.proyectos.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    status: p.status,
    techStack: p.techStack,
    previewUrl: p.previewUrl,
    startDate: p.startDateDias === null ? null : dias(p.startDateDias),
    endDate: p.endDateDias === null ? null : dias(p.endDateDias),
  }))
}

export function hitosRespaldo(): Milestone[] {
  return datos.hitos.map((h) => ({
    id: h.id,
    projectId: h.projectId,
    title: h.title,
    description: h.description,
    status: h.status,
    dueAt: h.dueAtDias === null ? null : dias(h.dueAtDias),
    completedAt: h.completedAtDias === null ? null : dias(h.completedAtDias),
    visibleToClient: true,
    sortOrder: h.sortOrder,
    createdAt: dias(h.createdAtDias),
  })) as Milestone[]
}

export function saludRespaldo(): ServiceHealth {
  return {
    monitorCount: datos.salud.monitorCount,
    uptimePct: datos.salud.uptimePct,
    avgLatencyMs: datos.salud.avgLatencyMs,
    status: datos.salud.status as ServiceHealth['status'],
    openIncidents: datos.salud.openIncidents,
    lastCheckedAt: new Date(Date.now() - datos.salud.ultimoSondeoMinutos * 60_000),
  }
}

/**
 * Las funciones reales devuelven proyecciones con JOIN, no la fila cruda de
 * `invoices`. El snapshot tiene que calcar ESA forma, no la de la tabla: si se
 * desvía, `astro check` rompe aquí, que es donde debe romper.
 */
export function facturasRespaldo() {
  return datos.facturas.map((f) => ({
    id: f.id,
    number: f.number,
    status: f.status as InvoiceStatus,
    currency: f.currency,
    totalCents: f.totalCents,
    issuedAt: dias(f.issuedAtDias),
    dueAt: dias(f.dueAtDias),
    paidAt: f.paidAtDias === null ? null : dias(f.paidAtDias),
    projectTitle: proyectoDe(f.projectId),
  }))
}

const proyectoDe = (id: number | null) =>
  datos.proyectos.find((p) => p.id === id)?.title ?? null

export function facturaRespaldo(id: number) {
  const f = datos.facturas.find((x) => x.id === id)
  if (!f) return null

  const invoice = {
    id: f.id,
    number: f.number,
    status: f.status as InvoiceStatus,
    currency: f.currency,
    subtotalCents: f.subtotalCents,
    taxCents: f.taxCents,
    totalCents: f.totalCents,
    notes: f.notes,
    issuedAt: dias(f.issuedAtDias),
    dueAt: dias(f.dueAtDias),
    paidAt: f.paidAtDias === null ? null : dias(f.paidAtDias),
    paymentId: null as number | null,
    projectTitle: proyectoDe(f.projectId),
    clientName: datos.cliente.nombre,
    company: datos.cliente.empresa,
    billingInfo: JSON.stringify(datos.cliente.datosFacturacion),
  }

  const items = f.items.map((it, i) => ({
    id: i + 1,
    invoiceId: f.id,
    description: it.description,
    quantity: it.quantity,
    unitCents: it.unitCents,
    totalCents: Math.round(it.quantity * it.unitCents),
    sortOrder: i,
  })) as InvoiceItem[]

  return { invoice, items }
}

export function resumenFacturasRespaldo(): InvoiceSummary {
  const vivas = datos.facturas.filter((f) => f.status !== 'draft')
  const porPagar = vivas.filter((f) => f.status === 'sent' || f.status === 'overdue')
  return {
    dueCents: porPagar.reduce((s, f) => s + f.totalCents, 0),
    dueCount: porPagar.length,
    overdueCount: vivas.filter((f) => f.status === 'overdue').length,
    paidThisYearCents: vivas.filter((f) => f.status === 'paid').reduce((s, f) => s + f.totalCents, 0),
    currency: vivas[0]?.currency ?? 'COP',
  }
}

export function actividadRespaldo(): ActivityPage {
  return {
    items: datos.actividad.map((a) => ({
      id: a.id,
      clientId: RESPALDO_CLIENT_ID,
      projectId: a.projectId,
      type: a.type as ActivityType,
      title: a.title,
      detail: a.detail,
      href: a.href,
      visibleToClient: true,
      at: dias(-a.haceDias),
    })),
    nextCursor: null,
  }
}

/**
 * Rutas que el snapshot sabe servir. Allowlist explícita y corta a propósito:
 * una página del portal que no esté aquí (documentos, mensajes, cuenta) haría
 * consultas sin guarda de respaldo y reventaría con la base caída. Es preferible
 * mandarla al inicio del portal que enseñarle un 500 al jurado.
 */
export function rutaCubiertaPorRespaldo(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return p === '/portal' || p === '/portal/facturas' || /^\/portal\/facturas\/\d+$/.test(p)
}
