import { describe, expect, it } from 'vitest'
import { construirSenales, etiquetaDia } from '../src/lib/pulso-panel'
import type { Pulso } from '../src/lib/pulso-publico'
import es from '../src/i18n/es'

// Módulo puro: no hace falta mockear la base porque no la importa. Lo que se
// prueba aquí es la traducción de números a gráfico, que es donde un descuido
// no rompe nada visible pero deja la portada contando otra cosa.

const T = es.home.pulso
const L = (p: string) => p

function dia(offset: number): string {
  return new Date(Date.UTC(2026, 8, 7) - offset * 86_400_000).toISOString().slice(0, 10)
}

function pulsoBase(over: Partial<Pulso> = {}): Pulso {
  const serieUptime = Array.from({ length: 30 }, (_, i) => ({
    dia: dia(29 - i),
    valor: 1,
    total: 100,
  }))
  return {
    uptime: 1,
    sondeos: 3000,
    ventanaDias: 30,
    serieUptime,
    eventos: 90,
    serieEventos: serieUptime.map((d) => ({ dia: d.dia, valor: 3, total: 3 })),
    crons: { ok: 240, total: 240 },
    serieCrons: Array.from({ length: 24 }, (_, i) => ({ hora: 23 - i, ok: 10, total: 10 })),
    lcpP75: 1200,
    muestrasLcp: [800, 1200, 1500, 2600],
    ...over,
  }
}

describe('construirSenales', () => {
  it('con todos los datos publica las cinco señales', () => {
    const senales = construirSenales(pulsoBase(), T, 'es', L)
    expect(senales.map((s) => s.id)).toEqual(['uptime', 'sondeos', 'siem', 'crons', 'lcp'])
  })

  it('descarta la señal que no tiene dato en vez de pintarla en cero', () => {
    // Es la regla que sostiene la cinta entera: sin micro-SIEM, la portada no
    // afirma "0 clasificados", simplemente deja de hablar de eso.
    const senales = construirSenales(
      pulsoBase({ eventos: 0, serieEventos: [], lcpP75: null, muestrasLcp: [] }),
      T,
      'es',
      L,
    )
    expect(senales.map((s) => s.id)).toEqual(['uptime', 'sondeos', 'crons'])
  })

  it('sin ningún dato no devuelve señales, y la cinta desaparece', () => {
    const vacio = construirSenales(
      pulsoBase({
        uptime: null,
        sondeos: 0,
        serieUptime: [],
        eventos: 0,
        serieEventos: [],
        crons: { ok: 0, total: 0 },
        lcpP75: null,
        muestrasLcp: [],
      }),
      T,
      'es',
      L,
    )
    expect(vacio).toEqual([])
  })

  it('cada señal apunta a la página pública que sostiene su cifra', () => {
    const senales = construirSenales(pulsoBase(), T, 'es', L)
    expect(Object.fromEntries(senales.map((s) => [s.id, s.href]))).toEqual({
      uptime: '/status',
      sondeos: '/status',
      siem: '/security',
      crons: '/automatizaciones',
      lcp: '/engineering',
    })
  })

  it('trunca el uptime en vez de redondearlo al alza', () => {
    const serie = pulsoBase().serieUptime
    const senales = construirSenales(
      pulsoBase({ uptime: 20303 / 20304, serieUptime: serie }),
      T,
      'es',
      L,
    )
    expect(senales[0].valor).toBe('99,99%')
  })
})

describe('barras del panel', () => {
  it('pinta un día sin datos como hueco, no como caída', () => {
    const serie = pulsoBase().serieUptime.map((d, i) =>
      i === 10 ? { ...d, valor: null, total: 0 } : d,
    )
    const [uptime] = construirSenales(pulsoBase({ serieUptime: serie }), T, 'es', L)
    expect(uptime.panel.barras[10].tono).toBe('vacio')
    expect(uptime.panel.barras[10].etiqueta).toContain(T.paneles.sinDatos)
    // Y un hueco no cuenta como día perfecto en el resumen.
    expect(uptime.panel.resumen[1].v).toBe('29/29')
  })

  it('separa por color el día que incumple el objetivo', () => {
    const serie = pulsoBase().serieUptime.map((d, i) =>
      i === 5 ? { ...d, valor: 0.9 } : i === 6 ? { ...d, valor: 0.99 } : d,
    )
    const [uptime] = construirSenales(pulsoBase({ serieUptime: serie }), T, 'es', L)
    expect(uptime.panel.barras[5].tono).toBe('mal')
    expect(uptime.panel.barras[6].tono).toBe('medio')
    expect(uptime.panel.barras[7].tono).toBe('ok')
  })

  it('un día al 0% conserva altura visible', () => {
    // Sin altura mínima, una caída total se ve igual que un día sin datos.
    const serie = pulsoBase().serieUptime.map((d, i) => (i === 3 ? { ...d, valor: 0 } : d))
    const [uptime] = construirSenales(pulsoBase({ serieUptime: serie }), T, 'es', L)
    expect(uptime.panel.barras[3].alto).toBeGreaterThan(0)
    expect(uptime.panel.barras[3].alto).toBeLessThan(0.2)
  })

  it('una hora de crons con un solo fallo se pinta en rojo entera', () => {
    const serie = pulsoBase().serieCrons.map((h, i) => (i === 4 ? { ...h, ok: 9 } : h))
    const crons = construirSenales(pulsoBase({ serieCrons: serie }), T, 'es', L).find(
      (s) => s.id === 'crons',
    )!
    expect(crons.panel.barras[4].tono).toBe('mal')
    expect(crons.panel.barras[5].tono).toBe('ok')
  })

  it('el histograma de LCP tiene un tramo por umbral de Web Vitals', () => {
    const lcp = construirSenales(pulsoBase(), T, 'es', L).find((s) => s.id === 'lcp')!
    expect(lcp.panel.barras).toHaveLength(T.paneles.tramosLcp.length)
    expect(lcp.panel.resumen.map((r) => r.k)).toEqual(['p50', 'p95', 'muestras'])
  })
})

describe('etiquetaDia', () => {
  it('nombra el día UTC de la barra, no el de la zona local', () => {
    // En Colombia (-05), interpretar '2026-09-07' como hora local retrocede al 6
    // y el tooltip acabaría nombrando un día distinto del que pinta la barra.
    expect(etiquetaDia('2026-09-07', 'es')).toContain('7')
    expect(etiquetaDia('2026-09-07', 'en')).toContain('7')
  })
})
