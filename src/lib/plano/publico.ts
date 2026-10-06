// Lo que ve el cliente en su enlace. Módulo PURO.
//
// El snapshot completo tiene cosas que el cliente no debe ver: las citas de
// la conversación privada, las horas internas, el rango de incertidumbre (es
// el margen de Mike), las cláusulas desactivadas y la lista de cifras de la
// guardia. Todo lo que sale hacia el enlace pasa por `vistaCliente`.

import type { ClausulaRenderizada } from '../../data/clausulas'
import type { MapaContacto } from './contacto'
import { aplicarEleccion } from './propuesta'
import type { PlanPago } from './pagos'
import type { ConfigPropuesta, EleccionCliente, HitoCalculado, NivelVersion, PerillasConfig, Prioridad, Snapshot } from './tipos'

export type VistaCliente = {
  titulo: string
  resumen: string
  moneda: Snapshot['moneda']
  cliente: { nombre: string; empresa: string }
  base: Snapshot['base']
  lineas: { id: string; nombre: string; cantidad: number; prioridad: Prioridad; incluida: boolean }[]
  version: NivelVersion
  versiones: { nivel: NivelVersion; precio: number; sinIncluir: string[]; repetida: boolean }[]
  precio: number
  hitos: HitoCalculado[]
  plan: PlanPago
  opcionesPlan: Snapshot['opcionesPlan']
  clausulas: Omit<ClausulaRenderizada, 'activa' | 'motivo'>[]
  contacto: Omit<MapaContacto, 'pagador' | 'decisor'> & { decisor: string | null; pagador: string | null }
  exclusiones: string[]
  perillas: PerillasConfig
  validoHasta: string
  generadoEl: string
}

export function vistaCliente(s: Snapshot): VistaCliente {
  return {
    titulo: s.titulo,
    resumen: s.resumen,
    moneda: s.moneda,
    cliente: { nombre: s.cliente.nombre, empresa: s.cliente.empresa },
    base: s.base,
    lineas: s.lineas.map((l) => ({ id: l.id, nombre: l.nombre, cantidad: l.cantidad, prioridad: l.prioridad, incluida: l.incluida })),
    version: s.version,
    versiones: s.versiones.map((v) => ({ nivel: v.nivel, precio: v.precio, sinIncluir: v.sinIncluir, repetida: v.repetida })),
    precio: s.precio,
    hitos: s.hitos,
    plan: s.plan,
    opcionesPlan: s.opcionesPlan,
    clausulas: s.clausulas.filter((c) => c.activa).map((c) => ({ id: c.id, titulo: c.titulo, formal: c.formal, simple: c.simple })),
    contacto: {
      contacto: s.contacto.contacto,
      canal: s.contacto.canal,
      horario: s.contacto.horario,
      respuestaMikeHoras: s.contacto.respuestaMikeHoras,
      respuestaClienteDias: s.contacto.respuestaClienteDias,
      diasPausa: s.contacto.diasPausa,
      seguimiento: s.contacto.seguimiento,
      decisor: s.contacto.decisor?.nombre ?? null,
      pagador: s.contacto.pagador?.nombre ?? null,
    },
    exclusiones: s.exclusiones,
    perillas: s.perillas,
    validoHasta: s.validoHasta,
    generadoEl: s.generadoEl,
  }
}

/**
 * La configuración con la que se recalcula lo que el cliente eligió: la de la
 * versión enviada, con sus perillas aplicadas y, si la fecha de inicio ya pasó,
 * corrida a hoy (las fechas se recalculan desde el día en que acepta).
 */
export function configParaCliente(base: ConfigPropuesta, e: EleccionCliente, hoy: string): ConfigPropuesta {
  const c = aplicarEleccion(base, e)
  return c.fechaInicio < hoy ? { ...c, fechaInicio: hoy } : c
}

/** Normaliza lo que manda el navegador del cliente. Nunca lanza. */
export function leerEleccion(v: unknown): EleccionCliente {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const e: EleccionCliente = {}
  if (o.version === 'esencial' || o.version === 'recomendada' || o.version === 'completa') e.version = o.version
  if (o.planPago === 'hitos' || o.planPago === 'cuotas' || o.planPago === 'contado') e.planPago = o.planPago
  const n = Math.round(Number(o.numCuotas))
  if (Number.isInteger(n) && n >= 1 && n <= 24) e.numCuotas = n
  if (o.lineas && typeof o.lineas === 'object') {
    const ls: Record<string, boolean> = {}
    for (const [k, val] of Object.entries(o.lineas as Record<string, unknown>).slice(0, 30)) if (typeof val === 'boolean') ls[k] = val
    e.lineas = ls
  }
  return e
}

/** ¿La elección no cambia nada respecto de la versión enviada? */
export function eleccionVacia(base: ConfigPropuesta, c: ConfigPropuesta): boolean {
  return (
    base.version === c.version &&
    base.planPago === c.planPago &&
    base.numCuotas === c.numCuotas &&
    base.fechaInicio === c.fechaInicio &&
    JSON.stringify(Object.entries(base.ajustesLineas).sort()) === JSON.stringify(Object.entries(c.ajustesLineas).sort())
  )
}

/** Anticipo: el primer pago del plan (al firmar). */
export const anticipoDe = (s: Pick<Snapshot, 'plan'>): number => s.plan.pagos[0]?.monto ?? 0
