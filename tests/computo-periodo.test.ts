import { describe, it, expect } from 'vitest'
import {
  clavePeriodo, esClaveValida, inicioISO, periodoAnterior,
  periodoCerrable, rangoPeriodo, ultimosPeriodos,
} from '../src/lib/computo/periodo'

describe('claves de periodo', () => {
  it('deriva el mes UTC de un instante', () => {
    expect(clavePeriodo(Date.parse('2026-09-07T12:00:00Z'))).toBe('2026-09')
  })

  it('usa UTC y no la hora local al decidir el mes', () => {
    // 31 de agosto a las 22:00 en Bogotá es el 1 de septiembre UTC. Si el
    // cierre mezclara zonas, cinco horas de consumo saltarían de factura.
    expect(clavePeriodo(Date.parse('2026-09-01T03:00:00Z'))).toBe('2026-09')
  })

  it('valida la forma de la clave', () => {
    expect(esClaveValida('2026-09')).toBe(true)
    expect(esClaveValida('2026-13')).toBe(false)
    expect(esClaveValida('2026-00')).toBe(false)
    expect(esClaveValida('2026-9')).toBe(false)
    expect(esClaveValida('septiembre')).toBe(false)
  })
})

describe('rango del periodo', () => {
  it('es semiabierto y cubre el mes completo', () => {
    const { desde, hasta } = rangoPeriodo('2026-09')
    expect(new Date(desde).toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(new Date(hasta).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('cruza el fin de año sin caso especial', () => {
    const { hasta } = rangoPeriodo('2026-12')
    expect(new Date(hasta).toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(periodoAnterior('2026-01')).toBe('2025-12')
  })

  it('cubre febrero de año bisiesto', () => {
    const { desde, hasta } = rangoPeriodo('2028-02')
    expect((hasta - desde) / 86_400_000).toBe(29)
  })

  it('inicioISO da la fecha con la que se consultan las tarifas vigentes', () => {
    expect(inicioISO('2026-09')).toBe('2026-09-01')
  })
})

describe('cerrabilidad', () => {
  it('un periodo en curso no es cerrable', () => {
    expect(periodoCerrable('2026-09', Date.parse('2026-09-15T00:00:00Z'))).toBe(false)
  })

  it('lo es en cuanto empieza el siguiente', () => {
    expect(periodoCerrable('2026-09', Date.parse('2026-10-01T00:00:00Z'))).toBe(true)
    expect(periodoCerrable('2026-08', Date.parse('2026-09-07T00:00:00Z'))).toBe(true)
  })
})

describe('serie de periodos', () => {
  it('devuelve del más viejo al más nuevo, terminando en el actual', () => {
    expect(ultimosPeriodos(Date.parse('2026-02-10T00:00:00Z'), 4))
      .toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})
