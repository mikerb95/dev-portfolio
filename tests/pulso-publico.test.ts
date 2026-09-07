import { describe, expect, it, vi } from 'vitest'

// El módulo importa `../db` para las consultas; el percentil no toca la base,
// pero el import sí, así que se mockea. Lo que se prueba aquí es solo la
// aritmética que convierte muestras crudas en la cifra que la portada afirma.
vi.mock('../src/db', () => ({ db: {} }))

const { percentil, truncar, rellenarDias, agruparHoras, histograma } = await import(
  '../src/lib/pulso-publico'
)

describe('percentil', () => {
  it('sin muestras no inventa un cero', () => {
    // Un 0 aquí saldría pintado como "0,00 s" en el hero: una afirmación falsa
    // sobre el rendimiento del sitio. La cinta omite la señal en su lugar.
    expect(percentil([], 75)).toBeNull()
  })

  it('con una sola muestra devuelve esa muestra', () => {
    expect(percentil([1234], 75)).toBe(1234)
  })

  it('no depende del orden de llegada (las filas vienen por fecha desc)', () => {
    const muestras = [900, 1200, 300, 2500, 700, 1800, 400, 1100]
    expect(percentil(muestras, 75)).toBe(percentil([...muestras].reverse(), 75))
  })

  it('usa el método del más cercano por rango, como reporta Web Vitals', () => {
    // 8 muestras ordenadas: ceil(0.75 * 8) = 6 → la sexta (índice 5) = 1200.
    expect(percentil([100, 200, 300, 400, 800, 1200, 2000, 4000], 75)).toBe(1200)
  })

  it('p100 es el máximo y p1 el mínimo', () => {
    const muestras = [5, 1, 9, 3]
    expect(percentil(muestras, 100)).toBe(9)
    expect(percentil(muestras, 1)).toBe(1)
  })

  it('no muta el arreglo que recibe', () => {
    const muestras = [3, 1, 2]
    percentil(muestras, 75)
    expect(muestras).toEqual([3, 1, 2])
  })
})

describe('truncar', () => {
  it('no redondea un uptime imperfecto hasta el 100%', () => {
    // 20.303 de 20.304 sondeos: hubo un fallo real y la cinta no puede
    // presumir de que no lo hubo.
    expect(truncar((20303 / 20304) * 100, 2)).toBe(99.99)
  })

  it('deja el 100% cuando de verdad no falló nada', () => {
    expect(truncar(100, 2)).toBe(100)
  })

  it('enseña el peor valor del intervalo en segundos', () => {
    expect(truncar(2969 / 1000, 1)).toBe(2.9)
  })

  it('con cero decimales devuelve el entero inferior', () => {
    expect(truncar(9.87, 0)).toBe(9)
  })
})

describe('rellenarDias', () => {
  const AHORA = Date.UTC(2026, 8, 7, 15, 0, 0) // 7 sep 2026

  it('devuelve la ventana completa aunque solo haya una fila', () => {
    const serie = rellenarDias([{ dia: '2026-09-07', valor: 1, total: 100 }], AHORA, 30)
    expect(serie).toHaveLength(30)
    expect(serie[29].dia).toBe('2026-09-07')
    expect(serie[0].dia).toBe('2026-08-09')
  })

  it('marca como hueco los días sin fila, no como cero', () => {
    // Un día sin sondeos no es un día al 0% ni al 100%: es un día sin datos, y
    // solo `null` deja que el panel lo pinte como el agujero que fue.
    const serie = rellenarDias([{ dia: '2026-09-07', valor: 1, total: 100 }], AHORA, 3)
    expect(serie.map((d) => d.valor)).toEqual([null, null, 1])
    expect(serie.map((d) => d.total)).toEqual([0, 0, 100])
  })

  it('ordena del más antiguo al más reciente pese al orden de entrada', () => {
    const serie = rellenarDias(
      [
        { dia: '2026-09-07', valor: 3, total: 3 },
        { dia: '2026-09-05', valor: 1, total: 1 },
        { dia: '2026-09-06', valor: 2, total: 2 },
      ],
      AHORA,
      3,
    )
    expect(serie.map((d) => d.valor)).toEqual([1, 2, 3])
  })

  it('ignora filas fuera de la ventana', () => {
    const serie = rellenarDias([{ dia: '2026-01-01', valor: 1, total: 9 }], AHORA, 3)
    expect(serie.every((d) => d.valor === null)).toBe(true)
  })
})

describe('agruparHoras', () => {
  const AHORA = Date.UTC(2026, 8, 7, 15, 30, 0)
  const H = 3_600_000

  it('la última casilla es la hora en curso', () => {
    const serie = agruparHoras([{ at: AHORA - 60_000, ok: true }], AHORA, 24)
    expect(serie).toHaveLength(24)
    expect(serie[23].total).toBe(1)
    expect(serie[23].hora).toBe(0)
  })

  it('reparte por distancia a ahora, no por hora del reloj', () => {
    const serie = agruparHoras(
      [
        { at: AHORA - 30 * 60_000, ok: true },
        { at: AHORA - 2.5 * H, ok: false },
        { at: AHORA - 2.1 * H, ok: true },
      ],
      AHORA,
      24,
    )
    expect(serie[23].total).toBe(1)
    expect(serie[21].total).toBe(2)
    expect(serie[21].ok).toBe(1)
  })

  it('descarta lo que cae fuera de la ventana en vez de amontonarlo en el borde', () => {
    // Amontonar lo viejo en la primera casilla inventaría un pico que no
    // existió a esa hora.
    const serie = agruparHoras([{ at: AHORA - 40 * H, ok: true }], AHORA, 24)
    expect(serie.reduce((n, c) => n + c.total, 0)).toBe(0)
  })
})

describe('histograma', () => {
  it('reparte por los umbrales de Web Vitals', () => {
    const conteo = histograma([500, 900, 1200, 2000, 3000, 5000], [1000, 1800, 2500, 4000])
    expect(conteo).toEqual([2, 1, 1, 1, 1])
  })

  it('el valor igual al corte cae en el tramo superior', () => {
    // El umbral de Web Vitals es "hasta 2,5 s es bueno": 2500 exacto ya no lo es.
    expect(histograma([2500], [1000, 1800, 2500, 4000])).toEqual([0, 0, 0, 1, 0])
  })

  it('sin muestras devuelve todos los tramos a cero', () => {
    expect(histograma([], [1000, 2500])).toEqual([0, 0, 0])
  })
})
