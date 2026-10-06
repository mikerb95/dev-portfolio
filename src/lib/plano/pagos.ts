// Planes de pago de Plano: por hitos según el monto, en cuotas con recargo, o
// de contado. Reglas en src/data/plano.ts (editables en /admin/plano/ajustes).
//
// Todo en unidades enteras de la moneda (pesos o dólares), como el tarifario.
// Cada pago se redondea a un paso legible (1.000 COP, 1 USD) y el último
// absorbe la diferencia: la suma de los pagos es SIEMPRE el total exacto, que
// es lo primero que revisa un cliente con calculadora.
//
// Módulo PURO e isomorfo.

import { HITOS, type HitoId, type ReglasPlano, type Tramo } from '../../data/plano'
import type { Moneda } from '../../data/tarifario'
import { cicloEmpresa, habilEnODespues, quincenaEnODespues, sumarHabiles, sumarMeses, type CicloEmpresa } from './fechas'

export type TipoPlan = 'hitos' | 'cuotas' | 'contado'

export const PASO_PAGO: Record<Moneda, number> = { COP: 1_000, USD: 1 }

export type PagoPlan = {
  n: number
  concepto: string
  hito: HitoId | null
  /** Porcentaje del precio base (null en las cuotas, que llevan recargo). */
  pct: number | null
  monto: number
  /** Cuándo se alcanza el hito (o cuándo arranca la cuota). */
  fechaHito: string
  vence: string
  /** Solo empresas con ciclo: hasta cuándo radicar la cuenta de cobro. */
  radicarAntesDe?: string
  /** Solo cuotas: desglose. */
  cuota?: { abono: number; recargo: number; saldo: number }
}

export type EstadoUsura = {
  estado: 'ok' | 'excede' | 'sin_dato' | 'no_aplica'
  /** Tasa de usura convertida a mensual, en porcentaje. */
  usuraMensualPct: number | null
}

export type PlanPago = {
  tipo: TipoPlan
  /** Precio de la propuesta antes de recargo o descuento. */
  precioBase: number
  /** Lo que paga el cliente en total. */
  total: number
  recargoTotal: number
  descuento: number
  pagos: PagoPlan[]
  usura: EstadoUsura
}

export type ClientePlan = { tipo: 'persona' | 'empresa'; ciclo?: CicloEmpresa | null }

export function tramoPara(precio: number, moneda: Moneda, reglas: ReglasPlano): Tramo {
  const t = reglas.tramos.find((x) => x.hasta === null || precio <= x.hasta[moneda])
  return t ?? reglas.tramos[reglas.tramos.length - 1]
}

/** Reparte un total en porcentajes, redondeando al paso; el último absorbe la diferencia. */
export function repartir(total: number, pcts: readonly number[], moneda: Moneda): number[] {
  const paso = PASO_PAGO[moneda]
  const montos = pcts.map((p) => Math.round((total * p) / 100 / paso) * paso)
  const suma = montos.slice(0, -1).reduce((a, b) => a + b, 0)
  montos[montos.length - 1] = total - suma
  return montos
}

/** Cuota fija del sistema francés. `i` en fracción mensual (0.015). */
export function cuotaFija(capital: number, i: number, n: number): number {
  if (n <= 0) return capital
  if (i === 0) return capital / n
  return (capital * i) / (1 - (1 + i) ** -n)
}

export type FilaCuota = { cuota: number; recargo: number; abono: number; saldo: number }

/**
 * Tabla de amortización con cuota fija redondeada HACIA ARRIBA al paso (así el
 * recargo nunca queda por debajo de lo pactado) y última cuota que liquida el
 * saldo exacto.
 */
export function tablaCuotas(capital: number, recargoMensualPct: number, n: number, moneda: Moneda): FilaCuota[] {
  const paso = PASO_PAGO[moneda]
  const i = recargoMensualPct / 100
  const fija = Math.ceil(cuotaFija(capital, i, n) / paso) * paso
  const filas: FilaCuota[] = []
  let saldo = capital
  for (let k = 1; k <= n; k++) {
    const recargo = Math.round(saldo * i)
    const ultima = k === n
    const cuota = ultima ? saldo + recargo : Math.min(fija, saldo + recargo)
    const abono = cuota - recargo
    saldo = saldo - abono
    filas.push({ cuota, recargo, abono, saldo })
    if (saldo <= 0) break
  }
  return filas
}

/** Compara el recargo mensual con la usura (efectiva anual) convertida a mensual. */
export function estadoUsura(recargoMensualPct: number, usuraEAPct: number | null): EstadoUsura {
  if (usuraEAPct == null || !(usuraEAPct > 0)) return { estado: 'sin_dato', usuraMensualPct: null }
  const mensual = ((1 + usuraEAPct / 100) ** (1 / 12) - 1) * 100
  const redondeada = Math.round(mensual * 100) / 100
  return { estado: recargoMensualPct < mensual ? 'ok' : 'excede', usuraMensualPct: redondeada }
}

export type OpcionesPlan = { hitos: true; cuotas: boolean; contado: boolean; maxCuotas: number }

export function opcionesPlan(precio: number, moneda: Moneda, reglas: ReglasPlano): OpcionesPlan {
  const c = reglas.cuotas
  return {
    hitos: true,
    cuotas: c.activas && c.maxCuotas >= 1 && precio > c.minimo[moneda],
    contado: reglas.descuentoContadoPct > 0,
    maxCuotas: Math.max(1, Math.floor(c.maxCuotas)),
  }
}

export type PedidoPlan = {
  precio: number
  moneda: Moneda
  reglas: ReglasPlano
  tipo: TipoPlan
  numCuotas?: number
  /** Fecha estimada de cada hito ('YYYY-MM-DD'); 'firma' es el inicio. */
  hitos: Record<HitoId, string>
  cliente: ClientePlan
}

/** Cuándo vence el pago de un hito, según quién paga. */
function vencimiento(fechaHito: string, esFirma: boolean, p: PedidoPlan): Pick<PagoPlan, 'vence' | 'radicarAntesDe'> {
  if (esFirma) return { vence: habilEnODespues(fechaHito) }
  const { reglas, cliente } = p
  if (cliente.tipo === 'empresa' && cliente.ciclo) {
    const c = cicloEmpresa(fechaHito, cliente.ciclo)
    return { vence: c.pagoEstimado, radicarAntesDe: c.radicarAntesDe }
  }
  const base = sumarHabiles(fechaHito, reglas.diasHabilesVencimiento)
  return { vence: cliente.tipo === 'persona' && reglas.quincenaPersonas ? quincenaEnODespues(base) : base }
}

export function armarPlan(p: PedidoPlan): PlanPago {
  const { precio, moneda, reglas } = p
  const opciones = opcionesPlan(precio, moneda, reglas)
  // Un plan que ya no aplica (bajó el precio, se apagaron las cuotas) cae al
  // plan por hitos en vez de fallar: la propuesta nunca se queda sin plan.
  const tipo: TipoPlan = p.tipo === 'cuotas' && opciones.cuotas ? 'cuotas' : p.tipo === 'contado' && opciones.contado ? 'contado' : 'hitos'
  const noAplica: EstadoUsura = { estado: 'no_aplica', usuraMensualPct: null }

  if (tipo === 'contado') {
    const paso = PASO_PAGO[moneda]
    const descuento = Math.round((precio * reglas.descuentoContadoPct) / 100 / paso) * paso
    const total = precio - descuento
    return {
      tipo,
      precioBase: precio,
      total,
      recargoTotal: 0,
      descuento,
      usura: noAplica,
      pagos: [{ n: 1, concepto: 'Pago único al firmar', hito: 'firma', pct: 100, monto: total, fechaHito: p.hitos.firma, ...vencimiento(p.hitos.firma, true, p) }],
    }
  }

  if (tipo === 'cuotas') {
    const c = reglas.cuotas
    const n = Math.min(Math.max(1, Math.floor(p.numCuotas ?? opciones.maxCuotas)), opciones.maxCuotas)
    const [anticipo, saldo] = repartir(precio, [c.anticipoPct, 100 - c.anticipoPct], moneda)
    const tabla = tablaCuotas(saldo, c.recargoMensualPct, n, moneda)
    const recargoTotal = tabla.reduce((t, f) => t + f.recargo, 0)
    const pagos: PagoPlan[] = [
      { n: 1, concepto: 'Anticipo al firmar', hito: 'firma', pct: c.anticipoPct, monto: anticipo, fechaHito: p.hitos.firma, ...vencimiento(p.hitos.firma, true, p) },
    ]
    tabla.forEach((f, k) => {
      const arranque = sumarMeses(p.hitos.publicacion, k + 1)
      const vence = p.cliente.tipo === 'persona' && reglas.quincenaPersonas ? quincenaEnODespues(arranque) : habilEnODespues(arranque)
      pagos.push({
        n: k + 2,
        concepto: `Cuota ${k + 1} de ${tabla.length}`,
        hito: null,
        pct: null,
        monto: f.cuota,
        fechaHito: arranque,
        vence,
        cuota: { abono: f.abono, recargo: f.recargo, saldo: f.saldo },
      })
    })
    return {
      tipo,
      precioBase: precio,
      total: precio + recargoTotal,
      recargoTotal,
      descuento: 0,
      usura: estadoUsura(c.recargoMensualPct, reglas.usuraEAPct),
      pagos,
    }
  }

  const tramo = tramoPara(precio, moneda, reglas)
  const montos = repartir(precio, tramo.pagos.map((x) => x.pct), moneda)
  return {
    tipo,
    precioBase: precio,
    total: precio,
    recargoTotal: 0,
    descuento: 0,
    usura: noAplica,
    pagos: tramo.pagos.map((x, k) => ({
      n: k + 1,
      concepto: x.hito === 'firma' ? 'Anticipo al firmar' : `Al cumplir: ${HITOS[x.hito].nombre.toLowerCase()}`,
      hito: x.hito,
      pct: x.pct,
      monto: montos[k],
      fechaHito: p.hitos[x.hito],
      ...vencimiento(p.hitos[x.hito], x.hito === 'firma', p),
    })),
  }
}

/** Errores de unas reglas editadas: vacío = válidas. Lo usa el formulario de ajustes y el endpoint. */
export function validarReglas(r: ReglasPlano): string[] {
  const errores: string[] = []
  if (!r.tramos.length) errores.push('falta al menos un tramo')
  r.tramos.forEach((t, k) => {
    const suma = t.pagos.reduce((a, b) => a + b.pct, 0)
    if (Math.abs(suma - 100) > 0.001) errores.push(`el tramo ${k + 1} suma ${suma} %, no 100 %`)
    if (!t.pagos.length || t.pagos[0].hito !== 'firma') errores.push(`el tramo ${k + 1} tiene que empezar con un pago al firmar`)
    if (t.pagos.some((x) => !(x.pct > 0))) errores.push(`el tramo ${k + 1} tiene un pago en cero`)
    const hitos = t.pagos.map((x) => x.hito)
    if (new Set(hitos).size !== hitos.length) errores.push(`el tramo ${k + 1} repite un hito`)
    const orden = hitos.map((h) => HITOS[h]?.avance ?? -1)
    if (orden.some((a, i) => a < 0 || (i > 0 && a <= orden[i - 1]))) errores.push(`los hitos del tramo ${k + 1} no van en orden`)
    if (k < r.tramos.length - 1 && t.hasta === null) errores.push(`solo el último tramo puede no tener techo`)
    if (k > 0 && t.hasta && r.tramos[k - 1].hasta) {
      const prev = r.tramos[k - 1].hasta!
      if (t.hasta.COP <= prev.COP || t.hasta.USD <= prev.USD) errores.push(`el techo del tramo ${k + 1} tiene que ser mayor que el del anterior`)
    }
  })
  if (r.tramos.length && r.tramos[r.tramos.length - 1].hasta !== null) errores.push('el último tramo no puede tener techo')
  const c = r.cuotas
  if (!(c.recargoMensualPct >= 0 && c.recargoMensualPct <= 10)) errores.push('el recargo mensual tiene que estar entre 0 % y 10 %')
  if (!(Number.isInteger(c.maxCuotas) && c.maxCuotas >= 1 && c.maxCuotas <= 24)) errores.push('las cuotas tienen que ser entre 1 y 24')
  if (!(c.anticipoPct >= 0 && c.anticipoPct < 100)) errores.push('el anticipo de las cuotas tiene que estar entre 0 % y 99 %')
  if (!(c.minimo.COP >= 0 && c.minimo.USD >= 0)) errores.push('el monto mínimo de las cuotas no puede ser negativo')
  if (r.usuraEAPct != null && !(r.usuraEAPct > 0 && r.usuraEAPct < 100)) errores.push('la tasa de usura tiene que estar entre 0 % y 100 %')
  if (!(r.descuentoContadoPct >= 0 && r.descuentoContadoPct <= 30)) errores.push('el descuento de contado tiene que estar entre 0 % y 30 %')
  if (!(Number.isInteger(r.diasHabilesVencimiento) && r.diasHabilesVencimiento >= 0 && r.diasHabilesVencimiento <= 30)) errores.push('los días de vencimiento tienen que ser entre 0 y 30')
  if (!(r.horasSemana >= 1 && r.horasSemana <= 60)) errores.push('las horas por semana para un proyecto tienen que ser entre 1 y 60')
  if (!(r.capacidadSemana >= r.horasSemana && r.capacidadSemana <= 80)) errores.push('la capacidad semanal tiene que ser al menos las horas por proyecto y como mucho 80')
  return errores
}

/**
 * Reglas guardadas en app_settings mezcladas sobre las de fábrica. Un JSON
 * roto o inválido devuelve las de fábrica: una propuesta nunca se arma con
 * reglas a medias.
 */
export function parseReglas(raw: string | null | undefined, defecto: ReglasPlano): ReglasPlano {
  if (!raw) return defecto
  try {
    const o = JSON.parse(raw) as Partial<ReglasPlano>
    const r: ReglasPlano = {
      ...defecto,
      ...o,
      cuotas: { ...defecto.cuotas, ...(o.cuotas ?? {}), minimo: { ...defecto.cuotas.minimo, ...(o.cuotas?.minimo ?? {}) } },
      tramos: Array.isArray(o.tramos) && o.tramos.length ? o.tramos : defecto.tramos,
    }
    return validarReglas(r).length ? defecto : r
  } catch {
    return defecto
  }
}
