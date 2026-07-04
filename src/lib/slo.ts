// SLO / Error budget al estilo Google SRE.
//
// A partir de los chequeos de uptime (monitor_checks) calculamos, para una
// ventana (típicamente 30 días) y un objetivo (p. ej. 99.5%):
//   - SLI: uptime observado = éxitos / total.
//   - Error budget: fallos permitidos por el objetivo en la ventana.
//   - Budget consumido/restante (en % y en minutos de la ventana).
//   - Burn rate: velocidad a la que se gasta el presupuesto (1.0 = a ritmo de
//     agotarlo justo al final de la ventana; >1 se agota antes).

export type Check = { at: Date | number; ok: boolean }

export type SloResult = {
  objectivePct: number
  windowDays: number
  totalChecks: number
  okChecks: number
  failedChecks: number
  /** Uptime observado (SLI) en %, o null si no hay datos. */
  sliPct: number | null
  /** Minutos totales de la ventana. */
  windowMinutes: number
  /** Minutos de caída permitidos por el objetivo en la ventana. */
  budgetMinutes: number
  /** Minutos de "caída" estimados (proporción de fallos × ventana). */
  spentMinutes: number
  /** Minutos de presupuesto restantes (puede ser negativo si se excedió). */
  remainingMinutes: number
  /** Presupuesto de error consumido en %, o null si no hay datos. */
  budgetConsumedPct: number | null
  /** Presupuesto restante en % (100 - consumido), acotado a ≥ 0 para la barra. */
  budgetRemainingPct: number | null
  /** Velocidad de consumo relativa al ritmo sostenible (1.0). */
  burnRate: number | null
  /** true si el uptime observado cumple el objetivo. */
  meetsObjective: boolean
}

const MS_PER_MINUTE = 60_000

const toMs = (at: Date | number): number => (typeof at === 'number' ? at : at.getTime())

/**
 * Calcula el estado del SLO para una ventana. `windowDays` define tanto el
 * horizonte de minutos como el filtro temporal de los checks.
 */
export function computeSlo(
  checks: Check[],
  objectivePct = 99.5,
  windowDays = 30,
  now: number = Date.now(),
): SloResult {
  const windowMinutes = windowDays * 24 * 60
  const from = now - windowDays * 24 * 60 * MS_PER_MINUTE

  let total = 0
  let ok = 0
  for (const c of checks) {
    const at = toMs(c.at)
    if (at < from || at > now) continue
    total++
    if (c.ok) ok++
  }
  const failed = total - ok

  // Fracción de error permitida por el objetivo (99.5% → 0.005).
  const allowedFailFraction = Math.max(0, 1 - objectivePct / 100)
  const budgetMinutes = Math.round(windowMinutes * allowedFailFraction)

  const base: SloResult = {
    objectivePct,
    windowDays,
    totalChecks: total,
    okChecks: ok,
    failedChecks: failed,
    sliPct: null,
    windowMinutes,
    budgetMinutes,
    spentMinutes: 0,
    remainingMinutes: budgetMinutes,
    budgetConsumedPct: null,
    budgetRemainingPct: null,
    burnRate: null,
    meetsObjective: true,
  }

  if (total === 0) return base

  const failFraction = failed / total
  const sliPct = Math.round((ok / total) * 100_000) / 1000 // 3 decimales
  // "Minutos de caída" estimados: proyectamos la tasa de fallo sobre la ventana.
  const spentMinutes = Math.round(failFraction * windowMinutes)
  const remainingMinutes = budgetMinutes - spentMinutes

  const budgetConsumedPct =
    budgetMinutes > 0
      ? Math.round((spentMinutes / budgetMinutes) * 1000) / 10
      : failed > 0
        ? Infinity // objetivo del 100%: cualquier fallo agota un presupuesto de cero
        : 0
  const budgetRemainingPct = Number.isFinite(budgetConsumedPct)
    ? Math.max(0, Math.round((100 - budgetConsumedPct) * 10) / 10)
    : 0

  // Burn rate: tasa de fallo observada ÷ tasa de fallo presupuestada.
  const burnRate =
    allowedFailFraction > 0
      ? Math.round((failFraction / allowedFailFraction) * 100) / 100
      : failFraction > 0
        ? Infinity
        : 0

  return {
    ...base,
    sliPct,
    spentMinutes,
    remainingMinutes,
    budgetConsumedPct,
    budgetRemainingPct,
    burnRate,
    meetsObjective: sliPct >= objectivePct,
  }
}

/** Formatea minutos como "2d 3h 15m" / "45m" para la UI. */
export function formatMinutes(min: number): string {
  const sign = min < 0 ? '-' : ''
  let m = Math.abs(Math.round(min))
  const d = Math.floor(m / 1440)
  m -= d * 1440
  const h = Math.floor(m / 60)
  m -= h * 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m || parts.length === 0) parts.push(`${m}m`)
  return sign + parts.join(' ')
}

/** Etiqueta de salud del budget para colorear la tarjeta. */
export type BudgetHealth = 'healthy' | 'warning' | 'critical' | 'exhausted'

export function budgetHealth(r: SloResult): BudgetHealth {
  if (r.budgetRemainingPct == null) return 'healthy'
  if (r.remainingMinutes < 0) return 'exhausted'
  if (r.budgetRemainingPct <= 20) return 'critical'
  if (r.budgetRemainingPct <= 50) return 'warning'
  return 'healthy'
}
