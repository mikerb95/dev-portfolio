// Motor de Cotiza (RF-221, docs/plan-cotiza.md): horas por entregable, precio
// de la propuesta, plan de pagos, consumo de cupos y precio de los adicionales.
//
// La regla que ordena todo: EL PRECIO BASE NO SE TOCA. Lo que pasa después de
// aceptar (reuniones de más, rondas de más, pedidos nuevos) nunca modifica la
// cifra pactada; sale como adicional con su propio precio, calculado con las
// tarifas congeladas en la propuesta. `totalVigente` lo deja explícito: suma,
// no reescribe.
//
// Todo en unidades enteras de la moneda (pesos o dólares), como el tarifario y
// Plano. Las cifras salen de src/data/cotiza.ts; la IA de la Fase 3 elige
// entregables y horas, nunca precios.
//
// Módulo PURO e isomorfo: sin base de datos ni node:crypto, para que la vista
// pueda recalcular en el navegador lo mismo que el servidor.

import {
  CUPOS_POR_DEFECTO,
  HORA_USD,
  HORAS_ENTREGABLE,
  NIVELES,
  REGLAS_COTIZA,
  type Cupos,
  type NivelConsultoria,
  type ReglasCotiza,
} from '../../data/cotiza'
import { REGLAS_DEFAULT, type ReglasPlano } from '../../data/plano'
import type { Moneda } from '../../data/tarifario'
import { repartir, tramoPara } from '../plano/pagos'
import { esFestivo } from '../festivos-co'
import { sumarHabiles } from '../plano/fechas'

export class ErrorCotiza extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorCotiza'
  }
}

// ── Tarifas ─────────────────────────────────────────────────────────────────

export type Tarifas = { moneda: Moneda; hora: Record<NivelConsultoria, number> }

const ORDEN_NIVEL: NivelConsultoria[] = NIVELES.map((n) => n.id)

/**
 * Las tarifas de hoy, para congelarlas en una propuesta. En dólares hay una
 * sola tarifa para cualquier nivel (decisión de Mike): no es una conversión.
 */
export function tarifasVigentes(moneda: Moneda): Tarifas {
  const hora = Object.fromEntries(
    NIVELES.map((n) => [n.id, moneda === 'COP' ? n.horaCop : HORA_USD])
  ) as Record<NivelConsultoria, number>
  return { moneda, hora }
}

// ── Entregables y horas ─────────────────────────────────────────────────────

export type Entregable =
  | { tipo: 'presentacion'; nombre: string; diapositivas: number; anexos: boolean; documentosFuente: number; cantidad?: number }
  | { tipo: 'revision'; nombre: string; documentos: number; paginasPorDocumento: number }
  | { tipo: 'libre'; nombre: string; nivel: NivelConsultoria; horas: number }

export type HorasEntregable = { horas: number; nivel: NivelConsultoria; regla: string }

function entero(v: unknown, campo: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new ErrorCotiza(`${campo} inválido: ${String(v)} (entero entre ${min} y ${max})`)
  }
  return v
}

/** Horas en medias horas: nadie cotiza 1,37 h y una fracción rara suele ser un error de tecleo. */
function horasValidas(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.5 || v > 200 || !Number.isInteger(v * 2)) {
    throw new ErrorCotiza(`horas inválidas: ${String(v)} (de 0,5 a 200, en medias horas)`)
  }
  return v
}

function nombreValido(v: unknown): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > 120) {
    throw new ErrorCotiza('cada entregable necesita un nombre de hasta 120 caracteres')
  }
  return v.trim()
}

export function horasDe(e: Entregable): HorasEntregable {
  const reglas = HORAS_ENTREGABLE
  switch (e?.tipo) {
    case 'presentacion': {
      const d = entero(e.diapositivas, 'diapositivas', 1, 500)
      const docs = entero(e.documentosFuente, 'documentos de base', 0, 200)
      const cantidad = entero(e.cantidad ?? 1, 'cantidad', 1, 50)
      const p = reglas.presentacion
      const basica = d <= p.basica.maxDiapositivas && !e.anexos && docs <= p.basica.maxDocumentosFuente
      let horas: number = basica ? p.basica.horas : p.completa.horas
      const extra = d > p.grandeDesde ? Math.ceil((d - p.grandeDesde) / p.bloqueDiapositivas) : 0
      horas += extra
      const partes = [
        basica
          ? `hasta ${p.basica.maxDiapositivas} diapositivas, sin anexos y hasta ${p.basica.maxDocumentosFuente} documentos de base: ${p.basica.horas} h`
          : `más de ${p.basica.maxDiapositivas} diapositivas, con anexos o más de ${p.basica.maxDocumentosFuente} documentos de base: ${p.completa.horas} h`,
      ]
      if (extra) partes.push(`+${extra} h por pasar de ${p.grandeDesde} diapositivas`)
      if (cantidad > 1) partes.push(`× ${cantidad}`)
      return { horas: horas * cantidad, nivel: 'documental', regla: partes.join(', ') }
    }
    case 'revision': {
      const docs = entero(e.documentos, 'documentos', 1, 200)
      const pags = entero(e.paginasPorDocumento, 'páginas por documento', 1, 2000)
      const r = reglas.revision
      // Un documento de 45 páginas pesa como tres de 20.
      const equivalentes = docs * Math.ceil(pags / r.paginasPorDocumento)
      const horas = Math.ceil(equivalentes / r.documentosPorHora)
      return {
        nivel: 'documental',
        horas,
        regla: `${equivalentes} documento(s) de hasta ${r.paginasPorDocumento} páginas, ${r.documentosPorHora} por hora`,
      }
    }
    case 'libre': {
      if (!ORDEN_NIVEL.includes(e.nivel)) throw new ErrorCotiza(`nivel inválido: ${String(e.nivel)}`)
      return { horas: horasValidas(e.horas), nivel: e.nivel, regla: 'horas estimadas a mano' }
    }
    default:
      throw new ErrorCotiza(`tipo de entregable desconocido: ${String((e as { tipo?: unknown })?.tipo)}`)
  }
}

// ── Propuesta ───────────────────────────────────────────────────────────────

export type LineaCotiza = HorasEntregable & { nombre: string; tipo: Entregable['tipo']; tarifa: number; subtotal: number }

export type PagoCotiza = { n: number; concepto: string; pct: number; monto: number }

export type CotizacionConsultoria = {
  moneda: Moneda
  lineas: LineaCotiza[]
  horas: number
  subtotal: number
  colchon: number
  /** Lo que se pacta. Redondeado hacia arriba y nunca por debajo del mínimo. */
  precio: number
  minimoAplicado: boolean
  pagos: PagoCotiza[]
  tarifas: Tarifas
  cupos: Cupos
  reglas: ReglasCotiza
  validezDias: number
}

export type PedidoCotiza = {
  moneda: Moneda
  entregables: Entregable[]
  /** Si se omiten, las de hoy. Una propuesta ya enviada pasa las que congeló. */
  tarifas?: Tarifas
  cupos?: Cupos
  reglas?: ReglasCotiza
  /** Reglas de pago de Plano (los tramos por monto son los mismos para todo lo que cobra Mike). */
  reglasPago?: ReglasPlano
}

/** Redondea HACIA ARRIBA: cotizar por debajo es perder plata. */
export function redondearArriba(valor: number, paso: number): number {
  // El épsilon evita que 57500.00000001 por coma flotante salte un paso entero.
  return Math.ceil(valor / paso - 1e-9) * paso
}

const CONCEPTOS: Record<number, string[]> = {
  1: ['Al aceptar la propuesta'],
  2: ['Al aceptar la propuesta', 'Al entregar'],
  3: ['Al aceptar la propuesta', 'Con la primera entrega', 'Al entregar todo'],
  4: ['Al aceptar la propuesta', 'Con la primera entrega', 'Con la segunda entrega', 'Al entregar todo'],
}

/**
 * Plan de pagos con los tramos de Plano: mismos porcentajes por monto, pero con
 * los conceptos de una consultoría (aquí no hay "diseño" ni "publicación").
 */
export function planDePagos(precio: number, moneda: Moneda, reglasPago: ReglasPlano = REGLAS_DEFAULT): PagoCotiza[] {
  const pcts = tramoPara(precio, moneda, reglasPago).pagos.map((p) => p.pct)
  const montos = repartir(precio, pcts, moneda)
  const nombres = CONCEPTOS[pcts.length] ?? pcts.map((_, i) => (i === 0 ? 'Al aceptar la propuesta' : `Pago ${i + 1}`))
  return pcts.map((pct, i) => ({ n: i + 1, concepto: nombres[i], pct, monto: montos[i] }))
}

export function cotizar(p: PedidoCotiza): CotizacionConsultoria {
  if (p?.moneda !== 'COP' && p?.moneda !== 'USD') throw new ErrorCotiza(`moneda inválida: ${String(p?.moneda)}`)
  if (!Array.isArray(p.entregables) || p.entregables.length === 0) throw new ErrorCotiza('la propuesta necesita al menos un entregable')
  if (p.entregables.length > 40) throw new ErrorCotiza('demasiados entregables (máximo 40)')

  const moneda = p.moneda
  const tarifas = p.tarifas ?? tarifasVigentes(moneda)
  if (tarifas.moneda !== moneda) throw new ErrorCotiza('las tarifas no son de la moneda de la propuesta')
  const reglas = p.reglas ?? REGLAS_COTIZA
  const cupos = p.cupos ?? CUPOS_POR_DEFECTO

  const lineas: LineaCotiza[] = p.entregables.map((e) => {
    const nombre = nombreValido(e?.nombre)
    const h = horasDe(e)
    const tarifa = tarifas.hora[h.nivel]
    return { ...h, nombre, tipo: e.tipo, tarifa, subtotal: h.horas * tarifa }
  })

  const horas = lineas.reduce((t, l) => t + l.horas, 0)
  const subtotal = lineas.reduce((t, l) => t + l.subtotal, 0)
  const colchon = subtotal * reglas.colchon
  const redondeado = redondearArriba(subtotal + colchon, reglas.redondeo[moneda])
  const minimo = reglas.minimo[moneda]
  const precio = Math.max(redondeado, minimo)

  return {
    moneda,
    lineas,
    horas,
    subtotal,
    colchon,
    precio,
    minimoAplicado: precio > redondeado,
    pagos: planDePagos(precio, moneda, p.reglasPago),
    tarifas,
    cupos,
    reglas,
    validezDias: reglas.validezDias,
  }
}

/**
 * Nivel con el que se cobran las reuniones de más: el del trabajo que domina
 * el encargo (más horas). En empate, el más alto, porque la reunión se da al
 * nivel de lo más difícil que se está discutiendo.
 */
export function nivelDelEncargo(c: Pick<CotizacionConsultoria, 'lineas'>): NivelConsultoria {
  const porNivel = new Map<NivelConsultoria, number>()
  for (const l of c.lineas) porNivel.set(l.nivel, (porNivel.get(l.nivel) ?? 0) + l.horas)
  let mejor: NivelConsultoria = 'documental'
  let max = -1
  for (const n of ORDEN_NIVEL) {
    const h = porNivel.get(n) ?? 0
    if (h > 0 && h >= max) {
      mejor = n
      max = h
    }
  }
  return mejor
}

// ── Cupos ───────────────────────────────────────────────────────────────────

export type Excedente =
  | { tipo: 'reunion_extra'; reunion: number; minutos: number }
  | { tipo: 'reunion_larga'; reunion: number; minutosDeMas: number }
  | { tipo: 'ronda_extra'; entregable: number; ronda: number }

export type ConsumoCupos = {
  reuniones: { incluidas: number; usadas: number; restantes: number }
  rondas: { entregable: number; incluidas: number; usadas: number; restantes: number }[]
  /** Lo que ya no cabe en los cupos: cada uno se propone como adicional. */
  excedentes: Excedente[]
}

/**
 * Cuenta lo usado contra lo incluido. Las reuniones se cuentan en el orden en
 * que ocurrieron: las primeras ocupan los cupos y, si se pasan del tiempo
 * pactado (más la gracia), el exceso es adicional; las siguientes son
 * adicionales completas.
 *
 * `reuniones`: minutos de cada reunión. `rondasPorEntregable`: rondas de
 * cambios pedidas en cada entregable, en el orden de la propuesta.
 */
export function consumoDeCupos(
  cupos: Cupos,
  uso: { reuniones: number[]; rondasPorEntregable: number[] },
  reglas: ReglasCotiza = REGLAS_COTIZA
): ConsumoCupos {
  const excedentes: Excedente[] = []

  uso.reuniones.forEach((min, i) => {
    const minutos = entero(min, 'minutos de reunión', 1, 600)
    if (i >= cupos.reuniones) {
      excedentes.push({ tipo: 'reunion_extra', reunion: i + 1, minutos })
    } else if (minutos > cupos.minutosPorReunion + reglas.graciaReunionMin) {
      excedentes.push({ tipo: 'reunion_larga', reunion: i + 1, minutosDeMas: minutos - cupos.minutosPorReunion })
    }
  })

  const rondas = uso.rondasPorEntregable.map((r, i) => {
    const usadas = entero(r, 'rondas de cambios', 0, 100)
    for (let k = cupos.rondasDeCambios + 1; k <= usadas; k++) excedentes.push({ tipo: 'ronda_extra', entregable: i, ronda: k })
    return { entregable: i, incluidas: cupos.rondasDeCambios, usadas, restantes: Math.max(0, cupos.rondasDeCambios - usadas) }
  })

  const usadas = uso.reuniones.length
  return {
    reuniones: { incluidas: cupos.reuniones, usadas, restantes: Math.max(0, cupos.reuniones - usadas) },
    rondas,
    excedentes,
  }
}

// ── Adicionales ─────────────────────────────────────────────────────────────

/** Minutos de reunión a horas cobrables, en bloques (30 min por defecto). */
export function horasDeReunion(minutos: number, reglas: ReglasCotiza = REGLAS_COTIZA): number {
  const m = entero(minutos, 'minutos', 1, 600)
  return (Math.ceil(m / reglas.bloqueReunionMin) * reglas.bloqueReunionMin) / 60
}

export type PrecioAdicional = { horas: number; nivel: NivelConsultoria; tarifa: number; recargo: number; monto: number }

/**
 * Precio de un adicional con las tarifas CONGELADAS del encargo. Sin colchón:
 * el colchón cubre la coordinación de la propuesta, y un adicional ya se mide
 * sobre trabajo concreto. El recargo de urgencia solo aplica si el pedido
 * llegó fuera del horario pactado.
 */
export function precioAdicional(
  a: { horas: number; nivel: NivelConsultoria; urgente: boolean },
  tarifas: Tarifas,
  cupos: Cupos,
  reglas: ReglasCotiza = REGLAS_COTIZA
): PrecioAdicional {
  const horas = horasValidas(a.horas)
  if (!ORDEN_NIVEL.includes(a.nivel)) throw new ErrorCotiza(`nivel inválido: ${String(a.nivel)}`)
  const tarifa = tarifas.hora[a.nivel]
  const base = horas * tarifa
  const recargo = a.urgente ? base * cupos.recargoUrgencia : 0
  const monto = redondearArriba(base + recargo, reglas.redondeoAdicional[tarifas.moneda])
  return { horas, nivel: a.nivel, tarifa, recargo, monto }
}

/** Precio de lo que excede los cupos. Las rondas de más las estima Mike en horas. */
export function precioExcedente(
  ex: Excedente,
  ctx: { tarifas: Tarifas; cupos: Cupos; nivel: NivelConsultoria; horasRonda?: number; urgente?: boolean },
  reglas: ReglasCotiza = REGLAS_COTIZA
): PrecioAdicional {
  const horas =
    ex.tipo === 'reunion_extra'
      ? horasDeReunion(ex.minutos, reglas)
      : ex.tipo === 'reunion_larga'
        ? horasDeReunion(ex.minutosDeMas, reglas)
        : horasValidas(ctx.horasRonda)
  return precioAdicional({ horas, nivel: ctx.nivel, urgente: ctx.urgente ?? false }, ctx.tarifas, ctx.cupos, reglas)
}

export type EstadoAdicional = 'propuesto' | 'aprobado' | 'rechazado'

export type TotalVigente = { base: number; aprobados: number; propuestos: number; total: number }

/** Precio base intacto + adicionales aprobados. Los propuestos se informan, no se suman. */
export function totalVigente(precioBase: number, adicionales: { monto: number; estado: EstadoAdicional }[]): TotalVigente {
  const suma = (e: EstadoAdicional) => adicionales.filter((a) => a.estado === e).reduce((t, a) => t + a.monto, 0)
  const aprobados = suma('aprobado')
  return { base: precioBase, aprobados, propuestos: suma('propuesto'), total: precioBase + aprobados }
}

// ── Horario y plazos ────────────────────────────────────────────────────────

const PARTES_BOGOTA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})

export type Horario = { fuera: boolean; motivo: 'festivo' | 'fin_de_semana' | 'fuera_de_hora' | null; festivo?: string }

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * ¿Llegó este pedido fuera del horario pactado? Se mira en hora de Colombia,
 * no en la del servidor (Vercel corre en UTC): un mensaje de las 7:30 p. m. en
 * Bogotá son las 00:30 del día siguiente en UTC.
 */
export function fueraDeHorario(instante: Date, cupos: Cupos): Horario {
  const p = Object.fromEntries(PARTES_BOGOTA.formatToParts(instante).map((x) => [x.type, x.value]))
  const dia = new Date(Number(p.year), Number(p.month) - 1, Number(p.day), 12)
  const festivo = esFestivo(dia)
  if (festivo) return { fuera: true, motivo: 'festivo', festivo }
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return { fuera: true, motivo: 'fin_de_semana' }
  const ahora = Number(p.hour) * 60 + Number(p.minute)
  if (ahora < aMinutos(cupos.horario.desde) || ahora >= aMinutos(cupos.horario.hasta)) {
    return { fuera: true, motivo: 'fuera_de_hora' }
  }
  return { fuera: false, motivo: null }
}

/** Hasta qué día puede el cliente corregir el resumen de una reunión (`YYYY-MM-DD`). */
export function plazoCorreccion(fechaReunionISO: string, cupos: Cupos): string {
  return sumarHabiles(fechaReunionISO, cupos.diasParaCorregirResumen)
}
