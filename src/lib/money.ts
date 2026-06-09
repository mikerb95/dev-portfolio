// Utilidades de moneda y costos. Base USD; multi-moneda con conversión configurable.

export const BASE_CURRENCY = 'USD'

export const CURRENCIES = ['USD', 'COP', 'EUR', 'MXN', 'ARS', 'BRL', 'GBP'] as const
export type Currency = (typeof CURRENCIES)[number]

export type BillingCycle = 'monthly' | 'quarterly' | 'annual' | 'one_time' | 'usage' | 'free'

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  annual: 'Anual',
  one_time: 'Pago único',
  usage: 'Por uso',
  free: 'Gratis',
}

/** Tasas: unidades de la moneda por 1 USD. USD siempre = 1. */
export type Rates = Record<string, number>

/** Construye el mapa de tasas desde filas de app_settings (claves fx_<CUR>_per_USD). */
export function parseRates(rows: { key: string; value: string | null }[]): Rates {
  const rates: Rates = { USD: 1 }
  for (const { key, value } of rows) {
    const m = key.match(/^fx_([A-Z]{3})_per_USD$/)
    const n = value ? Number(value) : NaN
    if (m && Number.isFinite(n) && n > 0) rates[m[1]] = n
  }
  return rates
}

/** Convierte un monto a USD base. Devuelve null si no hay tasa para esa moneda. */
export function toBaseUSD(amount: number, currency: string, rates: Rates): number | null {
  if (!Number.isFinite(amount)) return null
  if (currency === BASE_CURRENCY) return amount
  const rate = rates[currency]
  if (!rate || rate <= 0) return null
  return amount / rate
}

/** Costo mensual equivalente (one_time/usage/free no cuentan como recurrente). */
export function monthlyEquivalent(cost: number | null | undefined, cycle: string | null | undefined): number {
  if (cost == null || !Number.isFinite(cost)) return 0
  switch (cycle) {
    case 'monthly': return cost
    case 'quarterly': return cost / 3
    case 'annual': return cost / 12
    default: return 0 // one_time, usage, free
  }
}

/** Costo anual equivalente recurrente. */
export function annualEquivalent(cost: number | null | undefined, cycle: string | null | undefined): number {
  return monthlyEquivalent(cost, cycle) * 12
}

const fmtCache = new Map<string, Intl.NumberFormat>()
function nf(currency: string, maximumFractionDigits: number): Intl.NumberFormat {
  const k = `${currency}:${maximumFractionDigits}`
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits })
    fmtCache.set(k, f)
  }
  return f
}

/** Formato genérico para cualquier moneda. */
export function fmtMoney(amount: number, currency = 'USD', decimals = 2): string {
  return nf(currency, decimals).format(amount)
}

/** Formato USD para KPIs (sin decimales). */
export function fmtUSD(amount: number, decimals = 0): string {
  return nf('USD', decimals).format(amount)
}
