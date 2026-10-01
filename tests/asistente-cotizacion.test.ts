import { describe, expect, it } from 'vitest'
import { CAPACITACION, COMPONENTES, etiquetaDesde, PAQUETES_WEB, REGLAS, TARIFA_HORA } from '../src/data/tarifario'
import es from '../src/i18n/es'
import en from '../src/i18n/en'
import {
  cifrasPermitidas,
  cotizarCapacitacion,
  cotizarMantenimiento,
  cotizarPaquete,
  cotizarSoftware,
  EntradaInvalida,
  redondear,
} from '../src/lib/asistente/calculo-cotizacion'

describe('tarifario', () => {
  it('tiene un precio por cada plan de /paginas-web, en los dos idiomas', () => {
    expect(PAQUETES_WEB).toHaveLength(es.paginasWeb.planes.length)
    expect(PAQUETES_WEB).toHaveLength(en.paginasWeb.planes.length)
    PAQUETES_WEB.forEach((p, i) => expect(es.paginasWeb.planes[i]!.nombre).toBe(p.nombre))
  })

  it('los planes suben de precio en orden, en COP y en USD', () => {
    for (const m of ['COP', 'USD'] as const) {
      const precios = PAQUETES_WEB.map((p) => p.desde[m])
      expect([...precios].sort((a, b) => a - b)).toEqual(precios)
    }
  })

  it('el mínimo de un trabajo a la medida es el precio del plan más barato', () => {
    expect(REGLAS.minimo).toEqual(PAQUETES_WEB[0]!.desde)
  })

  it('pinta los "desde" como en la página', () => {
    expect(etiquetaDesde(PAQUETES_WEB[0]!, 'es')).toBe('desde $650.000 COP')
    expect(etiquetaDesde(PAQUETES_WEB[2]!, 'es')).toBe('desde $4.500.000 COP')
    expect(etiquetaDesde(PAQUETES_WEB[2]!, 'en')).toBe('from $1,500 USD')
  })

  it('las preguntas frecuentes de /paginas-web dicen las mismas condiciones de pago que el tarifario', () => {
    const pct = Math.round(REGLAS.anticipo * 100)
    expect(pct).toBe(50) // "la mitad" / "half" en el texto
    expect(es.paginasWeb.faqs.find((f) => f.q === '¿Cómo se paga?')?.a).toContain(`${REGLAS.validezDias} días`)
    expect(en.paginasWeb.faqs.find((f) => f.q === 'How do I pay?')?.a).toContain(`${REGLAS.validezDias} days`)
  })

  it('cada componente tiene un rango de horas con sentido y un id único', () => {
    expect(new Set(COMPONENTES.map((c) => c.id)).size).toBe(COMPONENTES.length)
    for (const c of COMPONENTES) expect(c.horas[0]).toBeGreaterThan(0), expect(c.horas[1]).toBeGreaterThanOrEqual(c.horas[0])
  })
})

describe('cotizarSoftware', () => {
  it('suma horas, aplica el colchón del 20 % y redondea el precio hacia arriba', () => {
    const c = cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'reservas' }, { id: 'pagos' }] })
    expect(c.horasBase).toEqual([32, 55])
    expect(c.horas).toEqual([39, 66]) // 38,4 y 66 → hacia arriba
    expect(c.precio).toEqual([2_750_000, 4_650_000]) // 2.730.000 y 4.620.000 → múltiplo de 50.000 hacia arriba
    expect(c.condiciones).toEqual({ anticipoPct: 50, anticipo: [1_375_000, 2_325_000], validezDias: 15 })
    expect(c.aplicoMinimo).toBe(false)
  })

  it('una tienda completa (web Negocio + componentes) cae por encima del piso de "A medida"', () => {
    const componentes = [{ id: 'descubrimiento' }, { id: 'tienda' }, { id: 'pagos' }, { id: 'panel' }, { id: 'entrega' }]
    const c = cotizarSoftware({ moneda: 'COP', base: 'negocio', componentes })
    expect(c.base).toEqual({ paquete: 'negocio', nombre: 'Negocio', precio: 1_500_000 })
    expect(c.precio).toEqual([5_600_000, 8_650_000]) // 58 h y 102 h a $70.000, redondeado, + $1.500.000
    expect(c.precio[0]).toBeGreaterThan(PAQUETES_WEB[2]!.desde.COP)
    // Sin la web base, los componentes solos quedan por debajo: por eso existe `base`.
    expect(cotizarSoftware({ moneda: 'COP', componentes }).precio[0]).toBeLessThan(PAQUETES_WEB[2]!.desde.COP)
  })

  it('la base solo puede ser un plan web que no sea "A medida"', () => {
    expect(() => cotizarSoftware({ moneda: 'COP', base: 'a-medida', componentes: [{ id: 'pagos' }] })).toThrow(EntradaInvalida)
  })

  it('cobra por unidad solo lo que se cobra por unidad', () => {
    const c = cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'panel', cantidad: 3 }] })
    expect(c.lineas[0]!.horas).toEqual([18, 36])
    expect(() => cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'pagos', cantidad: 2 }] })).toThrow(EntradaInvalida)
  })

  it('un trabajo pequeño nunca baja del mínimo', () => {
    const c = cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'descubrimiento' }] })
    expect(c.precio[0]).toBe(REGLAS.minimo.COP)
    expect(c.aplicoMinimo).toBe(true)
  })

  it('en USD usa la tarifa en dólares, no una conversión', () => {
    const c = cotizarSoftware({ moneda: 'USD', componentes: [{ id: 'pagos' }] })
    expect(c.tarifaHora).toBe(TARIFA_HORA.USD)
    expect(c.precio).toEqual([450, 750]) // 15 h × 30 = 450; 24 h × 30 = 720 → 750
  })

  it('rechaza componentes inventados, repetidos o una lista vacía, con un mensaje que el modelo pueda corregir', () => {
    expect(() => cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'blockchain' }] })).toThrow(/componente desconocido: blockchain/)
    expect(() => cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'pagos' }, { id: 'pagos' }] })).toThrow(/repetido/)
    expect(() => cotizarSoftware({ moneda: 'COP', componentes: [] })).toThrow(EntradaInvalida)
    expect(() => cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'panel', cantidad: 0 }] })).toThrow(/cantidad/)
  })
})

describe('cotizarCapacitacion', () => {
  it('hasta 20 personas es el precio de la sesión', () => {
    expect(cotizarCapacitacion(20).precio).toEqual([CAPACITACION.sesionCOP, CAPACITACION.sesionCOP])
    expect(cotizarCapacitacion(5).personasAdicionales).toBe(0)
  })

  it('cada persona por encima de 20 suma $40.000', () => {
    const c = cotizarCapacitacion(25)
    expect(c.personasAdicionales).toBe(5)
    expect(c.precio).toEqual([1_200_000, 1_200_000])
  })

  it('rechaza números de personas sin sentido', () => {
    expect(() => cotizarCapacitacion(0)).toThrow(EntradaInvalida)
    expect(() => cotizarCapacitacion(2.5)).toThrow(EntradaInvalida)
  })
})

describe('paquetes y mantenimiento', () => {
  it('un paquete devuelve su "desde" y el anticipo del 50 %', () => {
    const p = cotizarPaquete('negocio', 'COP')
    expect(p.desde).toBe(1_500_000)
    expect(p.condiciones.anticipo).toEqual([750_000, 750_000])
    expect(() => cotizarPaquete('premium', 'COP')).toThrow(EntradaInvalida)
  })

  it('el mantenimiento es horas al mes por la tarifa', () => {
    expect(cotizarMantenimiento([2, 4], 'COP').precioMes).toEqual([150_000, 300_000]) // 140.000 → 150.000; 280.000 → 300.000
    expect(() => cotizarMantenimiento([4, 2], 'COP')).toThrow(EntradaInvalida)
  })

  it('redondear nunca baja', () => {
    expect(redondear(650_000, 'COP')).toBe(650_000)
    expect(redondear(650_001, 'COP')).toBe(700_000)
    expect(redondear(451, 'USD')).toBe(500)
  })

  it('las cifras permitidas incluyen precio, anticipo y tarifa', () => {
    const cifras = cifrasPermitidas([cotizarCapacitacion(25), cotizarPaquete('presencia', 'COP')])
    expect(cifras).toEqual(expect.arrayContaining([1_200_000, 600_000, 1_000_000, 40_000, 650_000, 325_000]))
  })
})
