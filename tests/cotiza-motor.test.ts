// Motor de Cotiza (RF-221). Cifras calculadas a mano en cada caso: si una
// regla cambia en src/data/cotiza.ts, el test que falle dice cuál.

import { describe, expect, it } from 'vitest'
import { CUPOS_POR_DEFECTO, REGLAS_COTIZA } from '../src/data/cotiza'
import {
  ErrorCotiza,
  consumoDeCupos,
  cotizar,
  fueraDeHorario,
  horasDe,
  horasDeReunion,
  nivelDelEncargo,
  planDePagos,
  plazoCorreccion,
  precioAdicional,
  precioExcedente,
  redondearArriba,
  tarifasVigentes,
  totalVigente,
  type Entregable,
} from '../src/lib/cotiza/motor'

const pres = (diapositivas: number, extra: Partial<Extract<Entregable, { tipo: 'presentacion' }>> = {}): Entregable => ({
  tipo: 'presentacion',
  nombre: 'Presentación',
  diapositivas,
  anexos: false,
  documentosFuente: 2,
  ...extra,
})

describe('horas por entregable', () => {
  it('presentación básica: hasta 10 diapositivas, sin anexos y pocos documentos = 1 h', () => {
    expect(horasDe(pres(8)).horas).toBe(1)
    expect(horasDe(pres(10, { documentosFuente: 3 })).horas).toBe(1)
  })

  it('más diapositivas, anexos o más documentos de base = 2 h', () => {
    expect(horasDe(pres(11)).horas).toBe(2)
    expect(horasDe(pres(8, { anexos: true })).horas).toBe(2)
    expect(horasDe(pres(8, { documentosFuente: 4 })).horas).toBe(2)
  })

  it('una hora más por cada 10 diapositivas por encima de 20', () => {
    expect(horasDe(pres(20)).horas).toBe(2)
    expect(horasDe(pres(21)).horas).toBe(3)
    expect(horasDe(pres(30)).horas).toBe(3)
    expect(horasDe(pres(31)).horas).toBe(4)
  })

  it('la cantidad multiplica', () => {
    expect(horasDe(pres(15, { cantidad: 3 })).horas).toBe(6)
  })

  it('revisión: 3 documentos de hasta 20 páginas por hora; uno largo pesa como varios', () => {
    expect(horasDe({ tipo: 'revision', nombre: 'r', documentos: 1, paginasPorDocumento: 1 }).horas).toBe(1)
    expect(horasDe({ tipo: 'revision', nombre: 'r', documentos: 3, paginasPorDocumento: 20 }).horas).toBe(1)
    expect(horasDe({ tipo: 'revision', nombre: 'r', documentos: 5, paginasPorDocumento: 20 }).horas).toBe(2)
    // 2 documentos de 45 páginas = 6 equivalentes = 2 h
    expect(horasDe({ tipo: 'revision', nombre: 'r', documentos: 2, paginasPorDocumento: 45 }).horas).toBe(2)
  })

  it('libre: las horas de Mike, en medias horas', () => {
    expect(horasDe({ tipo: 'libre', nombre: 'x', nivel: 'analitica', horas: 6.5 })).toMatchObject({ horas: 6.5, nivel: 'analitica' })
    for (const horas of [0, 0.25, 1.3, 201, Number.NaN]) {
      expect(() => horasDe({ tipo: 'libre', nombre: 'x', nivel: 'analitica', horas }), String(horas)).toThrow(ErrorCotiza)
    }
  })

  it('rechaza entradas absurdas sin lanzar otra cosa que ErrorCotiza', () => {
    const malos: unknown[] = [
      pres(0),
      pres(8, { documentosFuente: -1 }),
      pres(8, { cantidad: 0 }),
      pres(2.5),
      { tipo: 'revision', nombre: 'r', documentos: 0, paginasPorDocumento: 10 },
      { tipo: 'libre', nombre: 'x', nivel: 'jefe', horas: 2 },
      { tipo: 'otro', nombre: 'x' },
      null,
    ]
    for (const e of malos) expect(() => horasDe(e as Entregable)).toThrow(ErrorCotiza)
  })
})

describe('propuesta', () => {
  it('una presentación sencilla: $50.000 + 15 % = $57.500, que el redondeo sube a $100.000', () => {
    const c = cotizar({ moneda: 'COP', entregables: [pres(8)] })
    expect(c.subtotal).toBe(50_000)
    expect(c.colchon).toBe(7_500)
    expect(c.precio).toBe(100_000)
    expect(c.pagos.map((p) => [p.pct, p.monto])).toEqual([
      [50, 50_000],
      [50, 50_000],
    ])
  })

  it('un encargo mixto en pesos', () => {
    const c = cotizar({
      moneda: 'COP',
      entregables: [
        pres(15, { anexos: true, cantidad: 2, nombre: 'Presentaciones para gerencia' }), // 4 h × 50.000
        { tipo: 'revision', nombre: 'Revisión de contratos', documentos: 6, paginasPorDocumento: 20 }, // 2 h × 50.000
        { tipo: 'libre', nombre: 'Costeo de importación', nivel: 'analitica', horas: 6 }, // 6 h × 70.000
      ],
    })
    expect(c.horas).toBe(12)
    expect(c.subtotal).toBe(720_000)
    expect(c.colchon).toBeCloseTo(108_000)
    expect(c.precio).toBe(850_000)
    expect(c.pagos.reduce((t, p) => t + p.monto, 0)).toBe(c.precio)
    expect(nivelDelEncargo(c)).toBe('analitica') // 6 h y 6 h: gana el más alto
  })

  it('el mismo encargo en dólares: US$35 la hora para todo', () => {
    const c = cotizar({
      moneda: 'USD',
      entregables: [
        pres(15, { anexos: true, cantidad: 2 }),
        { tipo: 'revision', nombre: 'r', documentos: 6, paginasPorDocumento: 20 },
        { tipo: 'libre', nombre: 'x', nivel: 'estrategica', horas: 6 },
      ],
    })
    expect(c.subtotal).toBe(420)
    expect(c.precio).toBe(500) // 483 redondeado a US$50
    expect(c.lineas.every((l) => l.tarifa === 35)).toBe(true)
  })

  it('por encima de $1.500.000 el plan pasa a tres pagos, y suman exacto', () => {
    const c = cotizar({ moneda: 'COP', entregables: [{ tipo: 'libre', nombre: 'Rediseño de la cadena de suministro', nivel: 'estrategica', horas: 30 }] })
    expect(c.precio).toBe(2_800_000) // 2.400.000 + 360.000 = 2.760.000
    expect(c.pagos.map((p) => p.monto)).toEqual([1_120_000, 840_000, 840_000])
    expect(c.pagos.map((p) => p.concepto)).toEqual(['Al aceptar la propuesta', 'Con la primera entrega', 'Al entregar todo'])
  })

  it('una propuesta enviada se recalcula con SUS tarifas, no con las de hoy', () => {
    const congeladas = { moneda: 'COP' as const, hora: { ...tarifasVigentes('COP').hora, documental: 40_000 } }
    const c = cotizar({ moneda: 'COP', entregables: [pres(15)], tarifas: congeladas })
    expect(c.subtotal).toBe(80_000)
    expect(() => cotizar({ moneda: 'USD', entregables: [pres(15)], tarifas: congeladas })).toThrow(ErrorCotiza)
  })

  it('el mínimo sube el precio y lo avisa', () => {
    const c = cotizar({ moneda: 'COP', entregables: [pres(8)], reglas: { ...REGLAS_COTIZA, minimo: { COP: 150_000, USD: 50 } } })
    expect(c.precio).toBe(150_000)
    expect(c.minimoAplicado).toBe(true)
  })

  it('valida la forma de la propuesta', () => {
    expect(() => cotizar({ moneda: 'COP', entregables: [] })).toThrow(ErrorCotiza)
    expect(() => cotizar({ moneda: 'EUR' as 'COP', entregables: [pres(8)] })).toThrow(ErrorCotiza)
    expect(() => cotizar({ moneda: 'COP', entregables: [pres(8, { nombre: '  ' })] })).toThrow(ErrorCotiza)
    expect(() => cotizar({ moneda: 'COP', entregables: Array.from({ length: 41 }, () => pres(8)) })).toThrow(ErrorCotiza)
  })

  it('redondeo hacia arriba sin saltar un paso por la coma flotante', () => {
    expect(redondearArriba(100_000, 50_000)).toBe(100_000)
    expect(redondearArriba(100_001, 50_000)).toBe(150_000)
    expect(redondearArriba(0.1 + 0.2, 0.3)).toBeCloseTo(0.3)
  })

  it('plan de pagos de cuatro tramos por encima de $5.000.000', () => {
    const pagos = planDePagos(6_000_000, 'COP')
    expect(pagos.map((p) => p.pct)).toEqual([30, 25, 25, 20])
    expect(pagos.reduce((t, p) => t + p.monto, 0)).toBe(6_000_000)
  })
})

describe('cupos', () => {
  const c = CUPOS_POR_DEFECTO

  it('las dos primeras reuniones entran; la tercera es adicional completa', () => {
    const r = consumoDeCupos(c, { reuniones: [40, 45, 30], rondasPorEntregable: [] })
    expect(r.reuniones).toEqual({ incluidas: 2, usadas: 3, restantes: 0 })
    expect(r.excedentes).toEqual([{ tipo: 'reunion_extra', reunion: 3, minutos: 30 }])
  })

  it('una reunión incluida que se alarga: el exceso es adicional, con 5 minutos de gracia', () => {
    expect(consumoDeCupos(c, { reuniones: [50], rondasPorEntregable: [] }).excedentes).toEqual([])
    expect(consumoDeCupos(c, { reuniones: [52], rondasPorEntregable: [] }).excedentes).toEqual([
      { tipo: 'reunion_larga', reunion: 1, minutosDeMas: 7 },
    ])
  })

  it('las rondas se cuentan por entregable', () => {
    const r = consumoDeCupos(c, { reuniones: [], rondasPorEntregable: [1, 4] })
    expect(r.rondas.map((x) => x.restantes)).toEqual([1, 0])
    expect(r.excedentes).toEqual([
      { tipo: 'ronda_extra', entregable: 1, ronda: 3 },
      { tipo: 'ronda_extra', entregable: 1, ronda: 4 },
    ])
  })
})

describe('adicionales', () => {
  const t = tarifasVigentes('COP')
  const c = CUPOS_POR_DEFECTO

  it('reuniones en bloques de 30 minutos', () => {
    expect(horasDeReunion(7)).toBe(0.5)
    expect(horasDeReunion(30)).toBe(0.5)
    expect(horasDeReunion(31)).toBe(1)
    expect(horasDeReunion(90)).toBe(1.5)
  })

  it('media hora analítica: $35.000; fuera de horario: +50 % = $52.500, redondeado a $55.000', () => {
    expect(precioAdicional({ horas: 0.5, nivel: 'analitica', urgente: false }, t, c).monto).toBe(35_000)
    const u = precioAdicional({ horas: 0.5, nivel: 'analitica', urgente: true }, t, c)
    expect(u.recargo).toBe(17_500)
    expect(u.monto).toBe(55_000)
  })

  it('en dólares redondea a US$5', () => {
    expect(precioAdicional({ horas: 0.5, nivel: 'documental', urgente: false }, tarifasVigentes('USD'), c).monto).toBe(20)
  })

  it('el excedente se cobra con el nivel del encargo; una ronda de más necesita las horas de Mike', () => {
    const ctx = { tarifas: t, cupos: c, nivel: 'analitica' as const }
    expect(precioExcedente({ tipo: 'reunion_larga', reunion: 1, minutosDeMas: 7 }, ctx).monto).toBe(35_000)
    expect(precioExcedente({ tipo: 'reunion_extra', reunion: 3, minutos: 60 }, ctx).monto).toBe(70_000)
    expect(() => precioExcedente({ tipo: 'ronda_extra', entregable: 0, ronda: 3 }, ctx)).toThrow(ErrorCotiza)
    expect(precioExcedente({ tipo: 'ronda_extra', entregable: 0, ronda: 3 }, { ...ctx, horasRonda: 1 }).monto).toBe(70_000)
  })

  it('el precio base nunca cambia: los aprobados se suman aparte y los propuestos solo se informan', () => {
    const r = totalVigente(850_000, [
      { monto: 100_000, estado: 'aprobado' },
      { monto: 50_000, estado: 'propuesto' },
      { monto: 30_000, estado: 'rechazado' },
    ])
    expect(r).toEqual({ base: 850_000, aprobados: 100_000, propuestos: 50_000, total: 950_000 })
  })
})

describe('horario pactado, en hora de Colombia', () => {
  const c = CUPOS_POR_DEFECTO

  it('martes 10:00 en Bogotá está dentro', () => {
    expect(fueraDeHorario(new Date('2026-10-06T15:00:00Z'), c)).toEqual({ fuera: false, motivo: null })
  })

  it('martes 7:30 p. m. en Bogotá (miércoles 00:30 UTC) está fuera', () => {
    expect(fueraDeHorario(new Date('2026-10-07T00:30:00Z'), c).motivo).toBe('fuera_de_hora')
  })

  it('los bordes: 7:59 fuera, 8:00 dentro, 18:00 fuera', () => {
    expect(fueraDeHorario(new Date('2026-10-06T12:59:00Z'), c).fuera).toBe(true)
    expect(fueraDeHorario(new Date('2026-10-06T13:00:00Z'), c).fuera).toBe(false)
    expect(fueraDeHorario(new Date('2026-10-06T23:00:00Z'), c).fuera).toBe(true)
  })

  it('sábado y festivo están fuera aunque sea de día', () => {
    expect(fueraDeHorario(new Date('2026-10-10T15:00:00Z'), c).motivo).toBe('fin_de_semana')
    const f = fueraDeHorario(new Date('2026-10-12T15:00:00Z'), c)
    expect(f.motivo).toBe('festivo')
  })

  it('el resumen de una reunión del viernes se corrige hasta el martes si el lunes es festivo', () => {
    expect(plazoCorreccion('2026-10-09', c)).toBe('2026-10-13')
  })
})
