import { describe, it, expect } from 'vitest'
import {
  mean,
  stddev,
  zScore,
  detectSpikes,
  detectNewPatterns,
  detectGeoAnomalies,
} from '../src/lib/security/anomaly'

describe('estadística básica', () => {
  it('mean', () => {
    expect(mean([])).toBe(0)
    expect(mean([2, 4, 6])).toBe(4)
  })
  it('stddev muestral', () => {
    expect(stddev([5])).toBe(0)
    expect(stddev([2, 4, 6])).toBeCloseTo(2, 5)
  })
})

describe('zScore', () => {
  it('null con baseline insuficiente', () => {
    expect(zScore(10, [])).toBeNull()
    expect(zScore(10, [3])).toBeNull()
  })
  it('mide desviaciones sobre la media', () => {
    const z = zScore(10, [2, 4, 6]) // media 4, sd 2 → (10-4)/2 = 3
    expect(z).toBeCloseTo(3, 5)
  })
  it('baseline plana: 0 si coincide, null si difiere', () => {
    expect(zScore(5, [5, 5, 5])).toBe(0)
    expect(zScore(9, [5, 5, 5])).toBeNull()
  })
})

describe('detectSpikes', () => {
  it('marca un spike claro por encima del umbral y del mínimo', () => {
    const out = detectSpikes([{ category: 'injection', observed: 50, baseline: [2, 3, 1, 2, 4] }])
    expect(out).toHaveLength(1)
    expect(out[0]!.kind).toBe('spike')
    expect(out[0]!.category).toBe('injection')
  })
  it('ignora volúmenes pequeños aunque el z sea alto (evita ruido 0→2)', () => {
    expect(detectSpikes([{ category: 'x', observed: 2, baseline: [0, 0, 0, 0] }])).toHaveLength(0)
  })
  it('no marca si el z no supera el umbral', () => {
    expect(detectSpikes([{ category: 'x', observed: 12, baseline: [10, 11, 9, 10, 12] }])).toHaveLength(0)
  })
})

describe('detectNewPatterns', () => {
  it('marca una ruta nueva muy sondeada', () => {
    const out = detectNewPatterns([{ path: '/cgi-bin/vuln', count: 25 }], new Set(['/', '/projects']))
    expect(out[0]!.kind).toBe('new_pattern')
  })
  it('ignora rutas conocidas o poco sondeadas', () => {
    expect(detectNewPatterns([{ path: '/', count: 100 }], new Set(['/']))).toHaveLength(0)
    expect(detectNewPatterns([{ path: '/nueva', count: 3 }], new Set())).toHaveLength(0)
  })
})

describe('detectGeoAnomalies', () => {
  it('marca un país nuevo que entra al top', () => {
    const out = detectGeoAnomalies([{ country: 'RU', count: 40 }], new Set(['CO', 'US']))
    expect(out[0]!.kind).toBe('geo_anomaly')
    expect(out[0]!.detail).toContain('RU')
  })
  it('ignora países conocidos y por debajo del mínimo', () => {
    expect(detectGeoAnomalies([{ country: 'US', count: 40 }], new Set(['US']))).toHaveLength(0)
    expect(detectGeoAnomalies([{ country: 'RU', count: 3 }], new Set())).toHaveLength(0)
  })
  it('solo mira el top-N', () => {
    const top = [
      { country: 'US', count: 100 },
      { country: 'CO', count: 90 },
      { country: 'BR', count: 80 },
      { country: 'RU', count: 70 }, // fuera del top-3 por defecto
    ]
    expect(detectGeoAnomalies(top, new Set(['US', 'CO', 'BR']))).toHaveLength(0)
  })
})
