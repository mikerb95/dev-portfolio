import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ESTADOS_ESCALON,
  OBJETIVOS_PROHIBIDOS,
  RECUPERACION_P95_MS,
  esObjetivoProhibido,
  estadoPorError,
  parseK6Summary,
  recuperadoEnS,
} from '../src/lib/lab/load-test'

// Corridas reales guardadas por los scripts, no fixtures inventados: si el
// formato del summary cambia, estos tests lo notan.
const CARGA = JSON.parse(readFileSync('lab/k6/resultados/carga-2026-08-10T05-26-20-277Z.json', 'utf8'))
const ESTRES = JSON.parse(readFileSync('lab/k6/resultados/estres-2026-08-27T15-10-31-684Z.json', 'utf8'))

describe('guardarraíl de objetivo', () => {
  it('rechaza producción, su alias de Vercel y el dominio viejo', () => {
    expect(esObjetivoProhibido('https://codebymike.net')).toBe(true)
    expect(esObjetivoProhibido('https://www.codebymike.tech/status')).toBe(true)
    expect(esObjetivoProhibido('https://dev-portfolio.vercel.app')).toBe(true)
  })

  it('acepta local y previews', () => {
    expect(esObjetivoProhibido('http://127.0.0.1:4400')).toBe(false)
    expect(esObjetivoProhibido('https://dev-portfolio-git-rama-codebymike.vercel.app')).toBe(false)
  })

  it('no se desincroniza de la lista que usa el script de k6', () => {
    // La lista está duplicada a propósito (perfil.js corre en el runtime de k6
    // y no puede importar TypeScript). Este test es lo que la mantiene honesta:
    // relajar una copia sin la otra deja un agujero silencioso.
    const perfil = readFileSync('lab/k6/lib/perfil.js', 'utf8')
    const linea = perfil.match(/const prohibidos = \[([^\]]+)\]/)
    expect(linea, 'no se encontró la lista de prohibidos en perfil.js').not.toBeNull()
    const enScript = [...linea![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(enScript.sort()).toEqual([...OBJETIVOS_PROHIBIDOS].sort())
  })
})

describe('estadoPorError', () => {
  it('usa los mismos cortes que estres.js', () => {
    expect(estadoPorError(0)).toBe('ok')
    expect(estadoPorError(0.9)).toBe('ok')
    expect(estadoPorError(1)).toBe('degradado')
    expect(estadoPorError(19.9)).toBe('degradado')
    expect(estadoPorError(20)).toBe('roto')
    expect(estadoPorError(100)).toBe('roto')
  })
})

describe('recuperadoEnS', () => {
  it('devuelve el primer tramo con p95 sano', () => {
    const curva = [
      { desdeS: 0, n: 120, p50: 10000, p95: 10001 },
      { desdeS: 15, n: 120, p50: 2000, p95: 4000 },
      { desdeS: 30, n: 120, p50: 30, p95: 90 },
      { desdeS: 45, n: 120, p50: 25, p95: 60 },
    ]
    expect(recuperadoEnS(curva)).toBe(30)
  })

  it('ignora tramos sin muestra en vez de tomarlos por recuperados', () => {
    // Un tramo con n=0 tiene p95=0, que pasaría el umbral por casualidad y
    // reportaría una recuperación instantánea que nunca ocurrió (H-04).
    const curva = [
      { desdeS: 0, n: 0, p50: 0, p95: 0 },
      { desdeS: 15, n: 80, p50: 40, p95: 120 },
    ]
    expect(recuperadoEnS(curva)).toBe(15)
  })

  it('distingue "no se recuperó" (null) de "se recuperó en 0 s"', () => {
    const nunca = [{ desdeS: 0, n: 100, p95: RECUPERACION_P95_MS + 1 }]
    expect(recuperadoEnS(nunca)).toBeNull()
    expect(recuperadoEnS([{ desdeS: 0, n: 100, p95: 10 }])).toBe(0)
    expect(recuperadoEnS(undefined)).toBeNull()
  })
})

describe('parseK6Summary - escenario carga', () => {
  const res = parseK6Summary(CARGA)

  it('acepta una corrida real', () => {
    expect(res.ok).toBe(true)
  })

  it('extrae la cabecera de la corrida', () => {
    if (!res.ok) throw new Error(res.error)
    expect(res.run.scenario).toBe('carga')
    expect(res.run.tool).toBe('k6')
    expect(res.run.target).toBe(CARGA.objetivo)
    expect(res.run.ranAt.toISOString()).toBe(CARGA.fecha)
    expect(res.run.p95).toBe(CARGA.latenciaMs.p95)
    expect(res.run.requests).toBe(CARGA.peticiones)
  })

  it('normaliza la curva de capacidad a escalones en VUs', () => {
    if (!res.ok) throw new Error(res.error)
    expect(res.run.steps).toHaveLength(CARGA.curvaCapacidad.length)
    expect(res.run.steps.every((s) => s.unidad === 'vus')).toBe(true)
    expect(res.run.steps.every((s) => ESTADOS_ESCALON.includes(s.estado))).toBe(true)
    expect(res.run.steps[0].carga).toBe(CARGA.curvaCapacidad[0].vus)
  })

  it('no reporta punto de quiebre en req/s desde un escenario medido en VUs', () => {
    if (!res.ok) throw new Error(res.error)
    expect(res.run.breakingPointRps).toBeNull()
  })

  it('toma como capacidad sostenida el mayor throughput de los escalones sanos', () => {
    if (!res.ok) throw new Error(res.error)
    const sanos = CARGA.curvaCapacidad.filter((c: { errorPct: number }) => c.errorPct < 1)
    expect(res.run.sustainedRps).toBe(Math.max(...sanos.map((c: { exitosasRps: number }) => c.exitosasRps)))
  })
})

describe('parseK6Summary - escenario estres', () => {
  const res = parseK6Summary(ESTRES)

  it('extrae escalones en req/s, punto de quiebre y recuperación', () => {
    if (!res.ok) throw new Error(res.error)
    expect(res.run.scenario).toBe('estres')
    expect(res.run.steps.every((s) => s.unidad === 'rps')).toBe(true)
    const primerRoto = ESTRES.escalera.find((e: { estado: string }) => e.estado === 'roto')
    expect(res.run.breakingPointRps).toBe(primerRoto?.rpsOfrecido ?? null)
    expect(res.run.recoveredAfterS).toBe(recuperadoEnS(ESTRES.recuperacion.curva))
  })

  it('conserva CPU y heap por escalón, incluidos los sin muestra', () => {
    if (!res.ok) throw new Error(res.error)
    expect(res.run.steps[0].cpuPct).toBe(ESTRES.escalera[0].cpuPct)
    expect(res.run.steps[0].heapMb).toBe(ESTRES.escalera[0].heapMb)
  })

  it('se queda solo con los hallazgos escritos a mano', () => {
    if (!res.ok) throw new Error(res.error)
    const conTexto = ESTRES.hallazgos.filter((h: { titulo: string }) => h.titulo.trim() !== '')
    expect(res.run.findings).toHaveLength(conTexto.length)
    expect(res.run.findings.every((h) => h.id !== '' && h.titulo !== '')).toBe(true)
  })

  it('descarta las casillas H-0x que quedaron en blanco', () => {
    const conVacios = {
      ...ESTRES,
      hallazgos: [{ id: 'H-01', titulo: '', descripcion: '' }, { id: 'H-02', titulo: 'algo', descripcion: 'x' }],
    }
    const r = parseK6Summary(conVacios)
    if (!r.ok) throw new Error(r.error)
    expect(r.run.findings).toEqual([{ id: 'H-02', titulo: 'algo', descripcion: 'x' }])
  })
})

describe('parseK6Summary - rechazos', () => {
  it('rechaza un objetivo de producción aunque el resto del summary sea válido', () => {
    const r = parseK6Summary({ ...CARGA, objetivo: 'https://codebymike.net' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/producción/)
  })

  it('rechaza escenarios desconocidos', () => {
    const r = parseK6Summary({ ...CARGA, escenario: 'humo' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/escenario/)
  })

  it('rechaza payloads que no son un objeto', () => {
    expect(parseK6Summary(null).ok).toBe(false)
    expect(parseK6Summary([CARGA]).ok).toBe(false)
    expect(parseK6Summary('{}').ok).toBe(false)
  })

  it('rechaza una corrida sin objetivo o con fecha inválida', () => {
    expect(parseK6Summary({ ...CARGA, objetivo: '' }).ok).toBe(false)
    expect(parseK6Summary({ ...CARGA, fecha: 'ayer' }).ok).toBe(false)
  })

  it('sobrevive a un summary mínimo, sin escalones ni latencias', () => {
    const r = parseK6Summary({ escenario: 'carga', objetivo: 'http://127.0.0.1:4400', fecha: CARGA.fecha })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.run.steps).toEqual([])
    expect(r.run.p95).toBeNull()
    expect(r.run.sustainedRps).toBeNull()
  })
})
