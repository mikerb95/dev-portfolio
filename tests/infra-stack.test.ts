import { describe, it, expect } from 'vitest'
import {
  VERCEL, TURSO, CLAUDE, WORKSPACE, PROVEEDORES, ESCENARIOS, SELECCION_INICIAL,
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

  it('la selección inicial es la tarifa más baja de cada proveedor', () => {
    // La página abre con lo más barato a propósito: es el punto de partida real
    // y el que muestra dónde se rompe el gratis. Si alguien añade un plan aún
    // más barato y no mueve el default, este test lo dice.
    for (const p of PROVEEDORES) {
      const elegido = planDe(p, SELECCION_INICIAL[p.id])
      const minimo = Math.min(...p.planes.map((pl) => pl.baseUsd))
      expect(SELECCION_INICIAL[p.id]).toBeDefined()
      expect(elegido.baseUsd).toBe(minimo)
    }
  })

  it('todos los escenarios cubren todos los proveedores', () => {
    for (const e of ESCENARIOS) {
      for (const p of PROVEEDORES) expect(e.uso[p.id]).toBeDefined()
    }
  })
})

describe('calcularProveedor', () => {
  it('no cobra nada cuando el uso cabe en la cuota incluida', () => {
    const r = calcularProveedor(VERCEL, 'hobby', { cpuActiva: 2, transferencia: 50 })
    expect(r.excedentesUsd).toBe(0)
    expect(r.totalUsd).toBe(0)
    expect(r.topesDuros).toEqual([])
  })

  it('factura el excedente por unidad sobre la cuota, no sobre el total', () => {
    const r = calcularProveedor(TURSO, 'scaler', { filasEscritas: 120 })
    const linea = r.lineas.find((l) => l.dimension === 'filasEscritas')!
    expect(linea.exceso).toBe(20)
    expect(linea.costoUsd).toBeCloseTo(20 * 0.8, 10)
    expect(r.totalUsd).toBeCloseTo(24.92 + 20 * 0.8, 10)
  })

  it('el Pro de Vercel no tiene cuota por recurso: gasta crédito y luego cobra', () => {
    // 100 GB de transferencia son 15 dólares, que caben en el crédito de 20:
    // se paga la suscripción y nada más. Con el modelo viejo (cuotas por
    // recurso) esos 100 GB salían gratis por estar "incluidos", que era falso.
    const dentro = calcularProveedor(VERCEL, 'pro', { transferencia: 100 })
    expect(dentro.excedentesUsd).toBeCloseTo(15, 10)
    expect(dentro.creditoAplicadoUsd).toBeCloseTo(15, 10)
    expect(dentro.totalUsd).toBe(20)

    // 200 GB son 30: el crédito cubre 20 y los otros 10 se facturan.
    const fuera = calcularProveedor(VERCEL, 'pro', { transferencia: 200 })
    expect(fuera.creditoAplicadoUsd).toBe(20)
    expect(fuera.totalUsd).toBeCloseTo(30, 10)
  })

  it('el crédito no se convierte en saldo a favor si no se gasta', () => {
    const r = calcularProveedor(VERCEL, 'pro', {})
    expect(r.creditoAplicadoUsd).toBe(0)
    expect(r.totalUsd).toBe(20)
  })

  it('un plan sin crédito declarado no descuenta nada', () => {
    const r = calcularProveedor(TURSO, 'scaler', {})
    expect(r.creditoUsd).toBe(0)
    expect(r.creditoAplicadoUsd).toBe(0)
  })

  it('marca tope duro (y no cobra) cuando el plan gratuito se pasa', () => {
    const r = calcularProveedor(TURSO, 'free', { filasLeidas: 1.5 })
    expect(r.totalUsd).toBe(0)
    expect(r.topesDuros).toEqual(['Filas leídas'])
    expect(r.lineas.find((l) => l.dimension === 'filasLeidas')!.topeDuro).toBe(true)
  })

  it('trata el uso ausente o negativo como cero', () => {
    const r = calcularProveedor(TURSO, 'scaler', { filasLeidas: -50 })
    expect(r.lineas.every((l) => l.uso === 0)).toBe(true)
    expect(r.totalUsd).toBe(24.92)
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
    const r = calcularProveedor(VERCEL, 'hobby', { transferencia: 25 })
    expect(r.lineas.find((l) => l.dimension === 'transferencia')!.consumoPct).toBeCloseTo(25, 10)
    const api = calcularProveedor(CLAUDE, 'api-opus-5', { entrada: 3 })
    expect(api.lineas.find((l) => l.dimension === 'entrada')!.consumoPct).toBeNull()
  })
})

describe('Google Workspace (precio por asiento)', () => {
  it('cobra por buzón sin cargo fijo', () => {
    const r = calcularProveedor(WORKSPACE, 'starter', { usuarios: 3 })
    expect(r.baseUsd).toBe(0)
    expect(r.totalUsd).toBeCloseTo(21.9, 10)
    expect(r.topesDuros).toEqual([])
  })

  it('sin buzones no cuesta nada', () => {
    expect(calcularProveedor(WORKSPACE, 'starter', { usuarios: 0 }).totalUsd).toBe(0)
  })

  it('Standard cuesta el doble por el mismo número de buzones', () => {
    const starter = calcularProveedor(WORKSPACE, 'starter', { usuarios: 4 })
    const standard = calcularProveedor(WORKSPACE, 'standard', { usuarios: 4 })
    expect(standard.totalUsd).toBe(starter.totalUsd * 2)
  })

  it('recomienda el Starter: por asiento nunca hay tope duro que fuerce a subir', () => {
    expect(planRecomendado(WORKSPACE, { usuarios: 25 }).planId).toBe('starter')
  })
})

describe('calcularStack', () => {
  it('suma los cuatro proveedores y proyecta el año', () => {
    const r = calcularStack(
      { vercel: 'pro', turso: 'scaler', claude: 'pro', workspace: 'starter' },
      { workspace: { usuarios: 1 } },
    )
    expect(r.totalMensualUsd).toBeCloseTo(20 + 24.92 + 20 + 7.3, 10)
    expect(r.totalAnualUsd).toBeCloseTo((20 + 24.92 + 20 + 7.3) * 12, 10)
  })

  it('cuenta los topes duros de todo el stack', () => {
    const r = calcularStack(SELECCION_INICIAL, {
      vercel: { transferencia: 999, edgeRequests: 5 },
      turso: { filasLeidas: 5 },
      claude: {},
      workspace: { usuarios: 1 },
    })
    expect(r.topesDuros).toBe(3)
    expect(r.totalMensualUsd).toBeCloseTo(7.3, 10) // solo el buzón: lo demás es gratis o se corta
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
    expect(planRecomendado(TURSO, { filasLeidas: 0.1 }).planId).toBe('free')
  })

  it('sube al siguiente escalón, no al primero que aguante de sobra', () => {
    // 3 mil millones de lecturas rompen el Free (500 M) y caben casi enteras en
    // el Developer: 4,99 + medio mil millones a dólar es más barato que los
    // 24,92 del Scaler, así que el recomendado es el de en medio.
    const r = planRecomendado(TURSO, { filasLeidas: 3 })
    expect(r.planId).toBe('developer')
    expect(r.totalUsd).toBeCloseTo(4.99 + 0.5, 10)
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
