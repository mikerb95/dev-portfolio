// El corazón de Plano: de una configuración a una propuesta calculada.
//
// `armarPropuesta` es una función PURA: la misma configuración, las mismas
// reglas y el mismo día dan exactamente el mismo snapshot, byte por byte. Por
// eso el constructor puede recalcular en vivo en el navegador y el servidor
// puede volver a calcular al guardar o al aceptar, y comparar: el servidor
// nunca se cree una cifra que venga del navegador.
//
// Los precios salen de calculo-cotizacion.ts (el mismo motor del sitio y del
// asistente), los planes de pago de pagos.ts y las cláusulas de la biblioteca.

import { clausulasPara } from '../../data/clausulas'
import { HITOS, SIEMPRE_ESENCIALES, type HitoId, type ReglasPlano } from '../../data/plano'
import { COMPONENTES, HOSTING_ANUAL, PAQUETES_WEB, REGLAS, TARIFA_HORA, type Moneda } from '../../data/tarifario'
import {
  cifrasPermitidas,
  cotizarPaquete,
  cotizarSoftware,
  type CotizacionSoftware,
  type Rango,
} from '../asistente/calculo-cotizacion'
import { CONTACTO_DEFAULT, normalizarContacto } from './contacto'
import { aISO, desdeISO, esFechaISO, habilEnODespues, sumarHabiles } from './fechas'
import { franjaDe, preguntasDe, respondidas, respuestasValidas } from './incertidumbre'
import { armarPlan, opcionesPlan, type TipoPlan } from './pagos'
import {
  NIVELES,
  type ConfigPropuesta,
  type EleccionCliente,
  type HitoCalculado,
  type LineaCalculada,
  type LineaConfig,
  type NivelVersion,
  type Prioridad,
  type Snapshot,
  type VersionCalculada,
} from './tipos'

// ── Normalización ───────────────────────────────────────────────────────────

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const PRIORIDADES: readonly Prioridad[] = ['esencial', 'recomendado', 'extra']
const PLANES: readonly TipoPlan[] = ['hitos', 'cuotas', 'contado']

export function configVacia(hoy: string): ConfigPropuesta {
  return {
    titulo: '',
    resumen: '',
    moneda: 'COP',
    cliente: { nombre: '', empresa: '', tipo: 'persona', correo: '', telefono: '', documento: '', ciclo: null },
    base: null,
    lineas: [],
    version: 'recomendada',
    ajustesLineas: {},
    planPago: 'hitos',
    numCuotas: 4,
    fechaInicio: hoy,
    exclusiones: [],
    clausulasDesactivadas: [],
    contacto: CONTACTO_DEFAULT,
    perillas: { version: true, planPago: true, lineas: [] },
  }
}

function normalizarLinea(v: unknown): LineaConfig | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const def = COMPONENTES.find((c) => c.id === o.id)
  if (!def) return null
  const cant = Math.round(Number(o.cantidad ?? 1))
  const cantidad = def.unidad ? Math.min(Math.max(Number.isFinite(cant) ? cant : 1, 1), 50) : 1
  const forzada = (SIEMPRE_ESENCIALES as readonly string[]).includes(def.id)
  const prioridad = forzada ? 'esencial' : PRIORIDADES.find((p) => p === o.prioridad) ?? 'recomendado'
  const linea: LineaConfig = { id: def.id, cantidad, prioridad, respuestas: respuestasValidas(def.id, o.respuestas as Record<string, unknown>) }
  const cita = texto(o.cita, 400)
  const razon = texto(o.razon, 300)
  if (cita) linea.cita = cita
  if (razon) linea.razon = razon
  return linea
}

/**
 * Lleva cualquier cosa (el body de un request, la salida de la IA, una fila
 * vieja) a una configuración válida. Nunca lanza: lo inválido se descarta o
 * vuelve a su valor por defecto.
 */
export function normalizarConfig(raw: unknown, hoy: string): ConfigPropuesta {
  const base = configVacia(hoy)
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const cli = (o.cliente && typeof o.cliente === 'object' ? o.cliente : {}) as Record<string, unknown>
  const ciclo = cli.ciclo && typeof cli.ciclo === 'object' ? (cli.ciclo as Record<string, unknown>) : null
  const corte = Math.round(Number(ciclo?.corteDia))
  const dias = Math.round(Number(ciclo?.diasPago))
  const moneda: Moneda = o.moneda === 'USD' ? 'USD' : 'COP'

  const vistas = new Set<string>()
  const lineas: LineaConfig[] = []
  for (const l of Array.isArray(o.lineas) ? o.lineas : []) {
    const n = normalizarLinea(l)
    if (n && !vistas.has(n.id)) {
      vistas.add(n.id)
      lineas.push(n)
    }
  }

  const ajustes: Record<string, boolean> = {}
  if (o.ajustesLineas && typeof o.ajustesLineas === 'object') {
    for (const [k, v] of Object.entries(o.ajustesLineas as Record<string, unknown>)) {
      if (vistas.has(k) && typeof v === 'boolean') ajustes[k] = v
    }
  }

  const per = (o.perillas && typeof o.perillas === 'object' ? o.perillas : {}) as Record<string, unknown>
  const perLineas = Array.isArray(per.lineas) ? per.lineas.filter((x): x is string => typeof x === 'string' && vistas.has(x)) : []

  return {
    titulo: texto(o.titulo, 160),
    resumen: texto(o.resumen, 2000),
    moneda,
    cliente: {
      nombre: texto(cli.nombre, 120),
      empresa: texto(cli.empresa, 160),
      tipo: cli.tipo === 'empresa' ? 'empresa' : 'persona',
      correo: texto(cli.correo, 160),
      telefono: texto(cli.telefono, 40),
      documento: texto(cli.documento, 40),
      ciclo:
        cli.tipo === 'empresa' && Number.isFinite(corte) && Number.isFinite(dias) && corte >= 1 && corte <= 28 && dias >= 0 && dias <= 120
          ? { corteDia: corte, diasPago: dias }
          : null,
    },
    base: o.base === 'presencia' || o.base === 'negocio' ? o.base : null,
    lineas,
    version: NIVELES.find((n) => n === o.version) ?? base.version,
    ajustesLineas: ajustes,
    planPago: PLANES.find((p) => p === o.planPago) ?? 'hitos',
    numCuotas: Math.min(Math.max(Math.round(Number(o.numCuotas)) || base.numCuotas, 1), 24),
    fechaInicio: esFechaISO(o.fechaInicio) ? o.fechaInicio : hoy,
    exclusiones: (Array.isArray(o.exclusiones) ? o.exclusiones : [])
      .map((x) => texto(x, 240))
      .filter(Boolean)
      .slice(0, 20),
    clausulasDesactivadas: (Array.isArray(o.clausulasDesactivadas) ? o.clausulasDesactivadas : []).filter((x): x is string => typeof x === 'string').slice(0, 40),
    contacto: normalizarContacto(o.contacto),
    perillas: { version: per.version !== false, planPago: per.planPago !== false, lineas: perLineas },
  }
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

const ORDEN_PRIORIDAD: Record<Prioridad, number> = { esencial: 0, recomendado: 1, extra: 2 }
const TECHO_NIVEL: Record<NivelVersion, number> = { esencial: 0, recomendada: 1, completa: 2 }

export function nivelIncluye(nivel: NivelVersion, prioridad: Prioridad): boolean {
  return ORDEN_PRIORIDAD[prioridad] <= TECHO_NIVEL[nivel]
}

function incluidaEn(l: LineaConfig, nivel: NivelVersion, ajustes: Record<string, boolean> | null): boolean {
  if (l.prioridad === 'esencial') return true
  return ajustes?.[l.id] ?? nivelIncluye(nivel, l.prioridad)
}

type Cotizado = { precio: Rango; horasBase: Rango; horas: Rango; software: CotizacionSoftware | null; ancho0: number }

/** Cotiza un conjunto de líneas con el motor compartido. null = no hay nada que cotizar. */
function cotizar(lineas: LineaConfig[], config: ConfigPropuesta): Cotizado | null {
  if (!lineas.length) {
    if (!config.base) return null
    const p = cotizarPaquete(config.base, config.moneda)
    // Un plan web solo no tiene tabla de horas: se estiman por su precio, que
    // es lo que se necesita para fechar los hitos.
    const h = Math.ceil(p.desde / TARIFA_HORA[config.moneda])
    return { precio: [p.desde, p.desde], horasBase: [h, h], horas: [h, h], software: null, ancho0: 0 }
  }
  const software = cotizarSoftware({
    moneda: config.moneda,
    base: config.base ?? undefined,
    componentes: lineas.map((l) => ({ id: l.id, cantidad: l.cantidad, ajuste: franjaDe(l.id, l.respuestas) })),
  })
  const abierto = cotizarSoftware({
    moneda: config.moneda,
    base: config.base ?? undefined,
    componentes: lineas.map((l) => ({ id: l.id, cantidad: l.cantidad })),
  })
  return {
    precio: software.precio,
    horasBase: software.horasBase,
    horas: software.horas,
    software,
    ancho0: abierto.horasBase[1] - abierto.horasBase[0],
  }
}

function cronograma(inicio: string, horasTotales: number, horasSemana: number): HitoCalculado[] {
  const firma = habilEnODespues(inicio)
  const porDia = Math.max(horasSemana / 5, 0.5)
  return (Object.keys(HITOS) as HitoId[]).map((id) => {
    const h = HITOS[id]
    const acumuladas = Math.round(horasTotales * h.avance * 10) / 10
    return {
      id,
      nombre: h.nombre,
      entregable: h.entregable,
      fecha: h.avance === 0 ? firma : sumarHabiles(firma, Math.ceil(acumuladas / porDia)),
      horasAcumuladas: acumuladas,
    }
  })
}

function sumarDiasCalendario(iso: string, n: number): string {
  const d = desdeISO(iso)
  d.setDate(d.getDate() + n)
  return aISO(d)
}

export class PropuestaVacia extends Error {
  constructor() {
    super('la propuesta no tiene componentes ni plan web')
    this.name = 'PropuestaVacia'
  }
}

/**
 * Calcula la propuesta completa. Lanza PropuestaVacia si no hay nada que
 * cotizar; cualquier otra cosa inválida ya la descartó `normalizarConfig`.
 */
export function armarPropuesta(config: ConfigPropuesta, reglas: ReglasPlano, hoy: string): Snapshot {
  const lineas = [...config.lineas].sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad])
  const elegidas = lineas.filter((l) => incluidaEn(l, config.version, config.ajustesLineas))
  const cot = cotizar(elegidas, config)
  if (!cot) throw new PropuestaVacia()

  // Las tres versiones, sin los ajustes puntuales del cliente: son la
  // referencia contra la que el cliente compara.
  const todas = lineas.map((l) => l.id)
  const nombre = (id: string) => COMPONENTES.find((c) => c.id === id)?.nombre ?? id
  const versiones: VersionCalculada[] = []
  for (const nivel of NIVELES) {
    const ls = lineas.filter((l) => incluidaEn(l, nivel, null))
    const c = cotizar(ls, config)
    if (!c) continue
    const ids = ls.map((l) => l.id)
    const anterior = versiones[versiones.length - 1]
    versiones.push({
      nivel,
      precio: c.precio[1],
      rango: c.precio,
      horas: c.horas,
      lineas: ids,
      sinIncluir: todas.filter((id) => !ids.includes(id)).map(nombre),
      repetida: !!anterior && anterior.lineas.join() === ids.join(),
    })
  }

  const lineasCalc: LineaCalculada[] = lineas.map((l) => {
    const def = COMPONENTES.find((c) => c.id === l.id)!
    const enCotizacion = cot.software?.lineas.find((x) => x.id === l.id)
    const franja = franjaDe(l.id, l.respuestas)
    const ancho = def.horas[1] - def.horas[0]
    const media = (x: number) => Math.round(x * 2) / 2
    const horas: Rango = enCotizacion?.horas ?? [media((def.horas[0] + ancho * franja[0]) * l.cantidad), media((def.horas[0] + ancho * franja[1]) * l.cantidad)]
    const out: LineaCalculada = {
      id: l.id,
      nombre: def.nombre,
      unidad: def.unidad,
      cantidad: l.cantidad,
      prioridad: l.prioridad,
      incluida: elegidas.includes(l),
      horas,
      horasTabla: [def.horas[0] * l.cantidad, def.horas[1] * l.cantidad],
      preguntasRespondidas: respondidas(l.id, l.respuestas),
      preguntasTotal: preguntasDe(l.id).length,
    }
    if (l.cita) out.cita = l.cita
    if (l.razon) out.razon = l.razon
    return out
  })

  const precio = cot.precio[1]
  const anchoAhora = cot.horasBase[1] - cot.horasBase[0]
  const certeza = cot.ancho0 > 0 ? Math.round((1 - anchoAhora / cot.ancho0) * 100) / 100 : 1
  const hitos = cronograma(config.fechaInicio, cot.horas[1], reglas.horasSemana)
  const fechaHito = Object.fromEntries(hitos.map((h) => [h.id, h.fecha])) as Record<HitoId, string>
  const plan = armarPlan({
    precio,
    moneda: config.moneda,
    reglas,
    tipo: config.planPago,
    numCuotas: config.numCuotas,
    hitos: fechaHito,
    cliente: { tipo: config.cliente.tipo, ciclo: config.cliente.ciclo },
  })
  const opc = opcionesPlan(precio, config.moneda, reglas)
  const numCuotas = plan.pagos.filter((p) => p.cuota).length

  const clausulas = clausulasPara(
    {
      componentes: elegidas.map((l) => l.id),
      base: config.base,
      moneda: config.moneda,
      planTipo: plan.tipo,
      numCuotas,
      recargoMensualPct: reglas.cuotas.recargoMensualPct,
      contacto: config.contacto,
    },
    config.clausulasDesactivadas,
  )

  const baseInfo = config.base ? PAQUETES_WEB.find((p) => p.id === config.base)! : null
  const cifras = new Set<number>([precio, ...cot.precio, plan.total, plan.recargoTotal, plan.descuento, TARIFA_HORA[config.moneda]])
  for (const v of versiones) [v.precio, ...v.rango].forEach((x) => cifras.add(x))
  for (const p of plan.pagos) {
    cifras.add(p.monto)
    if (p.cuota) [p.cuota.abono, p.cuota.recargo, p.cuota.saldo].forEach((x) => cifras.add(x))
  }
  if (baseInfo) {
    cifras.add(baseInfo.desde[config.moneda])
    cifras.add(HOSTING_ANUAL[baseInfo.id as 'presencia' | 'negocio'][config.moneda])
  }
  if (cot.software) cifrasPermitidas([cot.software]).forEach((x) => cifras.add(x))
  cifras.delete(0)

  return {
    formato: 1,
    generadoEl: hoy,
    titulo: config.titulo,
    resumen: config.resumen,
    moneda: config.moneda,
    cliente: config.cliente,
    base: baseInfo ? { id: baseInfo.id as 'presencia' | 'negocio', nombre: baseInfo.nombre, precio: baseInfo.desde[config.moneda] } : null,
    lineas: lineasCalc,
    version: config.version,
    versiones,
    precio,
    rango: cot.precio,
    horas: cot.horas,
    colchonPct: Math.round(REGLAS.colchon * 100),
    tarifaHora: TARIFA_HORA[config.moneda],
    aplicoMinimo: cot.software?.aplicoMinimo ?? false,
    certeza,
    hitos,
    plan,
    opcionesPlan: { cuotas: opc.cuotas, contado: opc.contado, maxCuotas: opc.maxCuotas },
    clausulas,
    contacto: config.contacto,
    exclusiones: config.exclusiones,
    perillas: config.perillas,
    validoHasta: sumarDiasCalendario(hoy, REGLAS.validezDias),
    cifras: [...cifras].sort((a, b) => a - b),
  }
}

/**
 * Aplica lo que el cliente eligió en su enlace, solo dentro de las perillas que
 * Mike habilitó. Lo que no esté permitido se ignora sin error: el cliente no
 * tiene por qué saber qué perillas existen.
 */
export function aplicarEleccion(config: ConfigPropuesta, e: EleccionCliente): ConfigPropuesta {
  const out: ConfigPropuesta = { ...config, ajustesLineas: { ...config.ajustesLineas } }
  if (config.perillas.version && e.version && NIVELES.includes(e.version)) out.version = e.version
  if (config.perillas.planPago && e.planPago && PLANES.includes(e.planPago)) {
    out.planPago = e.planPago
    const n = Math.round(Number(e.numCuotas))
    if (Number.isInteger(n) && n >= 1 && n <= 24) out.numCuotas = n
  }
  if (e.lineas && typeof e.lineas === 'object') {
    for (const id of config.perillas.lineas) {
      const v = e.lineas[id]
      if (typeof v === 'boolean') out.ajustesLineas[id] = v
    }
  }
  return out
}

/** Qué falta para poder enviar la propuesta al cliente. */
export function faltantesEnvio(config: ConfigPropuesta): string[] {
  const f: string[] = []
  if (!config.titulo) f.push('un título')
  if (!config.cliente.nombre) f.push('el nombre del cliente')
  if (!config.lineas.length && !config.base) f.push('al menos un componente o un plan web')
  if (!config.contacto.contacto.nombre) f.push('el contacto del cliente (mapa de contacto)')
  return f
}
