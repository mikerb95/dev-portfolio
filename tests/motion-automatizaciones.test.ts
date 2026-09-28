import { describe, expect, it } from 'vitest'
import { CRONS, WORKFLOWS, type Cron } from '../src/data/automatizaciones'
import {
  carrilesDelCatalogo,
  consumoTolerancia,
  construirPartitura,
  estadoFila,
  huecosDe,
  instantesDiarios,
  minutoDelDia,
  simularCorte,
  type Corrida,
} from '../src/lib/motion/partitura'
import { EVENTOS_CI, workflowsDe } from '../src/lib/motion/disparos'

const MIN = 60_000
const H = 60 * MIN
// Un "ahora" fijo: 28 sep 2026, 23:30 UTC.
const AHORA = Date.UTC(2026, 8, 28, 23, 30)

/** Bitácora sintética sana de 48 h con el ritmo del catálogo real. */
function bitacoraSana(hasta = AHORA): Corrida[] {
  const out: Corrida[] = []
  const desde = hasta - 48 * H
  for (let t = desde; t <= hasta; t += 5 * MIN) out.push({ job: 'uptime-check', at: t, ok: true, ms: 900 })
  for (let t = desde; t <= hasta; t += 15 * MIN) out.push({ job: 'security-rollup', at: t, ok: true, ms: 400 })
  for (const c of CRONS) {
    const m = minutoDelDia(c.horario)
    if (m === null) continue
    for (const at of instantesDiarios([m], desde, hasta)) out.push({ job: c.job, at, ok: true, ms: 2000 })
  }
  return out
}

describe('partitura: carriles', () => {
  it('un renglón por job, con el intervalo más estricto y el pulso denso primero', () => {
    const carriles = carrilesDelCatalogo(CRONS)
    expect(carriles.length).toBe(new Set(CRONS.map((c) => c.job)).size)
    const uptime = carriles.find((c) => c.job === 'uptime-check')!
    expect(uptime.cadaMin).toBe(5)
    expect(uptime.origenes.sort()).toEqual(['cron-job.org', 'vercel'])
    expect(uptime.horarios).toEqual([7 * 60])
    expect(carriles[0].job).toBe('uptime-check')
    expect(carriles[1].job).toBe('security-rollup')
    // Los diarios quedan por hora declarada.
    const diarios = carriles.slice(2).map((c) => c.horarios[0])
    expect(diarios).toEqual([...diarios].sort((a, b) => a - b))
  })

  it('solo lee como hora lo que es una hora del día', () => {
    expect(minutoDelDia('08:30')).toBe(510)
    expect(minutoDelDia({ es: 'cada ~5 min', en: 'every ~5 min' })).toBeNull()
    expect(minutoDelDia('cada rato')).toBeNull()
  })
})

describe('partitura: marcas y silencios', () => {
  it('con una bitácora sana dibuja todas las corridas de 24 h y no ve silencios', () => {
    const p = construirPartitura(bitacoraSana(), CRONS, AHORA)
    expect(p.enSilencio).toEqual([])
    const uptime = p.carriles.find((c) => c.job === 'uptime-check')!
    // 288 del externo en 24 h (+1 por el borde incluido) y la de las 07:00.
    expect(uptime.total).toBeGreaterThanOrEqual(289)
    for (const c of p.carriles) {
      expect(c.huecos).toEqual([])
      for (const m of c.marcas) {
        expect(m.x).toBeGreaterThanOrEqual(0)
        expect(m.x).toBeLessThanOrEqual(1)
      }
    }
    // Cada diario tiene su fantasma (hora declarada) dentro de la ventana.
    const backup = p.carriles.find((c) => c.job === 'backup')!
    expect(backup.fantasmas.length).toBe(1)
    expect(backup.marcas.length).toBe(1)
  })

  it('un hueco más largo que la tolerancia es un silencio, y uno corto no', () => {
    const t0 = AHORA - 10 * H
    const tiempos = [t0, t0 + 5 * MIN, t0 + 55 * MIN, t0 + 60 * MIN, t0 + 70 * MIN]
    const huecos = huecosDe(tiempos, 15, AHORA - 24 * H, t0 + 71 * MIN)
    expect(huecos).toHaveLength(1)
    expect(huecos[0].min).toBe(50)
    expect(huecos[0].abierto).toBe(false)
  })

  it('el silencio en curso llega hasta el borde derecho y marca al job', () => {
    const corridas = bitacoraSana().filter((c) => !(c.job === 'security-rollup' && c.at > AHORA - 3 * H))
    const p = construirPartitura(corridas, CRONS, AHORA)
    expect(p.enSilencio).toEqual(['security-rollup'])
    const h = p.carriles.find((c) => c.job === 'security-rollup')!.huecos.at(-1)!
    expect(h.abierto).toBe(true)
    expect(h.x1).toBe(1)
  })
})

describe('estado de una fila de la tabla', () => {
  it('distingue callado de "no hay historia suficiente para saberlo"', () => {
    // Diario sin ninguna corrida: con 48 h leídas es silencio (tolerancia 36 h)...
    expect(estadoFila(1440, null, 48 * 60, AHORA)).toBe('silencio')
    // ...con 9 h leídas no se puede acusar a nadie.
    expect(estadoFila(1440, null, 9 * 60, AHORA)).toBe('sin-registro')
    expect(estadoFila(5, { at: AHORA - 4 * MIN, ok: false }, 48 * 60, AHORA)).toBe('fallo')
    expect(estadoFila(5, { at: AHORA - 16 * MIN, ok: true }, 48 * 60, AHORA)).toBe('silencio')
    expect(estadoFila(1440, { at: AHORA - 20 * H, ok: true }, 48 * 60, AHORA)).toBe('ok')
  })

  it('el medidor llega a 1 justo en la tolerancia', () => {
    expect(consumoTolerancia(5, AHORA - 15 * MIN, AHORA)).toBeCloseTo(1)
    expect(consumoTolerancia(1440, AHORA - 18 * H, AHORA)).toBeCloseTo(0.5)
    expect(consumoTolerancia(5, null, AHORA)).toBe(1)
  })
})

describe('simulacro de corte del programador externo', () => {
  it('la alarma llega con la siguiente corrida diaria de uptime-check, no antes', () => {
    const sim = simularCorte(bitacoraSana(), CRONS, AHORA)
    // Corte a las 23:30 UTC: el vigilante solo se despierta a las 07:00 UTC.
    expect(sim.alarma).not.toBeNull()
    expect(new Date(sim.alarma!.at).toISOString()).toBe('2026-09-29T07:00:00.000Z')
    const jobs = sim.alarma!.avisos.map((a) => a.job)
    expect(jobs).toContain('uptime-check')
    expect(jobs).toContain('security-rollup')
    // Los textos son los del aviso real.
    expect(sim.alarma!.textos.join(' ')).toMatch(/cron uptime-check callado 8h \(cada 5min, cron-job\.org\)/)
  })

  it('solo sigue sonando lo que dispara Vercel', () => {
    const sim = simularCorte(bitacoraSana(), CRONS, AHORA)
    const deVercel = new Set(CRONS.filter((c) => c.origen === 'vercel').map((c) => c.job))
    expect(sim.futuras.every((f) => deVercel.has(f.job))).toBe(true)
    expect(sim.callados).toContain('security-rollup')
    expect(sim.callados).not.toContain('uptime-check')
  })

  it('si el corte cae justo antes de las 07:00 la revisión horaria no toca y la alarma se va al día siguiente', () => {
    const corte = Date.UTC(2026, 8, 29, 6, 58)
    const sim = simularCorte(bitacoraSana(corte), CRONS, corte)
    expect(new Date(sim.alarma!.at).toISOString()).toBe('2026-09-30T07:00:00.000Z')
  })

  it('sin disparador de Vercel para el vigilante no hay alarma dentro del horizonte', () => {
    const sinDiario: Cron[] = CRONS.filter((c) => !(c.job === 'uptime-check' && c.origen === 'vercel'))
    const sim = simularCorte(bitacoraSana(), sinDiario, AHORA)
    expect(sim.alarma).toBeNull()
  })
})

describe('disparos de CI', () => {
  it('cada evento enciende exactamente los workflows que lo declaran', () => {
    for (const ev of EVENTOS_CI) {
      const esperados = WORKFLOWS.filter((w) => w.disparadores.includes(ev)).map((w) => w.nombre)
      expect(workflowsDe(ev, WORKFLOWS).map((w) => w.nombre)).toEqual(esperados)
    }
    // Ningún workflow queda fuera de todos los eventos del selector.
    for (const w of WORKFLOWS) expect(EVENTOS_CI.some((ev) => w.disparadores.includes(ev))).toBe(true)
  })

  it('la verificación del deploy solo corre en push', () => {
    const ci = WORKFLOWS.find((w) => w.nombre === 'CI')!
    const verif = ci.etapas!.find((e) => e.soloPush)!
    expect(verif).toBeDefined()
    expect(ci.etapas!.filter((e) => e.soloPush)).toHaveLength(1)
  })
})
