import { describe, expect, it, vi } from 'vitest'

// El módulo importa `../db` para las consultas; el percentil no toca la base,
// pero el import sí, así que se mockea. Lo que se prueba aquí es solo la
// aritmética que convierte muestras crudas en la cifra que la portada afirma.
vi.mock('../src/db', () => ({ db: {} }))

const { percentil, truncar } = await import('../src/lib/pulso-publico')

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
