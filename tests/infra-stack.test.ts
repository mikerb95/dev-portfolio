import { describe, it, expect } from 'vitest'
import {
  VERCEL, TURSO, CLAUDE, PROVEEDORES, ESCENARIOS, SELECCION_INICIAL,
  calcularProveedor, calcularStack, planRecomendado, planDe, escenarioPorId,
} from '../src/lib/infra-stack'
import { TARIFAS_INICIALES } from '../src/lib/computo/tarifas'

describe('catálogo', () => {
  it('cada plan declara cuota y excedente para TODAS las dimensiones de su proveedor', () => {
    // Una dimensión sin entrada se calcularía como cuota 0 y excedente gratis,
    // que es el error silencioso más caro posible en esta página.
    for (const p of PROVEEDORES) {
      for (const plan of p.planes) {
        for (const d of p.dimensiones) {
          expect(Object.prototype.hasOwnProperty.call(plan.incluido, d.id)).toBe(true)
          expect(Object.prototype.hasOwnProperty.call(plan.excedente, d.id)).toBe(true)
        }
      }
    }
  })

  it('los planes gratuitos no facturan excedente en ninguna dimensión', () => {
    for (const p of PROVEEDORES) {
      for (const plan of p.planes.filter((pl) => pl.baseUsd === 0 && Object.values(pl.excedente).some((v) => v == null))) {
        for (const d of p.dimensiones) expect(plan.excedente[d.id]).toBeNull()
      }
    }
  })

  it('los excedentes de Vercel Pro son los mismos que se le facturan al cliente', () => {
    const pro = planDe(VERCEL, 'pro')
    expect(pro.excedente.cpuActiva).toBe(TARIFAS_INICIALES.cpuActivaHora)
    expect(pro.excedente.transferencia).toBe(TARIFAS_INICIALES.transferenciaGb)
  })

  it('todos los escenarios cubren todos los proveedores', () => {
    for (const e of ESCENARIOS) {
      for (const p of PROVEEDORES) expect(e.uso[p.id]).toBeDefined()
    }
  })
})

describe('calcularProveedor', () => {
  it('cobra solo la base cuando el uso cabe en la cuota', () => {
    const r = calcularProveedor(VERCEL, 'pro', { cpuActiva: 2, transferencia: 500 })
    expect(r.excedentesUsd).toBe(0)
    expect(r.totalUsd).toBe(20)
    expect(r.topesDuros).toEqual([])
  })

  it('factura el excedente por unidad sobre la cuota, no sobre el total', () => {
    const r = calcularProveedor(VERCEL, 'pro', { transferencia: 1100 })
    const linea = r.lineas.find((l) => l.dimension === 'transferencia')!
    expect(linea.exceso).toBe(100)
    expect(linea.costoUsd).toBeCloseTo(100 * TARIFAS_INICIALES.transferenciaGb, 10)
    expect(r.totalUsd).toBeCloseTo(20 + 100 * TARIFAS_INICIALES.transferenciaGb, 10)
  })

  it('marca tope duro (y no cobra) cuando el plan gratuito se pasa', () => {
    const r = calcularProveedor(TURSO, 'free', { filasLeidas: 1500 })
    expect(r.totalUsd).toBe(0)
    expect(r.topesDuros).toEqual(['Filas leídas'])
    expect(r.lineas.find((l) => l.dimension === 'filasLeidas')!.topeDuro).toBe(true)
  })

  it('trata el uso ausente o negativo como cero', () => {
    const r = calcularProveedor(TURSO, 'scaler', { filasLeidas: -50 })
    expect(r.lineas.every((l) => l.uso === 0)).toBe(true)
    expect(r.totalUsd).toBe(29)
  })

  it('la API de Claude no tiene cargo fijo: paga solo tokens', () => {
    const r = calcularProveedor(CLAUDE, 'api-opus-5', { entrada: 10, salida: 2 })
    expect(r.baseUsd).toBe(0)
    expect(r.totalUsd).toBeCloseTo(10 * 5 + 2 * 25, 10)
  })

  it('la suscripción es plana: más uso no cambia la factura', () => {
    const poco = calcularProveedor(CLAUDE, 'pro', { entrada: 1, salida: 1 })
    const mucho = calcularProveedor(CLAUDE, 'pro', { entrada: 500, salida: 90 })
    expect(poco.totalUsd).toBe(20)
    expect(mucho.totalUsd).toBe(20)
  })

  it('cae al primer plan si el id no existe, en vez de reventar', () => {
    const r = calcularProveedor(VERCEL, 'inexistente', {})
    expect(r.planId).toBe(VERCEL.planes[0].id)
  })

  it('calcula el porcentaje de cuota consumida y lo deja en null si no hay cuota', () => {
    const r = calcularProveedor(VERCEL, 'pro', { transferencia: 250 })
    expect(r.lineas.find((l) => l.dimension === 'transferencia')!.consumoPct).toBeCloseTo(25, 10)
    const api = calcularProveedor(CLAUDE, 'api-opus-5', { entrada: 3 })
    expect(api.lineas.find((l) => l.dimension === 'entrada')!.consumoPct).toBeNull()
  })
})

describe('calcularStack', () => {
  it('suma los tres proveedores y proyecta el año', () => {
    const r = calcularStack({ vercel: 'pro', turso: 'scaler', claude: 'pro' }, {})
    expect(r.totalMensualUsd).toBe(20 + 29 + 20)
    expect(r.totalAnualUsd).toBe((20 + 29 + 20) * 12)
  })

  it('cuenta los topes duros de todo el stack', () => {
    const r = calcularStack(SELECCION_INICIAL, {
      vercel: { transferencia: 999, edgeRequests: 5 },
      turso: { filasLeidas: 5000 },
      claude: {},
    })
    expect(r.topesDuros).toBe(3)
    expect(r.totalMensualUsd).toBe(20) // la suscripción de Claude, nada más
  })

  it('el escenario de arranque cabe entero en los planes gratuitos', () => {
    const r = calcularStack(SELECCION_INICIAL, escenarioPorId('arranque').uso)
    expect(r.topesDuros).toBe(0)
  })

  it('el escenario de pico rompe el gratis: para eso existe', () => {
    const r = calcularStack(SELECCION_INICIAL, escenarioPorId('pico').uso)
    expect(r.topesDuros).toBeGreaterThan(0)
  })
})

describe('planRecomendado', () => {
  it('prefiere el gratuito mientras aguante', () => {
    expect(planRecomendado(TURSO, { filasLeidas: 100 }).planId).toBe('free')
  })

  it('sube de plan en cuanto el gratuito se rompe, aunque cueste más', () => {
    const r = planRecomendado(TURSO, { filasLeidas: 5000 })
    expect(r.planId).toBe('scaler')
    expect(r.totalUsd).toBe(29)
  })

  it('si ningún plan aguanta, devuelve el más barato en vez de nada', () => {
    const r = planRecomendado(CLAUDE, { entrada: 1, salida: 1 })
    expect(r).toBeDefined()
    expect(r.totalUsd).toBeGreaterThanOrEqual(0)
  })
})

describe('escenarioPorId', () => {
  it('cae al primero con un id desconocido', () => {
    expect(escenarioPorId('nope').id).toBe(ESCENARIOS[0].id)
    expect(escenarioPorId(null).id).toBe(ESCENARIOS[0].id)
  })
})
