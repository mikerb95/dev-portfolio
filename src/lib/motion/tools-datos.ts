// Datos de las escenas de /tools. Las maquetas usan datos de ejemplo, pero las
// cifras que se derivan de ellos salen de las MISMAS funciones del panel
// (monthlyEquivalent, projectPnL, computeSloFromCounts, MAX_TTL_S): si el
// cálculo real cambia, la maqueta cambia con él. Escribir "72 %" a mano sería
// ilustrar una herramienta con un número que la herramienta nunca dio.
//
// Módulo puro (sin BD ni node:crypto), probado en tests/motion-tools.test.ts.

import { monthlyEquivalent, toBaseUSD, type BillingCycle, type Rates } from '../money'
import { projectPnL } from '../pnl'
import { computeSloFromCounts } from '../slo'

// ── P&L ────────────────────────────────────────────────────────────────────

/** Tasa ilustrativa, a propósito redonda: se lee como ejemplo, no como cotización. */
export const TASAS_EJEMPLO: Rates = { USD: 1, COP: 4000 }

export const SERVICIOS_EJEMPLO: { cost: number; currency: 'USD' | 'COP'; billingCycle: BillingCycle }[] = [
  { cost: 120, currency: 'USD', billingCycle: 'annual' },
  { cost: 80_000, currency: 'COP', billingCycle: 'annual' },
  { cost: 0, currency: 'USD', billingCycle: 'free' },
  { cost: 6, currency: 'USD', billingCycle: 'monthly' },
]

export const INGRESOS_EJEMPLO = [
  { amount: 1800, status: 'cobrado' },
  { amount: 600, status: 'pendiente' },
  { amount: 900, status: 'proyectado' },
]

export type FilaServicio = {
  cost: number
  currency: string
  billingCycle: BillingCycle
  /** Equivalente mensual en USD, con la función del panel. */
  mensualUSD: number
}

export function datosPnl() {
  const filas: FilaServicio[] = SERVICIOS_EJEMPLO.map((s) => ({
    ...s,
    mensualUSD: toBaseUSD(monthlyEquivalent(s.cost, s.billingCycle), s.currency, TASAS_EJEMPLO) ?? 0,
  }))
  // Proyecto recién abierto (sin fecha de inicio = un mes), para que el
  // resultado no dependa del día en que se construye la página.
  const antes = projectPnL({ startDate: null }, INGRESOS_EJEMPLO, SERVICIOS_EJEMPLO, TASAS_EJEMPLO)
  // La factura pendiente se paga en el portal: el mismo cálculo con ella cobrada.
  const despues = projectPnL(
    { startDate: null },
    INGRESOS_EJEMPLO.map((f) => (f.status === 'pendiente' ? { ...f, status: 'cobrado' } : f)),
    SERVICIOS_EJEMPLO,
    TASAS_EJEMPLO,
  )
  const cobrado = INGRESOS_EJEMPLO.find((f) => f.status === 'cobrado')!.amount
  const pendiente = INGRESOS_EJEMPLO.find((f) => f.status === 'pendiente')!.amount
  const proyectado = INGRESOS_EJEMPLO.find((f) => f.status === 'proyectado')!.amount
  const total = cobrado + pendiente + proyectado
  return {
    filas,
    antes,
    despues,
    // Proporciones de la barra de ingresos (suman 1).
    partes: { cobrado: cobrado / total, pendiente: pendiente / total, proyectado: proyectado / total },
  }
}

// ── SLO ────────────────────────────────────────────────────────────────────

/** Un sondeo por minuto durante 30 días. */
export const SONDEOS_30D = 30 * 24 * 60
export const SLO_OBJETIVO = 99.9

/**
 * El mismo servicio antes y después de un incidente de 6 minutos. Con un
 * sondeo por minuto, cada minuto caído es un sondeo fallido: el presupuesto
 * que se ve bajar es exactamente el que calcularía el panel.
 */
export function datosSlo(fallosPrevios = 12, minutosIncidente = 6) {
  const antes = computeSloFromCounts(SONDEOS_30D - fallosPrevios, SONDEOS_30D, SLO_OBJETIVO, 30)
  const fallos = fallosPrevios + minutosIncidente
  const despues = computeSloFromCounts(SONDEOS_30D - fallos, SONDEOS_30D, SLO_OBJETIVO, 30)
  return { antes, despues }
}

// ── Bóveda ─────────────────────────────────────────────────────────────────

/**
 * Cambia un carácter hexadecimal del texto cifrado (la tercera parte de
 * `iv:tag:ct`): lo que haría alguien con acceso de escritura a la base. El
 * índice devuelto es la posición en la cadena completa, para resaltarlo.
 */
export function alterarCifrado(guardado: string, cual = 0.5): { alterado: string; indice: number } {
  const [iv, tag, ct] = guardado.split(':')
  if (!iv || !tag || !ct) return { alterado: guardado, indice: -1 }
  const i = Math.min(ct.length - 1, Math.max(0, Math.floor(ct.length * cual)))
  const original = ct[i]
  const nuevo = original === 'f' ? '0' : (parseInt(original, 16) + 1).toString(16)
  const ct2 = ct.slice(0, i) + nuevo + ct.slice(i + 1)
  return { alterado: `${iv}:${tag}:${ct2}`, indice: iv.length + 1 + tag.length + 1 + i }
}
