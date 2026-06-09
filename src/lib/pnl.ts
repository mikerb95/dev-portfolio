// Cálculo de rentabilidad (P&L) por proyecto: ingresos (cobrados) vs. costos de infraestructura.
import { monthlyEquivalent, toBaseUSD, type Rates } from './money'

export interface FinanceLike {
  amount: number
  status: 'cobrado' | 'pendiente' | 'proyectado' | string
}

export interface ServiceLike {
  cost?: number | null
  currency?: string | null
  billingCycle?: string | null
  active?: boolean | null
}

export interface ProjectPnL {
  ingresosCobrados: number
  ingresosPendientes: number
  costoMensualUSD: number
  costoAnualUSD: number
  costoDesdeInicioUSD: number
  margenEstimado: number
  /** Servicios con costo cuya moneda no tiene tasa configurada (no sumados). */
  costosSinTasa: number
}

/** Meses transcurridos desde una fecha (mínimo 1). */
export function monthsSince(start: Date | null | undefined): number {
  if (!start) return 1
  const now = new Date()
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth()) +
    1
  return Math.max(1, months)
}

/** Suma el costo mensual recurrente en USD base de un conjunto de servicios activos. */
export function monthlyCostUSD(
  services: ServiceLike[],
  rates: Rates,
): { total: number; sinTasa: number } {
  let total = 0
  let sinTasa = 0
  for (const s of services) {
    if (s.active === false) continue
    const monthly = monthlyEquivalent(s.cost, s.billingCycle)
    if (monthly === 0) continue
    const usd = toBaseUSD(monthly, s.currency ?? 'USD', rates)
    if (usd == null) sinTasa++
    else total += usd
  }
  return { total, sinTasa }
}

export function projectPnL(
  project: { startDate?: Date | null },
  finances: FinanceLike[],
  services: ServiceLike[],
  rates: Rates,
): ProjectPnL {
  const ingresosCobrados = finances
    .filter((f) => f.status === 'cobrado')
    .reduce((s, f) => s + f.amount, 0)
  const ingresosPendientes = finances
    .filter((f) => f.status === 'pendiente')
    .reduce((s, f) => s + f.amount, 0)

  const { total: costoMensualUSD, sinTasa } = monthlyCostUSD(services, rates)
  const costoAnualUSD = costoMensualUSD * 12
  const costoDesdeInicioUSD = costoMensualUSD * monthsSince(project.startDate)

  return {
    ingresosCobrados,
    ingresosPendientes,
    costoMensualUSD,
    costoAnualUSD,
    costoDesdeInicioUSD,
    margenEstimado: ingresosCobrados - costoDesdeInicioUSD,
    costosSinTasa: sinTasa,
  }
}
