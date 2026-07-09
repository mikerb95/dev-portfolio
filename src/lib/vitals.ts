// Agregación de Core Web Vitals para el panel público de ingeniería.
// SQLite no tiene percentile_cont, así que el p75 se calcula en JS sobre los
// valores de la ventana (acotada por fecha y límite de filas aguas arriba).

export type VitalMetric = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
export type VitalRating = 'good' | 'needs-improvement' | 'poor'

// Umbrales oficiales de Google (web.dev/vitals): [bueno máx, mejorable máx].
// Por encima del segundo valor la métrica es "poor".
const THRESHOLDS: Record<VitalMetric, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
}

export const VITAL_META: Record<VitalMetric, { label: string; unit: 'ms' | '' }> = {
  LCP: { label: 'Largest Contentful Paint', unit: 'ms' },
  INP: { label: 'Interaction to Next Paint', unit: 'ms' },
  CLS: { label: 'Cumulative Layout Shift', unit: '' },
  FCP: { label: 'First Contentful Paint', unit: 'ms' },
  TTFB: { label: 'Time to First Byte', unit: 'ms' },
}

export function rateVital(metric: VitalMetric, value: number): VitalRating {
  const [good, ni] = THRESHOLDS[metric]
  if (value <= good) return 'good'
  if (value <= ni) return 'needs-improvement'
  return 'poor'
}

/** p75 lineal (percentil que Google usa para clasificar). `values` sin ordenar. */
export function p75(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil(0.75 * sorted.length) - 1)
  return sorted[Math.max(0, idx)]!
}

/** Formatea un valor de vital para mostrar (ms enteros, CLS a 2 decimales). */
export function formatVital(metric: VitalMetric, value: number): string {
  if (VITAL_META[metric].unit === 'ms') return `${Math.round(value)} ms`
  return value.toFixed(2)
}
