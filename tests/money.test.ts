import { describe, it, expect } from 'vitest'
import {
  parseRates,
  toBaseUSD,
  monthlyEquivalent,
  annualEquivalent,
  fmtMoney,
  fmtUSD,
} from '../src/lib/money'

describe('parseRates', () => {
  it('siempre incluye USD = 1', () => {
    expect(parseRates([])).toEqual({ USD: 1 })
  })

  it('parsea claves fx_<CUR>_per_USD válidas', () => {
    const rates = parseRates([
      { key: 'fx_COP_per_USD', value: '4100' },
      { key: 'fx_EUR_per_USD', value: '0.92' },
    ])
    expect(rates).toEqual({ USD: 1, COP: 4100, EUR: 0.92 })
  })

  it('ignora claves ajenas, valores nulos, no numéricos, cero y negativos', () => {
    const rates = parseRates([
      { key: 'theme', value: 'dark' },
      { key: 'fx_COP_per_USD', value: null },
      { key: 'fx_MXN_per_USD', value: 'abc' },
      { key: 'fx_ARS_per_USD', value: '0' },
      { key: 'fx_BRL_per_USD', value: '-5' },
      { key: 'fx_cop_per_USD', value: '4100' }, // minúsculas: no matchea
    ])
    expect(rates).toEqual({ USD: 1 })
  })
})

describe('toBaseUSD', () => {
  const rates = { USD: 1, COP: 4000 }

  it('USD pasa directo sin tasa', () => {
    expect(toBaseUSD(150, 'USD', {})).toBe(150)
  })

  it('convierte dividiendo por la tasa', () => {
    expect(toBaseUSD(40_000, 'COP', rates)).toBe(10)
  })

  it('devuelve null si no hay tasa para la moneda', () => {
    expect(toBaseUSD(100, 'EUR', rates)).toBeNull()
  })

  it('devuelve null para montos no finitos', () => {
    expect(toBaseUSD(NaN, 'USD', rates)).toBeNull()
    expect(toBaseUSD(Infinity, 'COP', rates)).toBeNull()
  })
})

describe('monthlyEquivalent / annualEquivalent', () => {
  it('mensual se mantiene, trimestral /3, anual /12', () => {
    expect(monthlyEquivalent(30, 'monthly')).toBe(30)
    expect(monthlyEquivalent(30, 'quarterly')).toBe(10)
    expect(monthlyEquivalent(120, 'annual')).toBe(10)
  })

  it('one_time, usage, free y ciclos desconocidos no son recurrentes', () => {
    expect(monthlyEquivalent(100, 'one_time')).toBe(0)
    expect(monthlyEquivalent(100, 'usage')).toBe(0)
    expect(monthlyEquivalent(100, 'free')).toBe(0)
    expect(monthlyEquivalent(100, null)).toBe(0)
  })

  it('costo nulo o no finito es 0', () => {
    expect(monthlyEquivalent(null, 'monthly')).toBe(0)
    expect(monthlyEquivalent(undefined, 'monthly')).toBe(0)
    expect(monthlyEquivalent(NaN, 'monthly')).toBe(0)
  })

  it('annualEquivalent = mensual × 12', () => {
    expect(annualEquivalent(10, 'monthly')).toBe(120)
    expect(annualEquivalent(120, 'annual')).toBe(120)
  })
})

describe('formato de moneda', () => {
  it('fmtMoney formatea en es-CO con símbolo de la moneda', () => {
    const s = fmtMoney(1234.5, 'USD', 2)
    expect(s).toContain('1.234,5')
    expect(s).toMatch(/US\$|USD/)
  })

  it('fmtUSD sin decimales para KPIs', () => {
    expect(fmtUSD(1000)).not.toContain(',00')
  })
})
