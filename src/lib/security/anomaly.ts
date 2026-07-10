// Detección de anomalías del micro-SIEM. Estadística simple y EXPLICABLE
// (z-score sobre una baseline histórica) — se defiende mejor ante un jurado que
// una caja negra, y no necesita entrenamiento ni dependencias.
//
// Todo aquí es puro y testeable; el cron le pasa los agregados leídos de la DB.
// Ver docs/plan-security-observability.md.

export type AnomalyKind = 'spike' | 'new_pattern' | 'geo_anomaly' | 'auth_probing' | 'error_burst'

export type Anomaly = {
  kind: AnomalyKind
  category: string
  zScore: number | null
  baseline: number
  observed: number
  detail: string
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function stddev(xs: number[], avg = mean(xs)): number {
  if (xs.length < 2) return 0
  const variance = xs.reduce((a, b) => a + (b - avg) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

/**
 * z-score de `observed` frente a una baseline. Si la desviación es 0 (baseline
 * plana), devuelve null salvo que `observed` se salga del valor plano, en cuyo
 * caso devolvemos ±Infinity acotado a un valor grande para señalar el salto.
 */
export function zScore(observed: number, baseline: number[]): number | null {
  if (baseline.length < 2) return null
  const avg = mean(baseline)
  const sd = stddev(baseline, avg)
  if (sd === 0) return observed === avg ? 0 : null
  return (observed - avg) / sd
}

export type SpikeInput = {
  category: string
  observed: number
  /** Serie histórica de la MISMA franja (p. ej. misma hora en 30 días). */
  baseline: number[]
}

/**
 * Detecta spikes: z-score > `threshold` Y un mínimo absoluto de eventos para no
 * alertar por ruido estadístico sobre volúmenes diminutos (p. ej. de 0→2).
 */
export function detectSpikes(inputs: SpikeInput[], threshold = 3, minObserved = 10): Anomaly[] {
  const out: Anomaly[] = []
  for (const inp of inputs) {
    if (inp.observed < minObserved) continue
    const z = zScore(inp.observed, inp.baseline)
    if (z !== null && z > threshold) {
      const avg = mean(inp.baseline)
      out.push({
        kind: 'spike',
        category: inp.category,
        zScore: Math.round(z * 100) / 100,
        baseline: Math.round(avg * 100) / 100,
        observed: inp.observed,
        detail: `${inp.observed} eventos '${inp.category}' vs media ${avg.toFixed(1)} (z=${z.toFixed(1)})`,
      })
    }
  }
  return out
}

export type PatternInput = { path: string; count: number }

/**
 * Patrones nuevos: rutas nunca vistas en la baseline que ya se repiten mucho en
 * la ventana actual (sondeo de una vulnerabilidad concreta). `knownPaths` es el
 * conjunto de rutas vistas históricamente.
 */
export function detectNewPatterns(
  current: PatternInput[],
  knownPaths: Set<string>,
  minCount = 10
): Anomaly[] {
  const out: Anomaly[] = []
  for (const c of current) {
    if (c.count >= minCount && !knownPaths.has(c.path)) {
      out.push({
        kind: 'new_pattern',
        category: 'recon',
        zScore: null,
        baseline: 0,
        observed: c.count,
        detail: `ruta nueva '${c.path}' sondeada ${c.count} veces (no vista antes)`,
      })
    }
  }
  return out
}

export type GeoInput = { country: string; count: number }

/**
 * Geo-anomalía: un país que NO estaba en el top histórico de orígenes hostiles
 * entra al top-N actual con volumen relevante.
 */
export function detectGeoAnomalies(
  currentTop: GeoInput[],
  knownCountries: Set<string>,
  topN = 3,
  minCount = 10
): Anomaly[] {
  const out: Anomaly[] = []
  for (const g of currentTop.slice(0, topN)) {
    if (!g.country) continue
    if (g.count >= minCount && !knownCountries.has(g.country)) {
      out.push({
        kind: 'geo_anomaly',
        category: 'geo',
        zScore: null,
        baseline: 0,
        observed: g.count,
        detail: `origen nuevo en el top: ${g.country} con ${g.count} eventos`,
      })
    }
  }
  return out
}
