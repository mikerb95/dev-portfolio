import { describe, it, expect } from 'vitest'
import {
  HIST_BOUNDS,
  aggregateChecks,
  addToHist,
  bucketIndex,
  dayKeyUTC,
  emptyHist,
  mergeHists,
  parseHist,
  quantileFromHist,
  serializeHist,
  startOfDayUTC,
  type CheckRow,
} from '../src/lib/monitor-rollup'

const d = (iso: string) => Date.parse(iso)

describe('cubos de latencia', () => {
  it('mete cada medición en su cubo por cota superior', () => {
    expect(bucketIndex(0)).toBe(0)
    expect(bucketIndex(25)).toBe(0)
    expect(bucketIndex(26)).toBe(1)
    expect(bucketIndex(35)).toBe(1)
    expect(bucketIndex(999_999)).toBe(HIST_BOUNDS.length - 1)
  })

  // La escalera es casi geométrica a propósito: en un percentil importa el
  // error RELATIVO, y una lineal deja cubos de 1000 ms de ancho en la zona de
  // los segundos (ver el comentario de HIST_BOUNDS).
  it('ningún cubo es más de un 45% más ancho que su cota inferior', () => {
    for (let i = 1; i < HIST_BOUNDS.length - 1; i++) {
      const ancho = HIST_BOUNDS[i] - HIST_BOUNDS[i - 1]
      expect(ancho / HIST_BOUNDS[i - 1]).toBeLessThanOrEqual(0.45)
    }
  })

  it('ignora latencias que no son números útiles', () => {
    const h = emptyHist()
    addToHist(h, null)
    addToHist(h, undefined)
    addToHist(h, NaN)
    addToHist(h, -5)
    expect(h.reduce((s, n) => s + n, 0)).toBe(0)
  })

  it('suma histogramas cubo a cubo', () => {
    const a = emptyHist()
    const b = emptyHist()
    addToHist(a, 20)
    addToHist(b, 20)
    addToHist(b, 30)
    const total = mergeHists([a, b])
    expect(total[0]).toBe(2)
    expect(total[1]).toBe(1)
  })
})

describe('quantileFromHist', () => {
  it('sin muestras devuelve null', () => {
    expect(quantileFromHist(emptyHist())).toBeNull()
  })

  it('con una sola muestra cae dentro de su cubo', () => {
    const h = emptyHist()
    addToHist(h, 120)
    const p95 = quantileFromHist(h)!
    expect(p95).toBeGreaterThan(100)
    expect(p95).toBeLessThanOrEqual(125)
  })

  // La razón de ser del histograma: el p95 de un periodo tiene que salir de la
  // suma de los días, y tiene que parecerse al p95 real de esas mediciones.
  it('se aproxima al p95 exacto de una muestra realista', () => {
    const muestras: number[] = []
    for (let i = 0; i < 950; i++) muestras.push(80 + (i % 40))
    for (let i = 0; i < 50; i++) muestras.push(1200 + i * 10)

    const h = emptyHist()
    for (const ms of muestras) addToHist(h, ms)

    const ordenadas = [...muestras].sort((a, b) => a - b)
    const exacto = ordenadas[Math.ceil(0.95 * ordenadas.length) - 1]
    const aprox = quantileFromHist(h)!

    // Error relativo, que es el que importa en un percentil.
    expect(Math.abs(aprox - exacto) / exacto).toBeLessThanOrEqual(0.15)
  })

  // Regresión del caso que destapó la verificación contra la base local: la
  // escalera lineal pintaba 2450 ms un p95 real de 2030.
  it('mantiene el error relativo también en la zona de los segundos', () => {
    const muestras: number[] = []
    for (let i = 0; i < 950; i++) muestras.push(900 + (i % 200))
    for (let i = 0; i < 50; i++) muestras.push(2000 + i * 3)

    const h = emptyHist()
    for (const ms of muestras) addToHist(h, ms)

    const ordenadas = [...muestras].sort((a, b) => a - b)
    const exacto = ordenadas[Math.ceil(0.95 * ordenadas.length) - 1]
    const aprox = quantileFromHist(h)!
    expect(Math.abs(aprox - exacto) / exacto).toBeLessThanOrEqual(0.15)
  })

  it('en el cubo de desborde devuelve su cota inferior, no un invento', () => {
    const h = emptyHist()
    for (let i = 0; i < 100; i++) addToHist(h, 50_000)
    expect(quantileFromHist(h)).toBe(11_000)
  })
})

describe('serialización del histograma', () => {
  it('va y vuelve', () => {
    const h = emptyHist()
    addToHist(h, 120)
    addToHist(h, 4000)
    expect(parseHist(serializeHist(h))).toEqual(h)
  })

  it('una fila corrupta cuesta ese día, no la página', () => {
    expect(parseHist(null)).toEqual(emptyHist())
    expect(parseHist('no es json')).toEqual(emptyHist())
    expect(parseHist('{"a":1}')).toEqual(emptyHist())
    expect(parseHist('[1,"x",-3]')[0]).toBe(1)
    expect(parseHist('[1,"x",-3]')[1]).toBe(0)
    expect(parseHist('[1,"x",-3]')[2]).toBe(0)
  })
})

describe('aggregateChecks', () => {
  const rows: CheckRow[] = [
    { monitorId: 1, at: d('2026-08-09T23:59:00Z'), ok: true, responseMs: 100 },
    { monitorId: 1, at: d('2026-08-10T00:01:00Z'), ok: true, responseMs: 200 },
    { monitorId: 1, at: d('2026-08-10T12:00:00Z'), ok: false, responseMs: null },
    { monitorId: 2, at: d('2026-08-10T12:00:00Z'), ok: true, responseMs: 300 },
  ]

  it('agrupa por monitor y día UTC', () => {
    const aggs = aggregateChecks(rows)
    expect(aggs).toHaveLength(3)
    const m1d10 = aggs.find((a) => a.monitorId === 1 && a.day === '2026-08-10')!
    expect(m1d10.total).toBe(2)
    expect(m1d10.ok).toBe(1)
    expect(m1d10.sumMs).toBe(200)
  })

  it('un check caído no ensucia la latencia', () => {
    const m1d10 = aggregateChecks(rows).find((a) => a.monitorId === 1 && a.day === '2026-08-10')!
    // Solo la medición de 200ms entró al histograma; el fallo sin latencia no.
    expect(m1d10.hist.reduce((s, n) => s + n, 0)).toBe(1)
  })

  it('el corte de día es el mismo que usa SQLite con date(at,"unixepoch")', () => {
    expect(dayKeyUTC(d('2026-08-10T23:59:59Z'))).toBe('2026-08-10')
    expect(dayKeyUTC(d('2026-08-11T00:00:00Z'))).toBe('2026-08-11')
    expect(startOfDayUTC(d('2026-08-10T18:30:00Z'))).toBe(d('2026-08-10T00:00:00Z'))
  })

  it('sin filas no inventa días', () => {
    expect(aggregateChecks([])).toEqual([])
  })
})
