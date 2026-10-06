// Fichas de la base para la búsqueda instantánea del panel: clientes,
// proyectos, cuentas de cobro y facturas, cotizaciones (briefings) y
// propuestas de Plano. La puntuación y el menú viven en buscar.ts (puro).
//
// Cada consulta nombra sus columnas, como las herramientas del asistente: este
// resultado también llega al modelo cuando lo usa `buscar_en_panel`, y un
// select() completo de `clients` arrastraría su billingInfo.
//
// Importa `src/db`: solo servidor.

import { desc, isNull, like, or, and, eq, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { db } from '../../db'
import { briefings, clients, invoices, projects, propuestas } from '../../db/schema'
import { buscarEnMenu, mezclar, puntuar, terminos, type ResultadoBusqueda } from './buscar'

const POR_TABLA = 25

/**
 * Los términos llegan sin tildes ("barberia") y LIKE de SQLite no las pliega:
 * no casaría con "Barbería". Cada vocal y la n van como `_` (un carácter
 * cualquiera, también í o ñ), así la base devuelve de más y `puntuar`, que sí
 * normaliza, descarta lo que sobra. `%` y `_` del texto ya los quitó `terminos`.
 */
const patron = (t: string) => `%${t.replace(/[aeioun]/g, '_')}%`

/** Alguna de las columnas contiene alguno de los términos. */
function contiene(columnas: SQLiteColumn[], ts: string[]): SQL | undefined {
  return or(...columnas.flatMap((c) => ts.map((t) => like(c, patron(t)))))
}

const ESTADO_CUENTA: Record<string, string> = { draft: 'borrador', sent: 'enviada', overdue: 'vencida', paid: 'pagada', void: 'anulada' }

export async function buscarFichas(consulta: string): Promise<ResultadoBusqueda[]> {
  const ts = terminos(consulta)
  if (!ts.length) return []

  const [cs, ps, cuentas, bs, props] = await Promise.all([
    db
      .select({ id: clients.id, nombre: clients.name, empresa: clients.company })
      .from(clients)
      .where(contiene([clients.name, clients.company], ts))
      .limit(POR_TABLA),
    db
      .select({ id: projects.id, titulo: projects.title, slug: projects.slug, estado: projects.status, cliente: clients.name })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(contiene([projects.title, projects.slug, clients.name], ts))
      .limit(POR_TABLA),
    db
      .select({
        id: invoices.id,
        numero: invoices.number,
        tipo: invoices.docType,
        estado: invoices.status,
        concepto: invoices.concept,
        cliente: clients.name,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(contiene([invoices.number, invoices.concept, clients.name], ts))
      .orderBy(desc(invoices.createdAt))
      .limit(POR_TABLA),
    db
      .select({ id: briefings.id, titulo: briefings.title, estado: briefings.status, cliente: clients.name })
      .from(briefings)
      .leftJoin(clients, eq(briefings.clientId, clients.id))
      .where(and(isNull(briefings.deletedAt), contiene([briefings.title, clients.name], ts)))
      .limit(POR_TABLA),
    db
      .select({ id: propuestas.id, titulo: propuestas.titulo, estado: propuestas.estado, cliente: clients.name })
      .from(propuestas)
      .leftJoin(clients, eq(propuestas.clientId, clients.id))
      .where(contiene([propuestas.titulo, clients.name], ts))
      .limit(POR_TABLA),
  ])

  // El nombre del cliente pesa menos que el título propio: buscando
  // "barbería" debe salir primero la ficha del cliente y luego sus cosas.
  const con = (titulo: string, cliente: string | null | undefined, extra = '') =>
    Math.max(puntuar(ts, titulo, extra), puntuar(ts, cliente ?? '', extra) * 0.6)

  return [
    ...cs.map((c) => ({
      tipo: 'cliente' as const,
      titulo: c.nombre,
      detalle: c.empresa ? `Cliente · ${c.empresa}` : 'Cliente',
      href: '/admin/clients',
      puntaje: Math.max(puntuar(ts, c.nombre), puntuar(ts, c.empresa ?? '')) + 0.5,
    })),
    ...ps.map((p) => ({
      tipo: 'proyecto' as const,
      titulo: p.titulo,
      detalle: ['Proyecto', p.cliente, p.estado].filter(Boolean).join(' · '),
      href: `/admin/projects/${p.id}`,
      puntaje: con(p.titulo, p.cliente, p.slug),
    })),
    ...cuentas.map((f) => ({
      tipo: f.tipo === 'cuenta_cobro' ? ('cuenta' as const) : ('factura' as const),
      titulo: f.numero,
      detalle: [f.tipo === 'cuenta_cobro' ? 'Cuenta de cobro' : 'Factura', f.cliente, ESTADO_CUENTA[f.estado] ?? f.estado].filter(Boolean).join(' · '),
      href: f.tipo === 'cuenta_cobro' ? `/admin/cuentas-cobro/${f.id}` : '/admin/portal/facturas',
      puntaje: con(f.numero, f.cliente, f.concepto ?? ''),
    })),
    ...bs.map((b) => ({
      tipo: 'cotizacion' as const,
      titulo: b.titulo,
      detalle: ['Briefing', b.cliente, b.estado].filter(Boolean).join(' · '),
      href: `/admin/briefings/${b.id}`,
      puntaje: con(b.titulo, b.cliente),
    })),
    ...props.map((p) => ({
      tipo: 'propuesta' as const,
      titulo: p.titulo,
      detalle: ['Propuesta', p.cliente, p.estado].filter(Boolean).join(' · '),
      href: `/admin/plano/${p.id}`,
      puntaje: con(p.titulo, p.cliente),
    })),
  ].filter((r) => r.puntaje > 0)
}

/** Menú + fichas, sin repetir y mejor puntaje primero. */
export async function buscarEnPanel(consulta: string, limite = 10): Promise<ResultadoBusqueda[]> {
  const menu = buscarEnMenu(consulta, limite)
  const fichas = await buscarFichas(consulta)
  return mezclar([menu, fichas], limite)
}
