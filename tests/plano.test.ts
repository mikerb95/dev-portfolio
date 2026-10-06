import { describe, expect, it } from 'vitest'
import { REGLAS_DEFAULT, type ReglasPlano } from '../src/data/plano'
import { cotizarSoftware, EntradaInvalida } from '../src/lib/asistente/calculo-cotizacion'
import { verificarCifras } from '../src/lib/asistente/guardia'
import { calibrar } from '../src/lib/plano/aprende'
import { CONTACTO_DEFAULT } from '../src/lib/plano/contacto'
import { diferencias } from '../src/lib/plano/diff'
import { calcularEncaje, gastoPromedio } from '../src/lib/plano/encaje'
import { cicloEmpresa, esFechaISO, habilesEntre, quincenaEnODespues, sumarHabiles, sumarMeses } from '../src/lib/plano/fechas'
import { franjaDe } from '../src/lib/plano/incertidumbre'
import { armarPlan, estadoUsura, opcionesPlan, parseReglas, repartir, tablaCuotas, tramoPara, validarReglas } from '../src/lib/plano/pagos'
import { aplicarEleccion, armarPropuesta, configVacia, faltantesEnvio, normalizarConfig, PropuestaVacia } from '../src/lib/plano/propuesta'
import type { ConfigPropuesta } from '../src/lib/plano/tipos'

const HOY = '2026-10-06'
const R: ReglasPlano = REGLAS_DEFAULT

function tienda(extra: Partial<ConfigPropuesta> = {}): ConfigPropuesta {
  return normalizarConfig(
    {
      titulo: 'Tienda de Toledo',
      cliente: { nombre: 'Laura', tipo: 'persona' },
      base: 'negocio',
      lineas: [
        { id: 'descubrimiento' },
        { id: 'tienda', prioridad: 'esencial' },
        { id: 'pagos', prioridad: 'esencial' },
        { id: 'usuarios', prioridad: 'recomendado' },
        { id: 'reportes', prioridad: 'extra' },
        { id: 'entrega' },
      ],
      contacto: { ...CONTACTO_DEFAULT, contacto: { nombre: 'Laura', rol: 'Dueña', telefono: '3001112233', correo: '' } },
      ...extra,
    },
    HOY,
  )
}

describe('fechas', () => {
  it('suma días hábiles saltando el festivo del Día de la Raza', () => {
    // Viernes 9 de octubre de 2026 + 1 hábil: el lunes 12 es festivo.
    expect(sumarHabiles('2026-10-09', 1)).toBe('2026-10-13')
    expect(habilesEntre('2026-10-09', '2026-10-13')).toBe(1)
  })

  it('la quincena cae el hábil anterior al 15 o al último día', () => {
    // El 15 de noviembre de 2026 es domingo: la plata llega el viernes 13.
    expect(quincenaEnODespues('2026-11-03')).toBe('2026-11-13')
    expect(quincenaEnODespues('2026-11-14')).toBe('2026-11-30')
  })

  it('el ciclo de una empresa da cuándo radicar y cuándo paga', () => {
    // Lista el 21: ya pasó el corte del 20, va al de noviembre; 30 días después
    // cae domingo 20 de diciembre y se corre al lunes.
    expect(cicloEmpresa('2026-10-21', { corteDia: 20, diasPago: 30 })).toEqual({ radicarAntesDe: '2026-11-20', pagoEstimado: '2026-12-21' })
  })

  it('suma meses sin desbordar fin de mes', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('rechaza fechas que no existen', () => {
    expect(esFechaISO('2026-02-30')).toBe(false)
    expect(esFechaISO('2026-02-28')).toBe(true)
  })
})

describe('reglas de pago', () => {
  it('elige el tramo por monto, con los cortes inclusive', () => {
    expect(tramoPara(1_500_000, 'COP', R).pagos).toHaveLength(2)
    expect(tramoPara(1_550_000, 'COP', R).pagos).toHaveLength(3)
    expect(tramoPara(5_000_000, 'COP', R).pagos).toHaveLength(3)
    expect(tramoPara(5_050_000, 'COP', R).pagos).toHaveLength(4)
    expect(tramoPara(1_701, 'USD', R).pagos).toHaveLength(4)
  })

  it('reparte y la suma da el total exacto', () => {
    const m = repartir(4_850_000, [40, 30, 30], 'COP')
    expect(m.reduce((a, b) => a + b, 0)).toBe(4_850_000)
    expect(m[0]).toBe(1_940_000)
  })

  it('la tabla de cuotas liquida el saldo y el recargo es positivo', () => {
    const t = tablaCuotas(3_000_000, 1.5, 4, 'COP')
    expect(t).toHaveLength(4)
    expect(t.reduce((a, f) => a + f.abono, 0)).toBe(3_000_000)
    expect(t[t.length - 1].saldo).toBe(0)
    expect(t.every((f) => f.recargo > 0)).toBe(true)
    // Cuota fija: todas iguales salvo la última, que cuadra.
    expect(t[0].cuota).toBe(t[1].cuota)
  })

  it('compara el recargo con la usura convertida a mensual', () => {
    expect(estadoUsura(1.5, null).estado).toBe('sin_dato')
    expect(estadoUsura(1.5, 25).estado).toBe('ok')
    expect(estadoUsura(1.5, 15).estado).toBe('excede')
  })

  it('las cuotas solo se ofrecen por encima del mínimo y si están activas', () => {
    expect(opcionesPlan(3_000_000, 'COP', R).cuotas).toBe(false)
    expect(opcionesPlan(3_050_000, 'COP', R).cuotas).toBe(true)
    expect(opcionesPlan(9_000_000, 'COP', { ...R, cuotas: { ...R.cuotas, activas: false } }).cuotas).toBe(false)
    expect(opcionesPlan(9_000_000, 'COP', R).contado).toBe(false)
  })

  it('un plan que ya no aplica cae al plan por entregas', () => {
    const hitos = { firma: HOY, diseno: HOY, hito1: HOY, hito2: HOY, publicacion: '2026-11-30' }
    const p = armarPlan({ precio: 1_000_000, moneda: 'COP', reglas: R, tipo: 'cuotas', hitos, cliente: { tipo: 'persona' } })
    expect(p.tipo).toBe('hitos')
  })

  it('las reglas de fábrica son válidas y las rotas se detectan', () => {
    expect(validarReglas(R)).toEqual([])
    const rotas = { ...R, tramos: [{ hasta: null, pagos: [{ hito: 'firma' as const, pct: 60 }, { hito: 'publicacion' as const, pct: 30 }] }] }
    expect(validarReglas(rotas).join()).toContain('suma 90')
    expect(parseReglas('{basura', R)).toBe(R)
    expect(parseReglas(JSON.stringify(rotas), R)).toBe(R)
    expect(parseReglas(JSON.stringify({ cuotas: { recargoMensualPct: 1.2 } }), R).cuotas.recargoMensualPct).toBe(1.2)
  })
})

describe('incertidumbre', () => {
  it('sin respuestas es el rango entero; con todas, una franja', () => {
    expect(franjaDe('tienda', {})).toEqual([0, 1])
    const f = franjaDe('tienda', { catalogo: 0, inventario: 0 })
    expect(f[1]).toBeLessThan(0.5)
  })

  it('el motor no deja salir de la tabla', () => {
    expect(() => cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'tienda', ajuste: [0.5, 1.2] }] })).toThrow(EntradaInvalida)
    const abierto = cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'tienda' }] })
    const cerrado = cotizarSoftware({ moneda: 'COP', componentes: [{ id: 'tienda', ajuste: [0, 0.4] }] })
    expect(cerrado.precio[1]).toBeLessThan(abierto.precio[1])
    expect(cerrado.precio[0]).toBe(abierto.precio[0])
  })
})

describe('armarPropuesta', () => {
  it('ofrece el techo del rango y los pagos suman el total', () => {
    const s = armarPropuesta(tienda(), R, HOY)
    expect(s.precio).toBe(s.rango[1])
    expect(s.plan.pagos.reduce((a, p) => a + p.monto, 0)).toBe(s.plan.total)
    expect(s.versiones.map((v) => v.nivel)).toEqual(['esencial', 'recomendada', 'completa'])
    expect(s.versiones[0].precio).toBeLessThan(s.versiones[2].precio)
    expect(s.certeza).toBe(0)
  })

  it('responder preguntas sube la certeza y baja el precio a cobrar', () => {
    const abierta = armarPropuesta(tienda(), R, HOY)
    const c = tienda()
    c.lineas = c.lineas.map((l) => (l.id === 'tienda' ? { ...l, respuestas: { catalogo: 0, inventario: 0 } } : l))
    const cerrada = armarPropuesta(c, R, HOY)
    expect(cerrada.certeza).toBeGreaterThan(0)
    expect(cerrada.precio).toBeLessThan(abierta.precio)
  })

  it('es determinista', () => {
    expect(JSON.stringify(armarPropuesta(tienda(), R, HOY))).toBe(JSON.stringify(armarPropuesta(tienda(), R, HOY)))
  })

  it('elige las cláusulas por lo que lleva el proyecto', () => {
    const ids = armarPropuesta(tienda(), R, HOY).clausulas.map((c) => c.id)
    expect(ids).toContain('datos-personales')
    expect(ids).toContain('terceros')
    expect(ids).toContain('posicionamiento')
    expect(ids).not.toContain('cuotas')
  })

  it('las cuotas agregan su cláusula y su recargo', () => {
    const s = armarPropuesta(tienda({ planPago: 'cuotas', numCuotas: 3 }), R, HOY)
    expect(s.plan.tipo).toBe('cuotas')
    expect(s.plan.recargoTotal).toBeGreaterThan(0)
    expect(s.plan.total).toBe(s.precio + s.plan.recargoTotal)
    expect(s.clausulas.map((c) => c.id)).toContain('cuotas')
    expect(s.clausulas.find((c) => c.id === 'cuotas')!.simple).toContain('3 cuotas')
  })

  it('un plan web solo se cotiza con su precio publicado', () => {
    const s = armarPropuesta(normalizarConfig({ titulo: 'Web', base: 'presencia' }, HOY), R, HOY)
    expect(s.precio).toBe(650_000)
    expect(s.plan.pagos).toHaveLength(2)
  })

  it('sin nada que cotizar avisa', () => {
    expect(() => armarPropuesta(configVacia(HOY), R, HOY)).toThrow(PropuestaVacia)
  })

  it('toda cifra de la propuesta pasa la guardia de la IA', () => {
    const s = armarPropuesta(tienda({ planPago: 'cuotas' }), R, HOY)
    const texto = `Total $${s.precio.toLocaleString('es-CO')} COP y la primera cuota de $${s.plan.pagos[1].monto.toLocaleString('es-CO')} COP`
    expect(verificarCifras(texto, s.cifras).ok).toBe(true)
    expect(verificarCifras('Te lo dejo en $1.234.567 COP', s.cifras).ok).toBe(false)
  })

  it('normaliza la basura sin lanzar', () => {
    const c = normalizarConfig({ lineas: [{ id: 'inventado' }, { id: 'tienda', cantidad: 9 }, { id: 'tienda' }], moneda: 'EUR', fechaInicio: 'ayer' }, HOY)
    expect(c.lineas).toHaveLength(1)
    expect(c.lineas[0].cantidad).toBe(1)
    expect(c.moneda).toBe('COP')
    expect(c.fechaInicio).toBe(HOY)
    expect(faltantesEnvio(c)).toContain('un título')
  })
})

describe('perillas del cliente', () => {
  it('solo cambia lo que Mike habilitó', () => {
    const c = tienda({ perillas: { version: false, planPago: true, lineas: ['reportes'] } })
    const e = aplicarEleccion(c, { version: 'esencial', planPago: 'cuotas', numCuotas: 2, lineas: { reportes: true, tienda: false } })
    expect(e.version).toBe(c.version)
    expect(e.planPago).toBe('cuotas')
    expect(e.ajustesLineas).toEqual({ reportes: true })
    const s = armarPropuesta(e, R, HOY)
    expect(s.lineas.find((l) => l.id === 'reportes')!.incluida).toBe(true)
    expect(s.lineas.find((l) => l.id === 'tienda')!.incluida).toBe(true)
  })
})

describe('diferencias', () => {
  it('describe lo que se agregó y cómo cambió el precio', () => {
    const a = armarPropuesta(tienda(), R, HOY)
    const b = armarPropuesta(tienda({ version: 'completa' }), R, HOY)
    const textos = diferencias(a, b).map((x) => x.texto).join(' | ')
    expect(textos).toContain('Se agregó: Reportes y tableros')
    expect(textos).toContain('El precio pasó de')
  })
})

describe('encaje', () => {
  it('detecta el choque y sugiere cuándo empezar', () => {
    const e = calcularEncaje({
      ingresoNeto: 6_000_000,
      gastoMensual: 3_000_000,
      capacidad: 40,
      otros: [{ nombre: 'Toledo', inicio: '2026-10-05', fin: '2026-10-30', horas: 120 }],
      nueva: { nombre: 'Nueva', inicio: '2026-10-05', fin: '2026-10-23', horas: 45 },
    })
    expect(e.mesesCubiertos).toBe(2)
    expect(e.choques).toBeGreaterThan(0)
    expect(e.inicioSugerido! >= '2026-10-26').toBe(true)
    expect(gastoPromedio([0, 2_000_000, 4_000_000])).toBe(3_000_000)
  })
})

describe('aprende', () => {
  it('no sugiere nada con pocas muestras y sugiere subir si se pasa del colchón', () => {
    expect(calibrar([{ componenteId: 'tienda', estimadas: 30, reales: 50 }])[0].confiable).toBe(false)
    const c = calibrar([1, 2, 3].map(() => ({ componenteId: 'tienda', estimadas: 30, reales: 45 })))[0]
    expect(c.factor).toBe(1.5)
    expect(c.sugerencia).toContain('subir la tabla')
  })
})
