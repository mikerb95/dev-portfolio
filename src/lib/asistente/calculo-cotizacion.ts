// Cálculo de cotizaciones del asistente (docs/plan-asistente.md, capacidad 1).
//
// El modelo NO hace cuentas de dinero: elige componentes y cantidades, y este
// módulo devuelve horas y precio. Toda cifra que el borrador le muestre a un
// cliente tiene que salir de aquí (lo comprueba guardia.ts), porque en la base
// no hay historial de precios del que el modelo pudiera deducir nada y una
// cifra inventada con aplomo es el peor fallo posible en una cotización.
//
// Módulo PURO: sin BD, sin efectos. Los precios salen de src/data/tarifario.ts.

import {
  CAPACITACION,
  COMPONENTES,
  PAQUETES_WEB,
  REGLAS,
  TARIFA_HORA,
  type Moneda,
  type PaqueteWeb,
} from '../../data/tarifario'

export type Rango = readonly [number, number]

export type LineaCotizacion = {
  id: string
  nombre: string
  cantidad: number
  horas: Rango
}

export type Condiciones = {
  /** Porcentaje que se paga antes de empezar (50). */
  anticipoPct: number
  /** Monto del anticipo, en rango si el precio lo está. */
  anticipo: Rango
  validezDias: number
}

export type CotizacionSoftware = {
  tipo: 'software'
  moneda: Moneda
  /** Plan web del que parte (la web en sí: secciones, diseño, SEO), si aplica. */
  base: { paquete: PaqueteWeb['id']; nombre: string; precio: number } | null
  lineas: LineaCotizacion[]
  /** Suma de horas de los componentes, sin colchón. */
  horasBase: Rango
  /** Horas con el colchón aplicado (redondeadas hacia arriba). */
  horas: Rango
  colchonPct: number
  tarifaHora: number
  precio: Rango
  /** true si el mínimo por proyecto subió el precio. */
  aplicoMinimo: boolean
  condiciones: Condiciones
}

export type CotizacionCapacitacion = {
  tipo: 'capacitacion'
  moneda: 'COP'
  personas: number
  horas: number
  cupo: number
  personasAdicionales: number
  precioSesion: number
  precioPersonaAdicional: number
  precio: Rango
  condiciones: Condiciones
}

export type CotizacionPaquete = {
  tipo: 'paquete'
  moneda: Moneda
  paquete: PaqueteWeb['id']
  nombre: string
  desde: number
  condiciones: Condiciones
}

export type CotizacionMantenimiento = {
  tipo: 'mantenimiento'
  moneda: Moneda
  horasMes: Rango
  tarifaHora: number
  precioMes: Rango
}

export type Cotizacion = CotizacionSoftware | CotizacionCapacitacion | CotizacionPaquete | CotizacionMantenimiento

/** Error de entrada: el mensaje vuelve tal cual al modelo para que corrija. */
export class EntradaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'EntradaInvalida'
  }
}

/** Redondea HACIA ARRIBA al múltiplo de la moneda: cotizar por debajo es perder plata. */
export function redondear(valor: number, moneda: Moneda): number {
  const paso = REGLAS.redondeo[moneda]
  return Math.ceil(valor / paso) * paso
}

function condiciones(precio: Rango): Condiciones {
  const a = REGLAS.anticipo
  return {
    anticipoPct: Math.round(a * 100),
    anticipo: [Math.round(precio[0] * a), Math.round(precio[1] * a)],
    validezDias: REGLAS.validezDias,
  }
}

function cantidadValida(n: unknown): number {
  const v = n === undefined ? 1 : Number(n)
  if (!Number.isInteger(v) || v < 1 || v > 50) throw new EntradaInvalida(`cantidad inválida: ${String(n)} (entero entre 1 y 50)`)
  return v
}

/**
 * Franja del rango de horas de un componente, en fracciones de 0 a 1: [0, 1]
 * es el rango entero de la tabla y [0, 0.4] su parte baja. La usa Plano para
 * cerrar el rango a medida que se responden preguntas, sin poder sacar nunca
 * un componente de las horas que Mike aprobó.
 */
export type Ajuste = readonly [number, number]

function ajusteValido(aj: Ajuste | undefined): Ajuste {
  if (aj === undefined) return [0, 1]
  const [a, b] = aj
  if (!(Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= 1 && a <= b)) {
    throw new EntradaInvalida(`ajuste inválido: [${a}, ${b}] (fracciones entre 0 y 1, la primera menor)`)
  }
  return [a, b]
}

export type PedidoSoftware = {
  componentes: readonly { id: string; cantidad?: number; ajuste?: Ajuste }[]
  moneda: Moneda
  /**
   * Plan web sobre el que se monta el desarrollo. Una tienda o unas reservas
   * van dentro de una web, y los componentes no la incluyen: sin base, una
   * tienda completa saldría por debajo del piso de "A medida".
   */
  base?: PaqueteWeb['id']
}

export function cotizarSoftware(p: PedidoSoftware): CotizacionSoftware {
  if (!p.componentes.length) throw new EntradaInvalida('falta al menos un componente')
  const vistos = new Set<string>()
  const lineas: LineaCotizacion[] = p.componentes.map((c) => {
    const def = COMPONENTES.find((d) => d.id === c.id)
    if (!def) throw new EntradaInvalida(`componente desconocido: ${c.id}. Válidos: ${COMPONENTES.map((d) => d.id).join(', ')}`)
    if (vistos.has(c.id)) throw new EntradaInvalida(`componente repetido: ${c.id} (usa cantidad)`)
    vistos.add(c.id)
    const cantidad = cantidadValida(c.cantidad)
    if (cantidad > 1 && !def.unidad) throw new EntradaInvalida(`${c.id} no se cobra por unidad: su cantidad es 1`)
    const [a, b] = ajusteValido(c.ajuste)
    const ancho = def.horas[1] - def.horas[0]
    // Medias horas: con fracciones arbitrarias saldrían 13,37 h, una precisión
    // que nadie tiene al estimar y que solo ensucia el desglose.
    const media = (x: number) => Math.round(x * 2) / 2
    const horas: Rango = [media((def.horas[0] + ancho * a) * cantidad), media((def.horas[0] + ancho * b) * cantidad)]
    return { id: def.id, nombre: def.nombre, cantidad, horas }
  })

  const horasBase: Rango = [lineas.reduce((t, l) => t + l.horas[0], 0), lineas.reduce((t, l) => t + l.horas[1], 0)]
  const factor = 1 + REGLAS.colchon
  const horas: Rango = [Math.ceil(horasBase[0] * factor), Math.ceil(horasBase[1] * factor)]
  const tarifa = TARIFA_HORA[p.moneda]
  const minimo = REGLAS.minimo[p.moneda]
  let base: CotizacionSoftware['base'] = null
  if (p.base) {
    const paquete = PAQUETES_WEB.find((x) => x.id === p.base)
    if (!paquete || paquete.id === 'a-medida') {
      throw new EntradaInvalida(`base inválida: ${p.base}. Válidas: presencia, negocio (A medida se arma con componentes)`)
    }
    base = { paquete: paquete.id, nombre: paquete.nombre, precio: paquete.desde[p.moneda] }
  }
  const extra = base?.precio ?? 0
  const bruto: Rango = [
    redondear(horas[0] * tarifa, p.moneda) + extra,
    redondear(horas[1] * tarifa, p.moneda) + extra,
  ]
  const precio: Rango = [Math.max(bruto[0], minimo), Math.max(bruto[1], minimo)]

  return {
    tipo: 'software',
    moneda: p.moneda,
    base,
    lineas,
    horasBase,
    horas,
    colchonPct: Math.round(REGLAS.colchon * 100),
    tarifaHora: tarifa,
    precio,
    aplicoMinimo: precio[0] !== bruto[0],
    condiciones: condiciones(precio),
  }
}

export function cotizarCapacitacion(personas: number): CotizacionCapacitacion {
  if (!Number.isInteger(personas) || personas < 1 || personas > 500) {
    throw new EntradaInvalida(`número de personas inválido: ${personas}`)
  }
  const adicionales = Math.max(0, personas - CAPACITACION.cupo)
  const total = CAPACITACION.sesionCOP + adicionales * CAPACITACION.personaAdicionalCOP
  const precio: Rango = [total, total]
  return {
    tipo: 'capacitacion',
    moneda: 'COP',
    personas,
    horas: CAPACITACION.horas,
    cupo: CAPACITACION.cupo,
    personasAdicionales: adicionales,
    precioSesion: CAPACITACION.sesionCOP,
    precioPersonaAdicional: CAPACITACION.personaAdicionalCOP,
    precio,
    condiciones: condiciones(precio),
  }
}

export function cotizarPaquete(id: string, moneda: Moneda): CotizacionPaquete {
  const p = PAQUETES_WEB.find((x) => x.id === id)
  if (!p) throw new EntradaInvalida(`paquete desconocido: ${id}. Válidos: ${PAQUETES_WEB.map((x) => x.id).join(', ')}`)
  const desde = p.desde[moneda]
  return { tipo: 'paquete', moneda, paquete: p.id, nombre: p.nombre, desde, condiciones: condiciones([desde, desde]) }
}

/** Mantenimiento: sin precio fijo (decisión de Mike), horas al mes × tarifa. */
export function cotizarMantenimiento(horasMes: Rango, moneda: Moneda): CotizacionMantenimiento {
  const [min, max] = horasMes
  if (!(min > 0) || !(max >= min) || max > 160) throw new EntradaInvalida(`horas al mes inválidas: ${min}-${max}`)
  const tarifa = TARIFA_HORA[moneda]
  return {
    tipo: 'mantenimiento',
    moneda,
    horasMes: [min, max],
    tarifaHora: tarifa,
    precioMes: [redondear(min * tarifa, moneda), redondear(max * tarifa, moneda)],
  }
}

/**
 * Todas las cifras de dinero que una cotización le permite al borrador
 * mencionar. Es la lista contra la que compara guardia.ts.
 */
export function cifrasPermitidas(cotizaciones: readonly Cotizacion[]): number[] {
  const cifras = new Set<number>()
  const sumar = (...vs: number[]) => vs.forEach((v) => cifras.add(v))
  for (const c of cotizaciones) {
    if (c.tipo === 'software') {
      sumar(...c.precio, ...c.condiciones.anticipo, c.tarifaHora)
      if (c.base) sumar(c.base.precio)
    } else if (c.tipo === 'capacitacion') {
      sumar(...c.precio, ...c.condiciones.anticipo, c.precioSesion, c.precioPersonaAdicional)
    } else if (c.tipo === 'paquete') {
      sumar(c.desde, ...c.condiciones.anticipo)
    } else {
      sumar(...c.precioMes, c.tarifaHora)
    }
  }
  return [...cifras].sort((a, b) => a - b)
}
