import { describe, expect, it } from 'vitest'
import {
  alturaDia,
  areaHistograma,
  bytesHasta,
  claveDia,
  diasDisponibilidad,
  enEscala,
  fasesCarga,
  fraccionHasta,
  histograma,
  masRapidaQue,
  senalTransferencia,
  tablaCuantiles,
  topeEscala,
  trazoSenal,
  ventanaTraza,
  type TiemposNavegacion,
} from '../src/lib/motion/medicion'
import { desplazamientoPanel, PANEL_HOLGURA } from '../src/lib/presentacion/puntero'

// Lógica pura detrás del motion de /engineering: dónde cae la visita actual
// frente a los visitantes reales, cómo se parte su carga, qué forma tiene la
// señal del osciloscopio y cómo se arma la tira de 90 días.

describe('tabla de cuantiles y posición de la visita', () => {
  const valores = Array.from({ length: 101 }, (_, i) => i * 10) // 0..1000

  it('los extremos de la tabla son el mínimo y el máximo, y es monótona', () => {
    const t = tablaCuantiles(valores)
    expect(t).toHaveLength(21)
    expect(t[0]).toBe(0)
    expect(t[20]).toBe(1000)
    expect(t[10]).toBe(500)
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!)
  })

  it('sin muestras no hay tabla, y sin tabla la posición es neutra', () => {
    expect(tablaCuantiles([])).toEqual([])
    expect(fraccionHasta([], 123)).toBe(0.5)
  })

  it('ubica un valor interpolando entre cuantiles', () => {
    const t = tablaCuantiles(valores)
    expect(fraccionHasta(t, 250)).toBeCloseTo(0.25, 5)
    expect(fraccionHasta(t, 975)).toBeCloseTo(0.975, 5)
  })

  it('fuera de rango se acota a 0 y 1', () => {
    const t = tablaCuantiles(valores)
    expect(fraccionHasta(t, -5)).toBe(0)
    expect(fraccionHasta(t, 5000)).toBe(1)
  })

  it('"más rápida que" es el complemento: menos tiempo es mejor', () => {
    const t = tablaCuantiles(valores)
    expect(masRapidaQue(t, 100)).toBe(90)
    expect(masRapidaQue(t, 900)).toBe(10)
    expect(masRapidaQue(t, 0)).toBe(100)
  })

  it('una tabla con valores repetidos no divide por cero', () => {
    const t = tablaCuantiles([5, 5, 5, 5])
    expect(Number.isFinite(fraccionHasta(t, 5))).toBe(true)
  })
})

describe('medidores', () => {
  it('el tope es 1,5 veces el umbral de pobre', () => {
    expect(topeEscala('LCP')).toBe(6000)
    expect(topeEscala('CLS')).toBeCloseTo(0.375, 6)
  })

  it('el histograma normaliza a la barra más alta y no esconde la cola', () => {
    const h = histograma([100, 100, 100, 900, 99999], 1000, 10)
    expect(h).toHaveLength(10)
    expect(Math.max(...h)).toBe(1)
    expect(h[1]).toBe(1)
    // 900 y el atípico caen en la última barra, no desaparecen.
    expect(h[9]).toBeCloseTo(2 / 3, 6)
  })

  it('el histograma vacío es todo ceros', () => {
    expect(histograma([], 1000, 4)).toEqual([0, 0, 0, 0])
  })

  it('la posición sobre la escala queda entre 0 y 1', () => {
    expect(enEscala(3000, 6000)).toBe(0.5)
    expect(enEscala(-1, 6000)).toBe(0)
    expect(enEscala(1e9, 6000)).toBe(1)
    expect(enEscala(Number.NaN, 6000)).toBe(0)
  })
})

describe('fases de la carga', () => {
  const nav = (p: Partial<TiemposNavegacion> = {}): TiemposNavegacion => ({
    redirectEnd: 0,
    domainLookupStart: 5,
    domainLookupEnd: 25,
    connectStart: 25,
    connectEnd: 80,
    requestStart: 82,
    responseStart: 300,
    responseEnd: 360,
    domContentLoadedEventEnd: 900,
    loadEventEnd: 1400,
    ...p,
  })

  it('parte la carga en red, servidor, descarga y render, en orden', () => {
    const f = fasesCarga(nav())
    expect(f.map((x) => x.clave)).toEqual(['red', 'servidor', 'descarga', 'render'])
    expect(f[1]).toEqual({ clave: 'servidor', inicio: 82, fin: 300 })
    expect(f[3]!.fin).toBe(1400)
  })

  it('omite la red cuando la conexión se reutilizó', () => {
    const f = fasesCarga(nav({ domainLookupStart: 2, domainLookupEnd: 2, connectStart: 2, connectEnd: 2 }))
    expect(f[0]!.clave).toBe('servidor')
  })

  it('ningún tramo empieza antes de que acabe el anterior', () => {
    // Página de la caché del navegador: tiempos en cero o cruzados.
    const f = fasesCarga(nav({ requestStart: 10, responseStart: 50, connectEnd: 70 }))
    for (let i = 1; i < f.length; i++) expect(f[i]!.inicio).toBeGreaterThanOrEqual(f[i - 1]!.fin)
    for (const x of f) expect(x.fin).toBeGreaterThanOrEqual(x.inicio)
  })

  it('sin loadEventEnd el render termina en el DOMContentLoaded', () => {
    const f = fasesCarga(nav({ loadEventEnd: 0 }))
    expect(f.at(-1)).toEqual({ clave: 'render', inicio: 360, fin: 900 })
  })
})

describe('señal del osciloscopio', () => {
  it('queda normalizada a 0-1 y su pico cae donde llegaron los bytes', () => {
    const s = senalTransferencia(
      [
        { inicio: 0, fin: 100, bytes: 20_000 },
        { inicio: 700, fin: 760, bytes: 400_000 },
      ],
      1000,
      101,
    )
    expect(s).toHaveLength(101)
    expect(Math.max(...s)).toBeCloseTo(1, 6)
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0)
    const pico = s.indexOf(Math.max(...s))
    expect(pico).toBeGreaterThanOrEqual(69)
    expect(pico).toBeLessThanOrEqual(77)
  })

  it('un recurso sin tamaño conocido sigue dejando rastro', () => {
    const s = senalTransferencia([{ inicio: 200, fin: 220, bytes: 0 }], 1000, 51)
    expect(Math.max(...s)).toBeGreaterThan(0)
  })

  it('la ventana se redondea a 250 ms con aire y tiene tope', () => {
    expect(ventanaTraza(1800, 1200)).toBe(2250)
    expect(ventanaTraza(null, undefined)).toBe(1000)
    expect(ventanaTraza(90_000)).toBe(12_000)
  })

  it('el trazo recorre todo el ancho sin salirse del alto', () => {
    const d = trazoSenal([0, 1, 0.5], 300, 100)
    expect(d.startsWith('M0.0 ')).toBe(true)
    expect(d).toContain('L300.0 ')
    const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(100)
    }
  })
})

describe('tira de disponibilidad', () => {
  const hoy = Date.UTC(2026, 8, 25, 15)

  it('una entrada por día, de la más antigua a hoy, con los huecos a la vista', () => {
    const d = diasDisponibilidad(
      [
        { dia: '2026-09-25', total: 100, ok: 100 },
        { dia: '2026-09-23', total: 50, ok: 49 },
        { dia: '2026-09-23', total: 50, ok: 50 }, // otro monitor el mismo día
      ],
      hoy,
      4,
    )
    expect(d.map((x) => x.dia)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'])
    expect(d[0]!.pct).toBeNull()
    expect(d[1]).toEqual({ dia: '2026-09-23', total: 100, ok: 99, pct: 99 })
    expect(d[2]!.pct).toBeNull()
    expect(d[3]!.pct).toBe(100)
  })

  it('la clave del día es UTC, la misma de monitor_daily', () => {
    expect(claveDia(Date.UTC(2026, 0, 1, 23, 59))).toBe('2026-01-01')
  })

  it('la altura amplifica la diferencia entre 99 % y 100 %', () => {
    expect(alturaDia(100)).toBe(1)
    expect(alturaDia(99)).toBeCloseTo(0.7, 6)
    expect(alturaDia(95)).toBeCloseTo(0.18, 6)
    expect(alturaDia(40)).toBeCloseTo(0.18, 6)
    expect(alturaDia(null)).toBe(0)
    expect(alturaDia(97)).toBeGreaterThan(alturaDia(96))
  })
})

describe('corrimiento horizontal del popover', () => {
  it('no se mueve si el panel cabe', () => {
    expect(desplazamientoPanel(100, 400, 1440)).toBe(0)
  })

  it('se corre lo justo para no salirse por la derecha', () => {
    // card en x=1100, panel de 400, ventana de 1440 → debe acabar en 1420.
    expect(desplazamientoPanel(1100, 400, 1440)).toBe(-(1100 + 400 - (1440 - PANEL_HOLGURA)))
  })

  it('nunca se corre más allá del margen izquierdo', () => {
    // Celular: card en x=201, panel de 358 en una ventana de 390.
    const dx = desplazamientoPanel(201, 358, 390)
    expect(201 + dx).toBeGreaterThanOrEqual(PANEL_HOLGURA)
    expect(desplazamientoPanel(10, 500, 390)).toBe(0)
  })

  it('con medidas imposibles no se mueve', () => {
    expect(desplazamientoPanel(Number.NaN, 400, 1440)).toBe(0)
    expect(desplazamientoPanel(100, 0, 1440)).toBe(0)
  })
})

describe('siluetas y lecturas del instrumento', () => {
  it('la silueta del histograma se cierra contra el suelo y no se sale de la caja', () => {
    const d = areaHistograma([0, 1, 0.5, 0], 100, 20)
    expect(d.startsWith('M0 20')).toBe(true)
    expect(d.endsWith('L100 20 Z')).toBe(true)
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    for (const v of nums) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    expect(areaHistograma([], 100, 20)).toBe('')
  })

  it('los bytes acumulados cuentan lo terminado y la parte ya recibida de lo que está en curso', () => {
    const r = [
      { inicio: 0, fin: 100, bytes: 1000 },
      { inicio: 100, fin: 300, bytes: 2000 },
    ]
    expect(bytesHasta(r, 50)).toBe(500)
    expect(bytesHasta(r, 200)).toBe(2000)
    expect(bytesHasta(r, 999)).toBe(3000)
    expect(bytesHasta(r, 0)).toBe(0)
  })
})
