import { describe, it, expect } from 'vitest'
import {
  CHEQUEO_CADA_MIN,
  RE_AVISO_MIN,
  decidirAvisos,
  describirSilencio,
  jobsEnSilencio,
  parseEstado,
  tocaChequear,
  toleranciaMin,
  ventanaMin,
  vigiladosUnicos,
  type CronVigilado,
} from '../src/lib/cron-silencio'
import { CRONS } from '../src/data/automatizaciones'

const AHORA = new Date('2026-09-07T12:00:00Z')
const haceMin = (min: number) => new Date(AHORA.getTime() - min * 60_000)

const VIGILADOS: CronVigilado[] = [
  { job: 'uptime-check', cadaMin: 5, origen: 'cron-job.org' },
  { job: 'security-rollup', cadaMin: 15, origen: 'cron-job.org' },
  { job: 'backup', cadaMin: 1440, origen: 'vercel' },
]

describe('toleranciaMin', () => {
  it('tolera dos ejecuciones perdidas antes de saltar', () => {
    expect(toleranciaMin(5)).toBe(15)
    expect(toleranciaMin(15)).toBe(45)
  })

  // Sin el tope, un diario aguantaría tres días callado antes de avisar.
  it('recorta la holgura de los diarios a 12 h sobre el intervalo', () => {
    expect(toleranciaMin(1440)).toBe(1440 + 720)
  })
})

describe('vigiladosUnicos', () => {
  // El caso real: `uptime-check` lo disparan Vercel (diario) y cron-job.org
  // (cada 5 min). Quedarse con el laxo sería no enterarse de que el rápido murió.
  it('se queda con el disparador más estricto de cada job', () => {
    const unicos = vigiladosUnicos([
      { job: 'uptime-check', cadaMin: 1440, origen: 'vercel' },
      { job: 'uptime-check', cadaMin: 5, origen: 'cron-job.org' },
    ])
    expect(unicos).toHaveLength(1)
    expect(unicos[0]).toMatchObject({ cadaMin: 5, origen: 'cron-job.org' })
  })

  it('no depende del orden en que estén declarados', () => {
    const unicos = vigiladosUnicos([
      { job: 'uptime-check', cadaMin: 5, origen: 'cron-job.org' },
      { job: 'uptime-check', cadaMin: 1440, origen: 'vercel' },
    ])
    expect(unicos[0].cadaMin).toBe(5)
  })
})

describe('ventanaMin', () => {
  it('cubre la tolerancia más larga con margen', () => {
    expect(ventanaMin(VIGILADOS)).toBe(toleranciaMin(1440) + 720)
  })

  it('no revienta con la lista vacía', () => {
    expect(ventanaMin([])).toBe(0)
  })
})

describe('jobsEnSilencio', () => {
  it('calla cuando todos corrieron dentro de su tolerancia', () => {
    const ultimas = new Map([
      ['uptime-check', haceMin(4)],
      ['security-rollup', haceMin(20)],
      ['backup', haceMin(600)],
    ])
    expect(jobsEnSilencio(VIGILADOS, ultimas, AHORA)).toEqual([])
  })

  it('aguanta una ejecución perdida y salta a la tercera', () => {
    const justoDentro = new Map([['uptime-check', haceMin(15)]])
    const justoFuera = new Map([['uptime-check', haceMin(16)]])
    const soloUptime = [VIGILADOS[0]]
    expect(jobsEnSilencio(soloUptime, justoDentro, AHORA)).toEqual([])
    expect(jobsEnSilencio(soloUptime, justoFuera, AHORA)).toHaveLength(1)
  })

  // El incidente del 7 sep 2026: los dos jobs de cron-job.org deshabilitados por
  // apuntar al dominio vencido, mientras los de Vercel seguían corriendo.
  it('detecta el corte de los dos jobs externos aunque los de Vercel sigan', () => {
    const ultimas = new Map([
      ['uptime-check', haceMin(420)],
      ['security-rollup', haceMin(420)],
      ['backup', haceMin(60)],
    ])
    const silencios = jobsEnSilencio(VIGILADOS, ultimas, AHORA)
    expect(silencios.map((s) => s.job)).toEqual(['uptime-check', 'security-rollup'])
    expect(silencios[0].silencioMin).toBe(420)
  })

  it('marca con silencioMin nulo al job que no aparece en la ventana', () => {
    const silencios = jobsEnSilencio([VIGILADOS[2]], new Map(), AHORA)
    expect(silencios).toHaveLength(1)
    expect(silencios[0].silencioMin).toBeNull()
  })

  it('pone primero al que lleva más tiempo callado, y al ausente arriba del todo', () => {
    const ultimas = new Map([
      ['uptime-check', haceMin(30)],
      ['security-rollup', haceMin(300)],
    ])
    const silencios = jobsEnSilencio(VIGILADOS, ultimas, AHORA)
    expect(silencios.map((s) => s.job)).toEqual(['backup', 'security-rollup', 'uptime-check'])
  })
})

describe('decidirAvisos', () => {
  const silencio = jobsEnSilencio([VIGILADOS[0]], new Map([['uptime-check', haceMin(60)]]), AHORA)

  it('avisa la primera vez', () => {
    const { avisos, estado } = decidirAvisos(silencio, { avisados: {} }, AHORA)
    expect(avisos).toHaveLength(1)
    expect(estado.avisados['uptime-check']).toBe(AHORA.getTime())
  })

  it('no repite el aviso dentro de la ventana de re-aviso', () => {
    const previo = { avisados: { 'uptime-check': AHORA.getTime() - 60 * 60_000 } }
    const { avisos, estado } = decidirAvisos(silencio, previo, AHORA)
    expect(avisos).toEqual([])
    // Conserva la marca vieja: la ventana de re-aviso cuenta desde el aviso real.
    expect(estado.avisados['uptime-check']).toBe(previo.avisados['uptime-check'])
  })

  it('vuelve a avisar pasadas las 24 h de silencio', () => {
    const previo = { avisados: { 'uptime-check': AHORA.getTime() - RE_AVISO_MIN * 60_000 } }
    expect(decidirAvisos(silencio, previo, AHORA).avisos).toHaveLength(1)
  })

  // Un job que se recupera sale del estado; si recae, el aviso es inmediato en
  // vez de quedar tapado por la marca vieja.
  it('olvida a los jobs que se recuperaron', () => {
    const previo = { avisados: { 'security-rollup': AHORA.getTime() } }
    const { estado } = decidirAvisos(silencio, previo, AHORA)
    expect(estado.avisados['security-rollup']).toBeUndefined()
  })

  it('deja constancia de la revisión aunque no haya nada que avisar', () => {
    const { avisos, estado } = decidirAvisos([], { avisados: {} }, AHORA)
    expect(avisos).toEqual([])
    expect(estado.chequeadoEn).toBe(AHORA.getTime())
  })
})

describe('tocaChequear', () => {
  it('revisa si no hay revisión previa', () => {
    expect(tocaChequear({ avisados: {} }, AHORA)).toBe(true)
  })

  it('no revisa dos veces dentro de la misma hora', () => {
    const previo = { avisados: {}, chequeadoEn: AHORA.getTime() - 5 * 60_000 }
    expect(tocaChequear(previo, AHORA)).toBe(false)
  })

  it('revisa cumplido el intervalo', () => {
    const previo = { avisados: {}, chequeadoEn: AHORA.getTime() - CHEQUEO_CADA_MIN * 60_000 }
    expect(tocaChequear(previo, AHORA)).toBe(true)
  })

  // Una marca en el futuro (reloj torcido, dato corrupto) dejaría al vigilante
  // mudo hasta que el reloj la alcanzara. Se revisa y se reescribe.
  it('no se queda mudo con una marca futura', () => {
    const previo = { avisados: {}, chequeadoEn: AHORA.getTime() + 86_400_000 }
    expect(tocaChequear(previo, AHORA)).toBe(true)
  })
})

describe('parseEstado', () => {
  it('devuelve estado vacío ante nulo, basura o JSON no-objeto', () => {
    for (const raw of [null, undefined, '', 'no es json', '[]', '"texto"', '42']) {
      expect(parseEstado(raw)).toEqual({ avisados: {} })
    }
  })

  it('descarta entradas que no son marcas de tiempo', () => {
    const raw = JSON.stringify({ avisados: { a: 1, b: 'ayer', c: null }, chequeadoEn: 7 })
    expect(parseEstado(raw)).toEqual({ avisados: { a: 1 }, chequeadoEn: 7 })
  })

  it('ida y vuelta con lo que escribe decidirAvisos', () => {
    const { estado } = decidirAvisos(
      jobsEnSilencio([VIGILADOS[0]], new Map(), AHORA),
      { avisados: {} },
      AHORA
    )
    expect(parseEstado(JSON.stringify(estado))).toEqual(estado)
  })
})

describe('describirSilencio', () => {
  it('dice minutos, horas o ausencia total según el caso', () => {
    const [uptime] = jobsEnSilencio([VIGILADOS[0]], new Map([['uptime-check', haceMin(30)]]), AHORA)
    expect(describirSilencio(uptime)).toContain('callado 30min')

    const [largo] = jobsEnSilencio([VIGILADOS[0]], new Map([['uptime-check', haceMin(420)]]), AHORA)
    expect(describirSilencio(largo)).toContain('callado 7h')

    const [ausente] = jobsEnSilencio([VIGILADOS[2]], new Map(), AHORA)
    expect(describirSilencio(ausente)).toContain('sin ninguna ejecución registrada')
  })

  // La alerta llega por ntfy y por correo, donde no hay contexto: tiene que
  // decir qué job es y quién debería estar disparándolo.
  it('nombra el job y su disparador', () => {
    const [s] = jobsEnSilencio([VIGILADOS[1]], new Map(), AHORA)
    expect(describirSilencio(s)).toContain('security-rollup')
    expect(describirSilencio(s)).toContain('cron-job.org')
  })
})

describe('catálogo de crons', () => {
  // El catálogo publica el horario en texto y lo vigila en minutos: si los dos
  // se separan, la página dice una cosa y la alerta espera otra.
  it('declara cadaMin coherente con el horario publicado en cada entrada', () => {
    for (const c of CRONS) {
      expect(c.cadaMin, `${c.job} sin cadencia`).toBeGreaterThan(0)
      const m = c.horario.match(/cada ~?(\d+) min/)
      if (m) expect(c.cadaMin, `${c.job}`).toBe(Number(m[1]))
      else expect(c.cadaMin, `${c.job} declarado con horario fijo`).toBe(1440)
    }
  })

  it('vigila todos los endpoints de cron que existen en el repo', async () => {
    const { readdirSync } = await import('node:fs')
    const enDisco = readdirSync('src/pages/api/cron')
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    const vigilados = [...new Set(CRONS.map((c) => c.job))].sort()
    expect(vigilados).toEqual(enDisco)
  })
})
