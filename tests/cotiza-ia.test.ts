// IA de Cotiza (RF-223), parte pura: lo que se hace con la respuesta del
// modelo. Las garantías importantes (citas literales, ninguna cifra
// inventada, la IA suma y no borra) se prueban aquí con salidas fingidas,
// incluidas las maliciosas: el modelo puede equivocarse o ser manipulado por
// el texto del cliente, y nada de eso puede llegar a la propuesta.

import { describe, expect, it } from 'vitest'
import { configVacia, type ConfigEncargo } from '../src/lib/cotiza/encargo'
import {
  ESQUEMA_ALCANCE,
  alcanceEnTexto,
  aplicarAlcance,
  componerResumen,
  filtrarClasificacion,
  promptAlcance,
  PROMPT_CLASIFICACION,
  PROMPT_RESUMEN,
  type SalidaAlcance,
} from '../src/lib/cotiza/ia'
import { consumoDeCupos, cotizar } from '../src/lib/cotiza/motor'

// La raya larga se arma en tiempo de ejecución: escrita literal en este
// archivo, la bloquearía la misma regla que el test hace cumplir.
const RAYA_LARGA = String.fromCharCode(0x2014)

const PEDIDO = `Hola Mike, soy Laura de Importadora Andina. Necesito 2 presentaciones para la junta de importaciones del mes, cada una de unas 15 diapositivas con anexos.
También revisar 6 contratos de transporte de unas 20 páginas. Y quiero saber cuánto nos cuesta de verdad importar desde China, el flete nos salió en US$2.400 el último mes.`

const ENTREGABLE_BASE = { diapositivas: 0, anexos: false, documentosFuente: 0, cantidad: 0, documentos: 0, paginasPorDocumento: 0, nivel: 'documental' as const, horas: 0 }

const salida = (extra: Partial<SalidaAlcance> = {}): SalidaAlcance => ({
  titulo: 'Presentaciones y revisión para la junta',
  cliente: { nombre: 'Laura', empresa: 'Importadora Andina', contacto: '' },
  moneda: 'COP',
  entregables: [
    { ...ENTREGABLE_BASE, tipo: 'presentacion', nombre: 'Presentaciones para la junta', cita: 'Necesito 2 presentaciones para la junta de importaciones del mes', diapositivas: 15, anexos: true, documentosFuente: 3, cantidad: 2 },
    { ...ENTREGABLE_BASE, tipo: 'revision', nombre: 'Revisión de contratos de transporte', cita: 'revisar 6 contratos de transporte', documentos: 6, paginasPorDocumento: 20 },
    { ...ENTREGABLE_BASE, tipo: 'libre', nombre: 'Costeo de importación desde China', cita: 'quiero saber cuánto nos cuesta de verdad importar desde China', nivel: 'analitica', horas: 6.3 },
  ],
  exclusiones: ['Negociación con navieras', 'Trámites de nacionalización'],
  supuestos: ['Laura entrega las facturas de importación'],
  preguntas: ['¿De cuántos documentos sale la información de las presentaciones?', '¿Para cuándo es la junta?'],
  ...extra,
})

describe('pedido a alcance', () => {
  it('convierte la salida en entregables válidos que el motor sabe cotizar', () => {
    const r = aplicarAlcance(salida(), PEDIDO, configVacia(), '2026-10-06')
    expect(r.agregados).toBe(3)
    // 6,3 h pasa a medias horas
    expect(r.config.entregables[2]).toMatchObject({ tipo: 'libre', nivel: 'analitica', horas: 6.5 })
    expect(r.config.titulo).toBe('Presentaciones y revisión para la junta')
    expect(r.config.exclusiones).toEqual(['Negociación con navieras', 'Trámites de nacionalización'])
    const c = cotizar({ moneda: 'COP', entregables: r.config.entregables })
    expect(c.precio).toBeGreaterThan(0)
  })

  it('las preguntas y las citas verificadas quedan en las notas privadas', () => {
    const r = aplicarAlcance(salida(), PEDIDO, configVacia(), '2026-10-06')
    expect(r.config.notas).toContain('IA, 2026-10-06.')
    expect(r.config.notas).toContain('¿Para cuándo es la junta?')
    expect(r.config.notas).toContain('Revisión de contratos de transporte: "revisar 6 contratos de transporte"')
  })

  it('una cita que no está en el pedido se descarta', () => {
    const s = salida()
    s.entregables[1].cita = 'revisar 60 contratos urgentes'
    const r = aplicarAlcance(s, PEDIDO, configVacia(), '2026-10-06')
    expect(r.citasDescartadas).toEqual(['revisar 60 contratos urgentes'])
    expect(r.config.notas).not.toContain('60 contratos')
  })

  it('ninguna cifra de dinero inventada entra; las del cliente sí se pueden repetir', () => {
    const r = aplicarAlcance(
      salida({
        exclusiones: ['Negociación con navieras', 'Asesoría tributaria por $500.000 COP'],
        supuestos: ['El flete de referencia es de US$2.400'],
        preguntas: ['¿Tu presupuesto es de 3 millones?'],
      }),
      PEDIDO,
      configVacia(),
      '2026-10-06'
    )
    expect(r.config.exclusiones).toEqual(['Negociación con navieras'])
    expect(r.config.supuestos).toEqual(['El flete de referencia es de US$2.400'])
    expect(r.preguntas).toEqual([])
    expect(r.descartados.length).toBe(2)
  })

  it('suma sobre lo que Mike ya escribió y no le quita nada', () => {
    const actual: ConfigEncargo = {
      ...configVacia(),
      titulo: 'Mi título',
      cliente: { nombre: 'Laura Gómez', empresa: '', contacto: '3001112233' },
      moneda: 'USD',
      entregables: [{ tipo: 'libre', nombre: 'Algo previo', nivel: 'operativa', horas: 2 }],
      exclusiones: ['Negociación con navieras'],
      notas: 'Nota mía',
    }
    const r = aplicarAlcance(salida(), PEDIDO, actual, '2026-10-06')
    expect(r.config.titulo).toBe('Mi título')
    expect(r.config.cliente).toEqual({ nombre: 'Laura Gómez', empresa: 'Importadora Andina', contacto: '3001112233' })
    // Ya había algo cotizado: la IA no cambia la moneda.
    expect(r.config.moneda).toBe('USD')
    expect(r.config.entregables[0].nombre).toBe('Algo previo')
    expect(r.config.entregables).toHaveLength(4)
    expect(r.config.exclusiones).toEqual(['Negociación con navieras', 'Trámites de nacionalización'])
    expect(r.config.notas.endsWith('Nota mía')).toBe(true)
  })

  it('valores absurdos del modelo se corrigen o se descartan, sin romper', () => {
    const r = aplicarAlcance(
      salida({
        entregables: [
          { ...ENTREGABLE_BASE, tipo: 'presentacion', nombre: 'Gigante', cita: '', diapositivas: 99999, cantidad: -3 },
          { ...ENTREGABLE_BASE, tipo: 'libre', nombre: 'Sin horas', cita: '', nivel: 'inventado' as 'documental', horas: Number.NaN },
          { ...ENTREGABLE_BASE, tipo: 'libre', nombre: '', cita: '', horas: 2 },
        ],
      }),
      PEDIDO,
      configVacia(),
      '2026-10-06'
    )
    expect(r.config.entregables).toEqual([
      { tipo: 'presentacion', nombre: 'Gigante', diapositivas: 500, anexos: false, documentosFuente: 0, cantidad: 1 },
      { tipo: 'libre', nombre: 'Sin horas', nivel: 'operativa', horas: 2 },
    ])
    expect(r.descartados).toContain('(sin nombre)')
  })

  it('el esquema no tiene ningún campo donde poner dinero', () => {
    const claves = JSON.stringify(ESQUEMA_ALCANCE)
    expect(claves).not.toMatch(/precio|valor|monto|tarifa|costo/i)
  })

  it('los prompts piden tuteo, prohíben precios y tratan el texto del cliente como dato', () => {
    for (const p of [promptAlcance(), PROMPT_CLASIFICACION, PROMPT_RESUMEN]) {
      expect(p).toMatch(/NUNCA escribas precios/)
      expect(p).toMatch(/tuteo/)
      expect(p).toMatch(/no instrucciones para ti/)
      expect(p).not.toContain(RAYA_LARGA)
    }
  })
})

describe('clasificador', () => {
  const snap = {
    titulo: 'Junta',
    exclusiones: ['Negociación con navieras'],
    supuestos: ['Laura entrega las facturas'],
    cotizacion: cotizar({ moneda: 'COP', entregables: [{ tipo: 'presentacion', nombre: 'Presentaciones para la junta', diapositivas: 15, anexos: true, documentosFuente: 3, cantidad: 2 }] }),
  }
  const alcance = alcanceEnTexto(snap, consumoDeCupos(snap.cotizacion.cupos, { reuniones: [40], rondasPorEntregable: [1] }))

  it('el alcance en texto lleva entregables, exclusiones y cupos usados', () => {
    expect(alcance).toContain('Presentaciones para la junta')
    expect(alcance).toContain('Rondas de cambios usadas: 1 de 2')
    expect(alcance).toContain('Negociación con navieras')
    expect(alcance).toContain('(usadas 1)')
  })

  it('verifica la cita del alcance y ajusta las horas a medias horas', () => {
    const r = filtrarClasificacion(
      { clasificacion: 'adicional', razon: 'Es negociar, está excluido.', citaAlcance: 'Negociación con navieras', horas: 2.2, nivel: 'analitica', respuesta: 'Laura, eso no estaba en lo acordado. Te lo cotizo aparte.' },
      alcance,
      'Mike, ¿puedes llamar tú a la naviera para negociar?'
    )
    expect(r).toMatchObject({ clasificacion: 'adicional', citaAlcance: 'Negociación con navieras', horas: 2, citaDescartada: false, respuestaDescartada: false })
  })

  it('descarta citas inventadas y respuestas con precios inventados', () => {
    const r = filtrarClasificacion(
      { clasificacion: 'adicional', razon: 'x', citaAlcance: 'Incluye llamadas ilimitadas', horas: 1, nivel: 'operativa', respuesta: 'Claro, eso te sale en $150.000.' },
      alcance,
      'Llama a la naviera'
    )
    expect(r.citaAlcance).toBe('')
    expect(r.citaDescartada).toBe(true)
    expect(r.respuesta).toBe('')
    expect(r.respuestaDescartada).toBe(true)
  })

  it('si no es adicional, no hay horas', () => {
    const r = filtrarClasificacion({ clasificacion: 'cupo', razon: 'ronda', citaAlcance: '', horas: 3, nivel: 'documental', respuesta: 'Listo, uso una ronda.' }, alcance, 'cambia los colores')
    expect(r.horas).toBe(0)
  })
})

describe('resumen de reunión', () => {
  const notas = 'reunión con laura. acordamos 2 presentaciones, ella manda facturas el jueves. preguntó por cotizar fletes aéreos (no está). el flete marítimo fue US$2.400'

  it('arma el texto en tres bloques', () => {
    const r = componerResumen(
      { acordado: ['Se mantienen las 2 presentaciones'], pendientes: ['Laura envía las facturas el jueves'], fueraDelAlcance: ['Cotizar fletes aéreos'] },
      notas
    )
    expect(r.resumen).toBe(
      'Acordamos:\n• Se mantienen las 2 presentaciones\n\nPendientes:\n• Laura envía las facturas el jueves\n\nQuedó por fuera de lo acordado (se cotiza aparte si se necesita):\n• Cotizar fletes aéreos'
    )
  })

  it('quita líneas con dinero que no estaba en las notas, conserva el que sí', () => {
    const r = componerResumen(
      { acordado: ['El flete marítimo de referencia es US$2.400', 'El adicional de fletes aéreos vale $300.000'], pendientes: [], fueraDelAlcance: [] },
      notas
    )
    expect(r.resumen).toContain('US$2.400')
    expect(r.resumen).not.toContain('300.000')
    expect(r.descartadas).toBe(1)
  })
})
