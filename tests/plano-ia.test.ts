import { describe, expect, it } from 'vitest'
import { REGLAS_DEFAULT } from '../src/data/plano'
import { aplicarSalidaChat, ESQUEMA_CHAT, promptChat, type SalidaChat } from '../src/lib/plano/ia/chat'
import { filtrarRevision, propuestaEnTexto } from '../src/lib/plano/ia/revision'
import { armarPropuesta, configVacia, normalizarConfig } from '../src/lib/plano/propuesta'
import { configParaCliente, eleccionVacia, leerEleccion, vistaCliente } from '../src/lib/plano/publico'
import { canonico, esTokenValido, huellaAceptacion, huellaSnapshot, nuevoToken } from '../src/lib/plano/hash'

const HOY = '2026-10-06'
const CONV = `[10:02] Laura: Hola Mike, tengo una panadería y quiero vender mis tortas por internet.
[10:03] Laura: Que la gente pague con PSE y me llegue el pedido.
[10:05] Mike: ¿Cuántos productos manejas?
[10:06] Laura: Unos 30 productos, sin inventario por ahora.`

function salida(extra: Partial<SalidaChat> = {}): SalidaChat {
  return {
    titulo: 'Tienda de La Espiga',
    resumen: 'Necesitas vender tus tortas por internet y cobrar con PSE.',
    cliente: { nombre: 'Laura', empresa: 'Panadería La Espiga', tipo: 'persona', telefono: '3001112233', correo: '' },
    base: 'negocio',
    moneda: 'COP',
    componentes: [
      { id: 'tienda', cantidad: 1, prioridad: 'esencial', cita: 'quiero vender mis tortas por internet', razon: 'Vende en línea', respuestas: [{ pregunta: 'catalogo', opcion: 0 }, { pregunta: 'inventario', opcion: 0 }] },
      { id: 'pagos', cantidad: 1, prioridad: 'esencial', cita: 'Que la gente pague con   PSE', razon: 'Cobra en línea', respuestas: [] },
      { id: 'reportes', cantidad: 1, prioridad: 'extra', cita: 'quiero ver gráficas de ventas', razon: 'Inventada', respuestas: [] },
    ],
    exclusiones: ['Fotografía de productos'],
    preguntasAbiertas: ['¿Haces domicilios?'],
    ...extra,
  }
}

describe('del chat al plano', () => {
  it('el esquema solo deja ids de la tabla', () => {
    expect(ESQUEMA_CHAT.properties.componentes.items.properties.id.enum).toContain('tienda')
    expect(promptChat()).toContain('id "tienda"')
    expect(promptChat()).not.toMatch(/\$\s?\d/)
  })

  it('conserva las citas literales y descarta las inventadas', () => {
    const r = aplicarSalidaChat(salida(), CONV, configVacia(HOY), HOY)
    const tienda = r.config.lineas.find((l) => l.id === 'tienda')!
    expect(tienda.cita).toBe('quiero vender mis tortas por internet')
    // Espacios de más no la invalidan: se compara con espacios colapsados.
    expect(r.config.lineas.find((l) => l.id === 'pagos')!.cita).toBeTruthy()
    expect(r.config.lineas.find((l) => l.id === 'reportes')!.cita).toBeUndefined()
    expect(r.citasDescartadas).toEqual(['quiero ver gráficas de ventas'])
  })

  it('agrega lo que va siempre y usa las respuestas', () => {
    const r = aplicarSalidaChat(salida(), CONV, configVacia(HOY), HOY)
    const ids = r.config.lineas.map((l) => l.id)
    expect(ids).toContain('descubrimiento')
    expect(ids).toContain('entrega')
    expect(r.config.lineas.find((l) => l.id === 'tienda')!.respuestas).toEqual({ catalogo: 0, inventario: 0 })
    expect(r.config.base).toBe('negocio')
    expect(r.config.contacto.contacto.nombre).toBe('Laura')
  })

  it('no pisa lo que Mike ya escribió', () => {
    const actual = normalizarConfig({ titulo: 'Mi título', cliente: { nombre: 'Laura Gómez' } }, HOY)
    const r = aplicarSalidaChat(salida(), CONV, actual, HOY)
    expect(r.config.titulo).toBe('Mi título')
    expect(r.config.cliente.nombre).toBe('Laura Gómez')
  })
})

describe('el cliente difícil', () => {
  const s = armarPropuesta(aplicarSalidaChat(salida(), CONV, configVacia(HOY), HOY).config, REGLAS_DEFAULT, HOY)

  it('describe la propuesta sin horas internas', () => {
    const t = propuestaEnTexto(s)
    expect(t).toContain('Tienda y catálogo')
    expect(t).not.toMatch(/\d+\s?h\b/)
  })

  it('descarta los hallazgos con cifras inventadas', () => {
    const r = filtrarRevision(
      {
        veredicto: 'Bastante blindada.',
        ambiguedades: [
          { donde: 'Tienda', problema: '¿Incluye envíos?', pregunta: '¿Haces domicilios?' },
          { donde: 'Pagos', problema: 'Un domicilio cuesta $15.000 COP', pregunta: '¿Lo cobras?' },
        ],
        riesgos: [],
        premortem: [`Que el anticipo de $${s.plan.pagos[0].monto.toLocaleString('es-CO')} COP llegue tarde.`],
      },
      s.cifras,
      HOY,
    )
    expect(r.ambiguedades).toHaveLength(1)
    expect(r.premortem).toHaveLength(1)
    expect(r.cifrasRechazadas.join()).toContain('15.000')
  })
})

describe('vista del cliente', () => {
  const c = aplicarSalidaChat(salida(), CONV, configVacia(HOY), HOY).config
  const s = armarPropuesta({ ...c, clausulasDesactivadas: ['ia'] }, REGLAS_DEFAULT, HOY)
  const v = vistaCliente(s)
  const texto = JSON.stringify(v)

  it('no filtra citas, horas ni el rango interno', () => {
    expect(texto).not.toContain('quiero vender mis tortas')
    expect(texto).not.toContain('horasTabla')
    expect(texto).not.toContain('"rango"')
    expect(texto).not.toContain('"cifras"')
    expect(texto).not.toContain('"certeza"')
  })

  it('solo muestra las cláusulas activas', () => {
    expect(v.clausulas.map((x) => x.id)).not.toContain('ia')
  })

  it('lee la elección del cliente sin confiar en nada', () => {
    expect(leerEleccion({ version: 'premium', planPago: 'cuotas', numCuotas: '3', lineas: { tienda: 'si', reportes: true } })).toEqual({ planPago: 'cuotas', numCuotas: 3, lineas: { reportes: true } })
  })

  it('corre la fecha de inicio a hoy si ya pasó', () => {
    const base = { ...c, fechaInicio: '2026-09-01' }
    expect(configParaCliente(base, {}, HOY).fechaInicio).toBe(HOY)
    expect(eleccionVacia(c, configParaCliente(c, {}, HOY))).toBe(true)
    expect(eleccionVacia(c, configParaCliente({ ...c, perillas: { ...c.perillas, version: true } }, { version: 'completa' }, HOY))).toBe(c.version === 'completa')
  })
})

describe('huellas', () => {
  it('el JSON canónico no depende del orden de las claves', () => {
    expect(canonico({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonico({ a: [2, { c: 4, d: 3 }], b: 1 }))
    const s = armarPropuesta(normalizarConfig({ titulo: 'x', base: 'presencia' }, HOY), REGLAS_DEFAULT, HOY)
    expect(huellaSnapshot(s)).toBe(huellaSnapshot(JSON.parse(JSON.stringify(s))))
  })

  it('la constancia cambia si cambia cualquier dato', () => {
    const a = huellaAceptacion({ huellaVersion: 'h', nombre: 'Laura Gómez', documento: '123', instante: '2026-10-06T15:00:00.000Z' })
    const b = huellaAceptacion({ huellaVersion: 'h', nombre: 'Laura Gómez', documento: '124', instante: '2026-10-06T15:00:00.000Z' })
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el token tiene la forma esperada', () => {
    const t = nuevoToken()
    expect(esTokenValido(t)).toBe(true)
    expect(esTokenValido('../../etc')).toBe(false)
  })
})
