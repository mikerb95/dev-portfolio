import { describe, it, expect } from 'vitest'
import {
  resumenMensual, proyeccion, caeEnMes, sumarMeses, periodoActual, finDePeriodo,
  type ServicioFila, type FijoFila, type GastoFila, type EntradaResumen,
} from '../src/lib/resumen-mensual'
import { normalizarFijo, normalizarGasto } from '../src/lib/vida'

const rates = { USD: 1, COP: 4000 }

const servicio = (o: Partial<ServicioFila>): ServicioFila => ({
  id: 1, name: 'svc', category: 'hosting', provider: null, cost: 10, currency: 'USD',
  billingCycle: 'monthly', renewalDate: null, active: true, payer: 'me', createdAt: null, ...o,
})
const fijo = (o: Partial<FijoFila>): FijoFila => ({
  id: 1, name: 'Arriendo', category: 'vivienda', amount: 2_000_000, currency: 'COP',
  cycle: 'monthly', anchorMonth: null, dueDay: 5, active: true, createdAt: null, ...o,
})
const gasto = (o: Partial<GastoFila>): GastoFila => ({
  id: 1, periodo: '2026-09', livingCostId: null, category: 'alimentacion', description: 'Mercado',
  amount: 400_000, currency: 'COP', spentOn: '2026-09-10', ...o,
})
const entrada = (o: Partial<EntradaResumen>): EntradaResumen => ({ servicios: [], fijos: [], gastos: [], rates, ...o })

describe('periodos', () => {
  it('suma meses cruzando el año en ambos sentidos', () => {
    expect(sumarMeses('2026-11', 3)).toBe('2027-02')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarMeses('2026-09', 0)).toBe('2026-09')
  })

  it('el mes en curso es el de Colombia, no el de UTC', () => {
    // 30 sep 22:00 en Bogotá ya es 1 oct en UTC
    expect(periodoActual(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09')
  })

  it('el fin del periodo es la medianoche colombiana del mes siguiente', () => {
    expect(finDePeriodo('2026-12').toISOString()).toBe('2027-01-01T05:00:00.000Z')
  })

  it('caeEnMes respeta el ciclo y el ancla', () => {
    expect(caeEnMes(1, 7, 3)).toBe(true)
    expect(caeEnMes(12, 3, 3)).toBe(true)
    expect(caeEnMes(12, 3, 4)).toBe(false)
    expect(caeEnMes(3, 11, 2)).toBe(true) // 11 → 2 → 5 → 8
    expect(caeEnMes(2, 1, 12)).toBe(false)
    expect(caeEnMes(2, 1, 11)).toBe(true)
  })
})

describe('infraestructura y suscripciones', () => {
  it('un anual aparece completo solo en su mes de renovación', () => {
    const e = entrada({ servicios: [servicio({ cost: 120, billingCycle: 'annual', renewalDate: new Date('2027-03-15') })] })
    expect(resumenMensual('2026-03', e).infra.totalUSD).toBe(120)
    expect(resumenMensual('2026-04', e).infra.totalUSD).toBe(0)
    // El promedio sí se reporta todos los meses, como referencia
    expect(resumenMensual('2026-04', e).infra.equivalenteMensualUSD).toBe(10)
  })

  it('una renovación el día 1 no se corre al mes anterior', () => {
    // Así la guarda normalizeServiceInput: new Date('YYYY-MM-DD') = medianoche UTC
    const e = entrada({ servicios: [servicio({ billingCycle: 'annual', cost: 50, renewalDate: new Date('2026-03-01') })] })
    expect(resumenMensual('2026-03', e).infra.totalUSD).toBe(50)
    expect(resumenMensual('2026-02', e).infra.totalUSD).toBe(0)
  })

  it('un anual sin fecha se prorratea y queda marcado para corregirlo', () => {
    const r = resumenMensual('2026-09', entrada({ servicios: [servicio({ cost: 120, billingCycle: 'annual' })] }))
    expect(r.infra.totalUSD).toBe(10)
    expect(r.infra.lineas[0].motivo).toBe('sin_fecha')
  })

  it('el pago único cae solo en su mes exacto, no cada año', () => {
    const e = entrada({ servicios: [servicio({ cost: 80, billingCycle: 'one_time', renewalDate: new Date('2026-09-20') })] })
    expect(resumenMensual('2026-09', e).infra.totalUSD).toBe(80)
    expect(resumenMensual('2027-09', e).infra.totalUSD).toBe(0)
  })

  it('separa las suscripciones de la infraestructura', () => {
    const r = resumenMensual('2026-09', entrada({
      servicios: [servicio({ id: 1, cost: 20 }), servicio({ id: 2, category: 'subscription', cost: 100 })],
    }))
    expect(r.infra.totalUSD).toBe(20)
    expect(r.suscripciones.totalUSD).toBe(100)
    expect(r.totalUSD).toBe(120)
  })

  it('excluye inactivos, gratis y lo que paga el cliente directo; lo reembolsable cuenta y se marca', () => {
    const r = resumenMensual('2026-09', entrada({
      servicios: [
        servicio({ id: 1, active: false }),
        servicio({ id: 2, billingCycle: 'free', cost: null }),
        servicio({ id: 3, payer: 'client_direct' }),
        servicio({ id: 4, payer: 'client_reimbursable', cost: 15 }),
      ],
    }))
    expect(r.infra.lineas.map((l) => l.id)).toEqual([4])
    expect(r.infra.totalUSD).toBe(15)
    expect(r.infra.reembolsableUSD).toBe(15)
  })

  it('no cobra un servicio en meses anteriores a su alta', () => {
    const e = entrada({ servicios: [servicio({ createdAt: new Date('2026-09-10T12:00:00Z') })] })
    expect(resumenMensual('2026-08', e).infra.totalUSD).toBe(0)
    expect(resumenMensual('2026-09', e).infra.totalUSD).toBe(10)
  })

  it('convierte a USD y reporta las monedas sin tasa sin sumarlas', () => {
    const r = resumenMensual('2026-09', entrada({
      servicios: [servicio({ id: 1, cost: 40_000, currency: 'COP' }), servicio({ id: 2, cost: 5, currency: 'EUR' })],
    }))
    expect(r.infra.totalUSD).toBe(10)
    expect(r.monedasSinTasa).toEqual(['EUR'])
    expect(r.infra.lineas.find((l) => l.id === 2)?.montoUSD).toBeNull()
  })
})

describe('costos de vida', () => {
  it('un fijo sin pago registrado queda pendiente por su presupuesto', () => {
    const v = resumenMensual('2026-09', entrada({ fijos: [fijo({})] })).vida
    expect(v.fijos[0].estado).toBe('pendiente')
    expect(v.presupuestoUSD).toBe(500)
    expect(v.pendienteUSD).toBe(500)
    expect(v.realUSD).toBe(0)
    expect(v.totalUSD).toBe(500)
  })

  it('un fijo pagado cuenta por lo real, no por el presupuesto', () => {
    const v = resumenMensual('2026-09', entrada({
      fijos: [fijo({ id: 7, category: 'servicios', amount: 200_000 })],
      gastos: [gasto({ livingCostId: 7, category: 'servicios', amount: 240_000 })],
    })).vida
    expect(v.fijos[0]).toMatchObject({ estado: 'pagado', realUSD: 60, presupuestoUSD: 50 })
    expect(v.pendienteUSD).toBe(0)
    expect(v.totalUSD).toBe(60)
    // El pago del fijo no se duplica como gasto variable
    expect(v.variables).toHaveLength(0)
  })

  it('suma los variables del periodo y compara por categoría', () => {
    const v = resumenMensual('2026-09', entrada({
      fijos: [fijo({ id: 1 })],
      gastos: [gasto({ id: 1 }), gasto({ id: 2, amount: 200_000 }), gasto({ id: 3, periodo: '2026-08' })],
    })).vida
    expect(v.variables.map((g) => g.id)).toEqual([2, 1])
    expect(v.realUSD).toBe(150)
    expect(v.totalUSD).toBe(650) // 500 pendiente + 150 real
    expect(v.porCategoria).toEqual([
      { categoria: 'vivienda', presupuestoUSD: 500, realUSD: 0 },
      { categoria: 'alimentacion', presupuestoUSD: 0, realUSD: 150 },
    ])
  })

  it('un bimestral solo cae en sus meses, y su pago fuera de mes cuenta igual', () => {
    const f = fijo({ id: 3, category: 'servicios', cycle: 'bimonthly', anchorMonth: 1, amount: 80_000 })
    expect(resumenMensual('2026-09', entrada({ fijos: [f] })).vida.fijos).toHaveLength(1)
    const oct = resumenMensual('2026-10', entrada({
      fijos: [f],
      gastos: [gasto({ periodo: '2026-10', livingCostId: 3, category: 'servicios', amount: 80_000 })],
    })).vida
    expect(oct.fijos).toHaveLength(0)
    expect(oct.variables).toHaveLength(1)
    expect(oct.realUSD).toBe(20)
    expect(oct.equivalenteMensualUSD).toBe(10)
  })

  it('un no mensual sin mes ancla se omite en vez de cobrarse cada mes', () => {
    const v = resumenMensual('2026-09', entrada({ fijos: [fijo({ cycle: 'annual', anchorMonth: null })] })).vida
    expect(v.fijos).toHaveLength(0)
  })
})

describe('proyeccion', () => {
  it('marca los meses pesados por renovaciones', () => {
    const e = entrada({
      servicios: [servicio({ cost: 10 }), servicio({ id: 2, cost: 100, billingCycle: 'annual', renewalDate: new Date('2026-11-01') })],
      fijos: [fijo({ amount: 400_000 })],
    })
    const p = proyeccion('2026-09', 4, e)
    expect(p.map((m) => m.periodo)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'])
    expect(p.map((m) => m.totalUSD)).toEqual([110, 110, 210, 110])
  })
})

describe('validación de entrada', () => {
  it('normalizarFijo exige mes ancla a los ciclos no mensuales', () => {
    expect(normalizarFijo({ name: 'SOAT', category: 'seguros', amount: 900000, cycle: 'annual' }).ok).toBe(false)
    const r = normalizarFijo({ name: 'SOAT', category: 'seguros', amount: '900000', cycle: 'annual', anchorMonth: '4' })
    expect(r).toMatchObject({ ok: true, value: { anchorMonth: 4, currency: 'COP', active: true } })
  })

  it('normalizarFijo descarta el ancla de los mensuales y rechaza negativos y categorías inventadas', () => {
    expect(normalizarFijo({ name: 'x', category: 'vivienda', amount: 1, anchorMonth: 3 })).toMatchObject({ ok: true, value: { anchorMonth: null } })
    expect(normalizarFijo({ name: 'x', category: 'vivienda', amount: -1 }).ok).toBe(false)
    expect(normalizarFijo({ name: 'x', category: 'lujos', amount: 1 }).ok).toBe(false)
    expect(normalizarFijo({ name: '  ', category: 'vivienda', amount: 1 }).ok).toBe(false)
  })

  it('normalizarGasto valida periodo y fecha', () => {
    expect(normalizarGasto({ periodo: '2026-13', description: 'x', category: 'ocio', amount: 1 }).ok).toBe(false)
    const r = normalizarGasto({ periodo: '2026-09', description: 'Cine', category: 'ocio', amount: '30000', spentOn: 'ayer', currency: 'XYZ' })
    expect(r).toMatchObject({ ok: true, value: { spentOn: null, currency: 'COP', livingCostId: null, amount: 30000 } })
  })
})
