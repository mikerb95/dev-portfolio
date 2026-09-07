import { describe, it, expect } from 'vitest'
import {
  calcularCobro,
  factorDesdeFactura,
  sumarUso,
  usoDesdeEstimacion,
  usoVacio,
  FACTOR_MAX,
  FACTOR_MIN,
  type TarifasComputo,
  type UsoComputo,
} from '../src/lib/computo/calculo'
import { TARIFAS_INICIALES, tarifasVigentes, type FilaTarifas } from '../src/lib/computo/tarifas'

// Tarifas de prueba con números redondos: si el test usara las reales, cada
// cambio de precio de Vercel rompería tests que no tienen nada que ver con el
// precio, y el fallo no diría si la aritmética se rompió o solo la tarifa.
const TARIFAS: TarifasComputo = {
  cpuActivaHora: 1,
  memoriaGbHora: 1,
  invocacionesMillon: 1,
  transferenciaGb: 1,
  transferenciaOrigenGb: 1,
  edgeRequestsMillon: 1,
}

const HORA_MS = 3_600_000
const GB = 1_073_741_824

describe('conversión a unidades de facturación', () => {
  it('convierte cada dimensión a su unidad y aplica su tarifa', () => {
    const uso: UsoComputo = {
      cpuMs: 2 * HORA_MS,
      gbMs: 3 * HORA_MS,
      invocaciones: 4_000_000,
      transferenciaBytes: 5 * GB,
      transferenciaOrigenBytes: 6 * GB,
      edgeRequests: 7_000_000,
    }
    const cobro = calcularCobro(uso, TARIFAS, { margenPct: 0 })
    const por = Object.fromEntries(cobro.lineas.map((l) => [l.dimension, l]))

    expect(por.cpuActiva.cantidad).toBeCloseTo(2)
    expect(por.memoria.cantidad).toBeCloseTo(3)
    expect(por.invocaciones.cantidad).toBeCloseTo(4)
    expect(por.transferencia.cantidad).toBeCloseTo(5)
    expect(por.transferenciaOrigen.cantidad).toBeCloseTo(6)
    expect(por.edgeRequests.cantidad).toBeCloseTo(7)
    // Con todas las tarifas a 1, el costo es la suma de las cantidades.
    expect(cobro.costoUsd).toBeCloseTo(27)
  })

  it('cobra la memoria por tiempo de pared, no por CPU activa', () => {
    // El caso que motiva medir gbMs aparte: un handler que espera 900 ms a la
    // base de datos y solo gasta 10 ms de CPU. Si la memoria se derivara de la
    // CPU, este proyecto se facturaría 90 veces por debajo de lo que cuesta.
    const uso = usoDesdeEstimacion({
      invocacionesMes: 3_600,
      cpuMsPorInvocacion: 10,
      duracionMsPorInvocacion: 1_000,
      memoriaMb: 1024,
      kbPorRespuesta: 0,
      edgePorInvocacion: 1,
    })
    expect(uso.cpuMs).toBe(36_000)
    expect(uso.gbMs).toBe(3_600_000)
    const cobro = calcularCobro(uso, TARIFAS, { margenPct: 0 })
    const por = Object.fromEntries(cobro.lineas.map((l) => [l.dimension, l]))
    expect(por.memoria.costoUsd).toBeGreaterThan(por.cpuActiva.costoUsd * 50)
  })
})

describe('cuota incluida', () => {
  const uso: UsoComputo = { ...usoVacio(), cpuMs: 10 * HORA_MS, invocaciones: 2_000_000 }

  it('descuenta la cuota antes de aplicar la tarifa', () => {
    const cobro = calcularCobro(uso, TARIFAS, {
      margenPct: 0,
      incluido: { cpuMs: 4 * HORA_MS },
    })
    const cpu = cobro.lineas.find((l) => l.dimension === 'cpuActiva')!
    expect(cpu.cantidad).toBeCloseTo(10)
    expect(cpu.incluido).toBeCloseTo(4)
    expect(cpu.facturable).toBeCloseTo(6)
    expect(cpu.costoUsd).toBeCloseTo(6)
  })

  it('nunca genera facturable negativo cuando la cuota supera el consumo', () => {
    const cobro = calcularCobro(uso, TARIFAS, {
      margenPct: 0,
      incluido: { cpuMs: 999 * HORA_MS },
    })
    const cpu = cobro.lineas.find((l) => l.dimension === 'cpuActiva')!
    expect(cpu.facturable).toBe(0)
    expect(cpu.costoUsd).toBe(0)
    // Y el descuento reportado se topa en lo consumido: decirle al cliente que
    // se le regalaron 999 horas cuando solo usó 10 es una factura mentirosa.
    expect(cpu.incluido).toBeCloseTo(10)
  })
})

describe('margen, mínimo y reconciliación', () => {
  const uso: UsoComputo = { ...usoVacio(), cpuMs: 100 * HORA_MS }

  it('aplica el margen sobre el costo ya reconciliado', () => {
    const cobro = calcularCobro(uso, TARIFAS, { margenPct: 30, factorReconciliacion: 1.5 })
    expect(cobro.costoMedidoUsd).toBeCloseTo(100)
    expect(cobro.costoUsd).toBeCloseTo(150)
    expect(cobro.totalUsd).toBeCloseTo(195)
    expect(cobro.margenUsd).toBeCloseTo(45)
  })

  it('sin factor no altera el costo medido', () => {
    const cobro = calcularCobro(uso, TARIFAS, { margenPct: 0 })
    expect(cobro.factorReconciliacion).toBe(1)
    expect(cobro.costoUsd).toBeCloseTo(cobro.costoMedidoUsd)
  })

  it('el mínimo pactado gana cuando el consumo queda por debajo', () => {
    const cobro = calcularCobro({ cpuMs: HORA_MS }, TARIFAS, { margenPct: 30, minimoUsd: 25 })
    expect(cobro.totalUsd).toBe(25)
    expect(cobro.aplicoMinimo).toBe(true)
    // El margen sigue cuadrando: total menos costo, sea cual sea el origen del
    // total. Así la línea de P&L nunca depende de qué rama fijó el precio.
    expect(cobro.costoUsd + cobro.margenUsd).toBeCloseTo(cobro.totalUsd)
  })

  it('el mínimo no se aplica cuando el consumo lo supera', () => {
    const cobro = calcularCobro(uso, TARIFAS, { margenPct: 30, minimoUsd: 25 })
    expect(cobro.aplicoMinimo).toBe(false)
    expect(cobro.totalUsd).toBeCloseTo(130)
  })
})

describe('factor de reconciliación desde la factura real', () => {
  it('lo calcula cuando ambos valores son positivos', () => {
    expect(factorDesdeFactura(80, 100)).toBeCloseTo(1.25)
  })

  it('rechaza entradas sin sentido en vez de devolver Infinity o 0', () => {
    expect(factorDesdeFactura(0, 100)).toBeNull()
    expect(factorDesdeFactura(100, 0)).toBeNull()
    expect(factorDesdeFactura(-5, 100)).toBeNull()
  })

  it('descarta factores fuera de rango: son datos malos, no sesgo de medición', () => {
    // Telemetría caída media semana daría un factor enorme; arrastrarlo al mes
    // siguiente inflaría una factura real.
    expect(factorDesdeFactura(1, 100)).toBeNull()
    expect(factorDesdeFactura(100, 1)).toBeNull()
    expect(factorDesdeFactura(100, 100 * FACTOR_MAX)).toBeCloseTo(FACTOR_MAX)
    expect(factorDesdeFactura(100, 100 * FACTOR_MIN)).toBeCloseTo(FACTOR_MIN)
  })
})

describe('robustez de las entradas', () => {
  it('trata NaN, negativos y ausencias como cero', () => {
    const cobro = calcularCobro(
      { cpuMs: Number.NaN, gbMs: -5, invocaciones: undefined as unknown as number },
      TARIFAS,
      { margenPct: 0 },
    )
    expect(cobro.costoUsd).toBe(0)
    expect(cobro.lineas.every((l) => Number.isFinite(l.costoUsd))).toBe(true)
  })

  it('sumarUso no muta las entradas', () => {
    const a: Partial<UsoComputo> = { cpuMs: 10 }
    const b: Partial<UsoComputo> = { cpuMs: 5 }
    expect(sumarUso(a, b).cpuMs).toBe(15)
    expect(a.cpuMs).toBe(10)
  })
})

describe('tarifas vigentes por fecha', () => {
  const filas: FilaTarifas[] = [
    { ...TARIFAS, vigenteDesde: '2026-01-01' },
    { ...TARIFAS, cpuActivaHora: 2, vigenteDesde: '2026-06-01' },
  ]

  it('elige la vigencia más reciente que no sea posterior a la fecha', () => {
    expect(tarifasVigentes(filas, '2026-05-31').cpuActivaHora).toBe(1)
    expect(tarifasVigentes(filas, '2026-06-01').cpuActivaHora).toBe(2)
    expect(tarifasVigentes(filas, '2026-12-31').cpuActivaHora).toBe(2)
  })

  it('un periodo anterior a toda vigencia cae a las iniciales, no a null', () => {
    expect(tarifasVigentes(filas, '2025-01-01')).toEqual(TARIFAS_INICIALES)
    expect(tarifasVigentes([], '2026-09-01')).toEqual(TARIFAS_INICIALES)
  })

  it('recalcular un periodo cerrado da el mismo número aunque suba el precio', () => {
    const uso: UsoComputo = { ...usoVacio(), cpuMs: 10 * HORA_MS }
    const marzo = calcularCobro(uso, tarifasVigentes(filas, '2026-03-15'), { margenPct: 0 })
    const conSubida = calcularCobro(uso, tarifasVigentes(filas, '2026-03-15'), { margenPct: 0 })
    expect(marzo.costoUsd).toBeCloseTo(10)
    expect(conSubida.costoUsd).toBeCloseTo(marzo.costoUsd)
  })
})
