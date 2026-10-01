import { describe, expect, it } from 'vitest'
import { temporadaActual } from '../src/lib/temporada'

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
