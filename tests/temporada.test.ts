import { describe, expect, it } from 'vitest'
import { espectrosPara, MAX_ESPECTROS, MAX_ESPECTROS_MOVIL, temporadaActual } from '../src/lib/temporada'

describe('temporadaActual', () => {
  it('es Halloween todo octubre', () => {
    expect(temporadaActual(new Date('2026-10-01T12:00:00-05:00'))).toBe('halloween')
    expect(temporadaActual(new Date('2026-10-31T23:59:00-05:00'))).toBe('halloween')
  })

  it('no lo es fuera de octubre', () => {
    expect(temporadaActual(new Date('2026-09-30T12:00:00-05:00'))).toBeNull()
    expect(temporadaActual(new Date('2026-11-01T00:00:00-05:00'))).toBeNull()
  })

  // En UTC ya es 1 de octubre / 1 de noviembre, en Bogotá todavía no: manda
  // la hora local del sitio, no la del servidor.
  it('decide con la hora de Bogotá, no con UTC', () => {
    expect(temporadaActual(new Date('2026-10-01T03:00:00Z'))).toBeNull()
    expect(temporadaActual(new Date('2026-11-01T03:00:00Z'))).toBe('halloween')
  })
})

describe('espectrosPara', () => {
  it('sin tráfico (o sin dato) no hay espectros', () => {
    expect(espectrosPara(0)).toBe(0)
    expect(espectrosPara(-5)).toBe(0)
    expect(espectrosPara(Number.NaN)).toBe(0)
  })

  it('con poco tráfico hay al menos tres', () => {
    expect(espectrosPara(1)).toBe(3)
    expect(espectrosPara(40)).toBe(3)
  })

  it('crece en escala logarítmica y se topa en el máximo', () => {
    expect(espectrosPara(1_000)).toBe(6)
    expect(espectrosPara(5_000)).toBe(MAX_ESPECTROS)
    expect(espectrosPara(10_000_000)).toBe(MAX_ESPECTROS)
  })

  it('en móvil respeta su propio techo', () => {
    expect(espectrosPara(10_000, MAX_ESPECTROS_MOVIL)).toBe(MAX_ESPECTROS_MOVIL)
    expect(espectrosPara(10, 2)).toBe(2)
  })
})
