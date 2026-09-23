import { describe, it, expect } from 'vitest'
import {
  CUOTA_HOBBY, COTA_INFERIOR, OBSERVACION_MIN_MS, decidirAvisos, estadoCuota, lineaAviso, mensajeAvisos, parseAvisos,
  type ConsumoMedido, type EstadoAvisos,
} from '../src/lib/computo/cuota'
import { ASIENTO_PRO_USD, PLANTILLAS, cotizar, usoDesdeVisitas } from '../src/lib/computo/cotizador'
import { DIMENSIONES, usoVacio, type UsoComputo } from '../src/lib/computo/calculo'
import { VERCEL } from '../src/lib/infra-stack'

const DIA = 86_400_000
const HORA_MS = 3_600_000
const SEP_1 = Date.UTC(2026, 8, 1)
const OCT_1 = Date.UTC(2026, 9, 1)

/** Memoria en GB-ms para N GB-h: la unidad pequeña que guarda la base. */
const gbh = (n: number) => n * HORA_MS
const uso = (u: Partial<UsoComputo>): UsoComputo => ({ ...usoVacio(), ...u })
const medido = (projectId: number, nombre: string, u: Partial<UsoComputo>, desde = SEP_1): ConsumoMedido =>
  ({ projectId, nombre, uso: uso(u), desde })

describe('cuota Hobby', () => {
  it('sale del catálogo de infra-stack y cubre todas las dimensiones', () => {
    const hobby = VERCEL.planes.find((p) => p.id === 'hobby')!
    for (const d of DIMENSIONES) {
      expect(CUOTA_HOBBY[d]).toBeGreaterThan(0)
      expect(CUOTA_HOBBY[d]).toBe(hobby.incluido[d])
    }
  })

  it('marca como cota inferior lo que el medidor no ve entero', () => {
    expect([...COTA_INFERIOR].sort()).toEqual(['edgeRequests', 'transferencia'])
  })
})

describe('estadoCuota', () => {
  it('suma los proyectos contra una sola bolsa y reparte por proyecto', () => {
    const ahora = SEP_1 + 10 * DIA
    const e = estadoCuota([
      medido(1, 'Acme', { gbMs: gbh(90) }),
      medido(2, 'Globex', { gbMs: gbh(30) }),
    ], ahora)
    const mem = e.dimensiones.find((d) => d.dimension === 'memoria')!
    expect(mem.consumido).toBe(120)
    expect(mem.pct).toBeCloseTo((120 / 360) * 100)
    expect(mem.proyectos.map((p) => [p.nombre, Math.round(p.pctCuota)])).toEqual([['Acme', 25], ['Globex', 8]])
  })

  it('proyecta con el ritmo observado y no con el mes entero', () => {
    // Medidor instalado el día 20: 20 GB-h en 5 días son 4 GB-h/día.
    const desde = SEP_1 + 20 * DIA
    const ahora = desde + 5 * DIA
    const e = estadoCuota([medido(1, 'Acme', { gbMs: gbh(20) }, desde)], ahora)
    const mem = e.dimensiones.find((d) => d.dimension === 'memoria')!
    const restanteDias = (OCT_1 - ahora) / DIA
    expect(mem.proyectado).toBeCloseTo(20 + 4 * restanteDias)
    expect(e.desde).toBe(desde)
  })

  it('calcula cuándo se agota y elige la dimensión que manda', () => {
    // 2 h de CPU en 10 días: 0,2 h/día, las 4 h llegan el día 20.
    const ahora = SEP_1 + 10 * DIA
    const e = estadoCuota([medido(1, 'Acme', { cpuMs: 2 * HORA_MS, gbMs: gbh(10) })], ahora)
    const cpu = e.dimensiones.find((d) => d.dimension === 'cpuActiva')!
    expect(cpu.agotaEn).toBe(SEP_1 + 20 * DIA)
    expect(e.manda).toBe('cpuActiva')
  })

  it('una dimensión ya agotada no tiene fecha futura', () => {
    const e = estadoCuota([medido(1, 'Acme', { cpuMs: 5 * HORA_MS })], SEP_1 + 10 * DIA)
    const cpu = e.dimensiones.find((d) => d.dimension === 'cpuActiva')!
    expect(cpu.agotada).toBe(true)
    expect(cpu.agotaEn).toBeNull()
  })

  it('no proyecta como fiable con menos de tres días observados', () => {
    const desde = SEP_1 + 5 * DIA
    expect(estadoCuota([medido(1, 'A', { gbMs: gbh(1) }, desde)], desde + OBSERVACION_MIN_MS - 1).proyeccionFiable).toBe(false)
    expect(estadoCuota([medido(1, 'A', { gbMs: gbh(1) }, desde)], desde + OBSERVACION_MIN_MS).proyeccionFiable).toBe(true)
  })

  it('sin consumo no hay dimensión que mande', () => {
    const e = estadoCuota([], SEP_1 + DIA)
    expect(e.manda).toBeNull()
    expect(e.desde).toBeNull()
    expect(e.dimensiones.every((d) => d.pct === 0 && d.proyectado === 0)).toBe(true)
  })
})

describe('avisos de cuota', () => {
  const ahora = SEP_1 + 10 * DIA
  const conMemoria = (h: number) => estadoCuota([medido(1, 'Acme', { gbMs: gbh(h) })], ahora)

  it('avisa solo el umbral más alto recién cruzado', () => {
    const { avisos, estado } = decidirAvisos(conMemoria(0.95 * 360), null)
    const consumo = avisos.filter((a) => a.tipo === 'consumo')
    expect(consumo.map((a) => a.umbral)).toEqual([90])
    expect(estado.consumo.memoria).toBe(90)
  })

  it('no repite un umbral ya avisado en el mismo mes', () => {
    const primero = decidirAvisos(conMemoria(0.75 * 360), null)
    const segundo = decidirAvisos(conMemoria(0.8 * 360), primero.estado)
    expect(segundo.avisos.filter((a) => a.tipo === 'consumo')).toEqual([])
    const tercero = decidirAvisos(conMemoria(0.92 * 360), segundo.estado)
    expect(tercero.avisos.filter((a) => a.tipo === 'consumo').map((a) => a.umbral)).toEqual([90])
  })

  it('un mes nuevo vuelve a avisar desde el 70 %', () => {
    const previo: EstadoAvisos = { periodo: '2026-08', consumo: { memoria: 100 }, proyeccion: { memoria: true } }
    const { avisos } = decidirAvisos(conMemoria(0.72 * 360), previo)
    expect(avisos.find((a) => a.tipo === 'consumo')?.umbral).toBe(70)
  })

  it('avisa la proyección una vez, y no si ya está agotada', () => {
    // 150 GB-h en 10 días proyecta ~450 al cierre: 125 %.
    const e = conMemoria(150)
    const primero = decidirAvisos(e, null)
    expect(primero.avisos.map((a) => a.tipo)).toEqual(['proyeccion'])
    expect(decidirAvisos(e, primero.estado).avisos).toEqual([])
    const agotada = decidirAvisos(conMemoria(400), null)
    expect(agotada.avisos.map((a) => [a.tipo, a.umbral])).toEqual([['consumo', 100]])
  })

  it('no avisa proyecciones sin observación suficiente', () => {
    const desde = SEP_1 + 9 * DIA
    const e = estadoCuota([medido(1, 'Acme', { gbMs: gbh(40) }, desde)], desde + DIA)
    expect(e.proyeccionFiable).toBe(false)
    expect(decidirAvisos(e, null).avisos).toEqual([])
  })

  it('el estado guardado sobrevive a JSON y descarta basura', () => {
    const { estado } = decidirAvisos(conMemoria(0.95 * 360), null)
    expect(parseAvisos(JSON.stringify(estado))).toEqual(estado)
    expect(parseAvisos('no es json')).toBeNull()
    expect(parseAvisos(JSON.stringify({ periodo: 3 }))).toBeNull()
    expect(parseAvisos(JSON.stringify({ periodo: '2026-09', consumo: { memoria: 'x', inventada: 70 } }))).toEqual({ periodo: '2026-09', consumo: {}, proyeccion: {} })
  })

  it('el mensaje dice cuánto, advierte la cota inferior y el efecto sobre toda la cuenta', () => {
    const e = estadoCuota([medido(1, 'Acme', { transferenciaBytes: 95 * 1_073_741_824 })], ahora)
    const { avisos } = decidirAvisos(e, null)
    const linea = lineaAviso(avisos.find((a) => a.tipo === 'consumo')!)
    expect(linea).toContain('95 %')
    expect(linea).toContain('estáticos')
    const msg = mensajeAvisos(avisos)
    expect(msg.cuerpo).toContain('TODOS los proyectos')
    expect(msg.prioridad).toBe(4)
  })
})

describe('cotizador', () => {
  const landing = PLANTILLAS.find((p) => p.id === 'landing')!.estimacion
  const ssr = PLANTILLAS.find((p) => p.id === 'ssr')!.estimacion

  it('un sitio estático no invoca funciones pero sí gasta transferencia y edge', () => {
    const u = usoDesdeVisitas(landing)
    expect(u.invocaciones).toBe(0)
    expect(u.cpuMs).toBe(0)
    expect(u.transferenciaBytes).toBe(3_000 * 1_500 * 1024)
    expect(u.edgeRequests).toBe(3_000 * 25)
  })

  it('toda visita pide al menos el HTML', () => {
    expect(usoDesdeVisitas({ ...landing, peticionesPorVisita: 0 }).edgeRequests).toBe(3_000)
  })

  it('cuando el cómputo son centavos, manda la parte del asiento Pro', () => {
    const c = cotizar(ssr, { margenPct: 30, clientesPorAsiento: 4 })
    // ~1 USD al mes en Pro, casi todo transferencia: con margen sigue lejos
    // de los 5 USD de su parte del asiento.
    expect(c.costoPro.totalUsd * 1.3).toBeLessThan(c.parteAsientoUsd)
    expect(c.parteAsientoUsd).toBe(ASIENTO_PRO_USD / 4)
    expect(c.sugerida.totalUsd).toBe(ASIENTO_PRO_USD / 4)
    expect(c.sugerida.aplicoMinimo).toBe(true)
  })

  it('con tráfico grande manda el cómputo con margen', () => {
    const grande = { ...ssr, visitasMes: 5_000_000 }
    const c = cotizar(grande, { margenPct: 30, clientesPorAsiento: 4 })
    expect(c.sugerida.aplicoMinimo).toBe(false)
    expect(c.sugerida.totalUsd).toBeCloseTo(c.costoPro.costoUsd * 1.3)
  })

  it('dice si cabe junto a lo que la cuenta ya proyecta', () => {
    const solo = cotizar(ssr, { margenPct: 30, clientesPorAsiento: 4 })
    expect(solo.cabe).toBe(true)
    // El sitio SSR pide 0,5 GB-h al mes; con la cuenta proyectando 359,8 de
    // 360 ya no entra.
    const lleno = cotizar(ssr, { margenPct: 30, clientesPorAsiento: 4 }, { memoria: 359.8 })
    expect(lleno.cabe).toBe(false)
    expect(lleno.lineas.find((l) => l.dimension === 'memoria')!.cabe).toBe(false)
  })

  it('clientes por asiento raros no dividen por cero', () => {
    expect(cotizar(ssr, { margenPct: 30, clientesPorAsiento: 0 }).parteAsientoUsd).toBe(ASIENTO_PRO_USD)
    expect(cotizar(ssr, { margenPct: 30, clientesPorAsiento: Number.NaN }).parteAsientoUsd).toBe(ASIENTO_PRO_USD)
  })
})
