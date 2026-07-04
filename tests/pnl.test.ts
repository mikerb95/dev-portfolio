import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { monthsSince, monthlyCostUSD, projectPnL } from '../src/lib/pnl'

describe('monthsSince', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sin fecha de inicio devuelve 1', () => {
    expect(monthsSince(null)).toBe(1)
    expect(monthsSince(undefined)).toBe(1)
  })

  it('mismo mes cuenta como 1', () => {
    vi.setSystemTime(new Date(2026, 6, 15)) // jul 2026
    expect(monthsSince(new Date(2026, 6, 1))).toBe(1)
  })

  it('cruza el límite de año correctamente', () => {
    vi.setSystemTime(new Date(2026, 0, 10)) // ene 2026
    expect(monthsSince(new Date(2025, 10, 1))).toBe(3) // nov, dic, ene
  })

  it('fechas futuras se acotan a mínimo 1', () => {
    vi.setSystemTime(new Date(2026, 0, 1))
    expect(monthsSince(new Date(2026, 5, 1))).toBe(1)
  })
})

describe('monthlyCostUSD', () => {
  const rates = { USD: 1, COP: 4000 }

  it('suma solo servicios activos y recurrentes, convertidos a USD', () => {
    const { total, sinTasa } = monthlyCostUSD(
      [
        { cost: 20, currency: 'USD', billingCycle: 'monthly', active: true },
        { cost: 120, currency: 'USD', billingCycle: 'annual', active: true }, // 10/mes
        { cost: 40_000, currency: 'COP', billingCycle: 'monthly', active: true }, // 10 USD
        { cost: 99, currency: 'USD', billingCycle: 'one_time', active: true }, // no recurrente
        { cost: 50, currency: 'USD', billingCycle: 'monthly', active: false }, // inactivo
      ],
      rates,
    )
    expect(total).toBe(40)
    expect(sinTasa).toBe(0)
  })

  it('cuenta (sin sumar) servicios cuya moneda no tiene tasa', () => {
    const { total, sinTasa } = monthlyCostUSD(
      [{ cost: 10, currency: 'EUR', billingCycle: 'monthly' }],
      rates,
    )
    expect(total).toBe(0)
    expect(sinTasa).toBe(1)
  })

  it('moneda ausente se asume USD', () => {
    const { total } = monthlyCostUSD([{ cost: 5, billingCycle: 'monthly' }], rates)
    expect(total).toBe(5)
  })
})

describe('projectPnL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 1)) // jul 2026
  })
  afterEach(() => vi.useRealTimers())

  it('separa cobrado/pendiente y calcula margen contra costo desde inicio', () => {
    const pnl = projectPnL(
      { startDate: new Date(2026, 3, 1) }, // abr → 4 meses (abr-jul)
      [
        { amount: 500, status: 'cobrado' },
        { amount: 300, status: 'cobrado' },
        { amount: 200, status: 'pendiente' },
        { amount: 999, status: 'proyectado' },
      ],
      [{ cost: 10, currency: 'USD', billingCycle: 'monthly', active: true }],
      { USD: 1 },
    )
    expect(pnl.ingresosCobrados).toBe(800)
    expect(pnl.ingresosPendientes).toBe(200)
    expect(pnl.costoMensualUSD).toBe(10)
    expect(pnl.costoAnualUSD).toBe(120)
    expect(pnl.costoDesdeInicioUSD).toBe(40)
    expect(pnl.margenEstimado).toBe(760)
    expect(pnl.costosSinTasa).toBe(0)
  })

  it('proyecto sin datos produce ceros coherentes', () => {
    const pnl = projectPnL({}, [], [], { USD: 1 })
    expect(pnl.ingresosCobrados).toBe(0)
    expect(pnl.margenEstimado).toBe(0)
  })
})
