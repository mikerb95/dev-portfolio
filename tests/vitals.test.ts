import { describe, it, expect } from 'vitest'
import { p75, rateVital, formatVital } from '../src/lib/vitals'

describe('p75', () => {
  it('lista vacía devuelve null', () => {
    expect(p75([])).toBeNull()
  })

  it('un solo valor', () => {
    expect(p75([42])).toBe(42)
  })

  it('percentil 75 de 1..100', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(p75(vals)).toBe(75)
  })

  it('no depende del orden de entrada', () => {
    expect(p75([5, 1, 4, 2, 3])).toBe(p75([1, 2, 3, 4, 5]))
  })
})

describe('rateVital', () => {
  it('clasifica LCP según umbrales de Google', () => {
    expect(rateVital('LCP', 2000)).toBe('good')
    expect(rateVital('LCP', 2500)).toBe('good')
    expect(rateVital('LCP', 3000)).toBe('needs-improvement')
    expect(rateVital('LCP', 5000)).toBe('poor')
  })

  it('clasifica CLS (adimensional)', () => {
    expect(rateVital('CLS', 0.05)).toBe('good')
    expect(rateVital('CLS', 0.2)).toBe('needs-improvement')
    expect(rateVital('CLS', 0.3)).toBe('poor')
  })

  it('clasifica INP', () => {
    expect(rateVital('INP', 150)).toBe('good')
    expect(rateVital('INP', 400)).toBe('needs-improvement')
    expect(rateVital('INP', 600)).toBe('poor')
  })
})

describe('formatVital', () => {
  it('ms se redondea a entero', () => {
    expect(formatVital('LCP', 1234.5)).toBe('1235 ms')
  })
  it('CLS a dos decimales', () => {
    expect(formatVital('CLS', 0.0834)).toBe('0.08')
  })
})
