import { describe, it, expect } from 'vitest'
import {
  entradaDesdeHitos,
  htmlCinta,
  htmlMini,
  indiceDe,
  lecturaDia,
  modeloCinta,
  ventanasBitacora,
  type EntradaCinta,
} from '../src/lib/motion/cinta-ep'
import { consultaBandeja, coincideBandeja } from '../src/lib/motion/ep-datos'
import { computeHitos } from '../src/lib/sena-ep'

// La cinta de /ep dibuja la ficha real (servidor) y la proyección de la
// calculadora (navegador) con el mismo modelo. Estas pruebas fijan que lo
// dibujado coincide con las fechas que la página publica en sus tablas.

const FICHA: EntradaCinta = {
  inicioIso: '2026-09-09',
  finIso: '2027-03-08',
  bitacoras: ventanasBitacora('2026-09-09', 6),
  visitas: [
    { n: 1, titulo: 'Concertación', desdeIso: '2026-09-09', hastaIso: '2026-10-08' },
    { n: 2, titulo: 'Seguimiento', desdeIso: '2026-12-01', hastaIso: '2026-12-07' },
    { n: 3, titulo: 'Final y cierre', desdeIso: '2027-03-01', hastaIso: '2027-03-08' },
  ],
}

describe('ventanas de bitácora', () => {
  it('una por mes, cerrando el día antes de la siguiente', () => {
    const v = ventanasBitacora('2026-09-09', 6)
    expect(v.map((x) => [x.desdeIso, x.hastaIso])).toEqual([
      ['2026-09-09', '2026-10-08'],
      ['2026-10-09', '2026-11-08'],
      ['2026-11-09', '2026-12-08'],
      ['2026-12-09', '2027-01-08'],
      ['2027-01-09', '2027-02-08'],
      ['2027-02-09', '2027-03-08'],
    ])
  })
})

describe('modelo de la ficha', () => {
  const c = modeloCinta(FICHA)

  it('180 días entre inicio y fin, una raya por día', () => {
    expect(c.total).toBe(180)
    expect(c.dias).toHaveLength(181)
    expect(c.dias[0].iso).toBe('2026-09-09')
    expect(c.dias[180].iso).toBe('2027-03-08')
  })

  it('cada día cae en exactamente una ventana y no sobra cola', () => {
    expect(c.dias.every((d) => d.bitacora !== null)).toBe(true)
    expect(c.filas).toHaveLength(6)
  })

  it('los cierres inhábiles proponen el hábil anterior (mismo aviso que la tabla)', () => {
    const b2 = c.bitacoras[1]
    expect(b2.cierreIso).toBe('2026-11-08')
    expect(b2.motivo).toBe('Cae domingo')
    expect(b2.entregaIso).toBe('2026-11-06')
    const b3 = c.bitacoras[2]
    expect(b3.motivo).toBe('Festivo: Inmaculada Concepción')
    expect(b3.entregaIso).toBe('2026-12-07')
    expect(c.dias.find((d) => d.iso === '2026-11-06')!.entrega).toBe(2)
  })

  it('las filas móviles nunca pasan de 31 columnas', () => {
    expect(Math.max(...c.dias.map((d) => d.colm))).toBeLessThanOrEqual(31)
    expect(c.dias[0]).toMatchObject({ fila: 1, colm: 1 })
    expect(c.dias.find((d) => d.iso === '2026-10-09')).toMatchObject({ fila: 2, colm: 1 })
  })

  it('la regla de meses cubre la cinta entera sin huecos', () => {
    expect(c.meses[0]).toMatchObject({ label: 'sep', desde: 0 })
    expect(c.meses.reduce((s, m) => s + m.span, 0)).toBe(181)
    expect(c.meses.map((m) => m.label)).toContain('ene 2027')
  })

  it('las etiquetas de las visitas se alinean hacia dentro en los extremos', () => {
    expect(c.visitas.map((v) => v.alinear)).toEqual(['start', 'center', 'end'])
  })

  it('el índice de hoy solo existe dentro de la etapa', () => {
    expect(indiceDe(c, '2026-10-01')).toBe(22)
    expect(indiceDe(c, '2026-09-08')).toBeNull()
    expect(indiceDe(c, '2027-03-09')).toBeNull()
  })
})

describe('lectura de un día', () => {
  const c = modeloCinta(FICHA)

  it('un cierre en domingo avisa el día real de entrega', () => {
    const l = lecturaDia(c, indiceDe(c, '2026-11-08')!)
    expect(l.titulo).toBe('dom 08-nov-2026 · día 60 de 180')
    expect(l.lineas.map((x) => x.texto)).toEqual(['Entrega de la bitácora 2', 'Cae domingo: entrega el vie 06-nov'])
  })

  it('un festivo cualquiera se nombra', () => {
    const l = lecturaDia(c, indiceDe(c, '2026-10-12')!)
    expect(l.lineas.map((x) => x.texto)).toContain('Festivo: Día de la Raza')
  })

  it('hoy se antepone al título', () => {
    expect(lecturaDia(c, 22, '2026-10-01').titulo.startsWith('Hoy · ')).toBe(true)
  })

  it('la ventana de una visita se distingue de una visita de un día', () => {
    expect(lecturaDia(c, indiceDe(c, '2026-12-03')!).lineas.map((x) => x.texto)).toContain(
      'Ventana de la visita 2 · Seguimiento',
    )
  })
})

describe('cinta de la calculadora', () => {
  const hitos = computeHitos('tecnologo', '2026-09-09')
  const c = modeloCinta(entradaDesdeHitos('2026-09-09', hitos))

  it('marca cada bitácora en la fecha que da computeHitos, no en otra', () => {
    const fechas = hitos.filter((h) => h.categoria === 'bitacora').map((h) => h.fecha.toISOString().slice(0, 10))
    expect(c.bitacoras.map((b) => b.cierreIso)).toEqual(fechas)
  })

  it('se alarga hasta el último hito y los días sobrantes van a la fila "Fin"', () => {
    const ultimo = hitos.at(-1)!.fecha.toISOString().slice(0, 10)
    expect(c.finIso).toBe(ultimo)
    expect(c.filas.at(-1)).toMatchObject({ label: 'Fin', bitacora: null })
    expect(c.dias.at(-1)!.fila).toBe(7)
  })

  it('las tres visitas aparecen como días sueltos', () => {
    expect(c.visitas.map((v) => [v.n, v.desde === v.hasta])).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ])
  })
})

describe('marcado', () => {
  const c = modeloCinta(FICHA)
  const html = htmlCinta(c)

  it('una raya por día con sus dos posiciones', () => {
    expect(html.match(/class="ct-d"/g)).toHaveLength(181)
    expect(html).toContain('data-iso="2026-11-08" data-inh="domingo" data-cierre="2"')
    expect(html).toContain('--col:61;--fila:2;--colm:32')
  })

  it('la miniatura de una bitácora tiene sus días y marca la entrega adelantada', () => {
    const mini = htmlMini(c, 2)
    expect(mini.match(/<i /g)).toHaveLength(31)
    expect(mini).toContain('data-iso="2026-11-06" data-entrega')
  })
})

describe('bandeja del instructor', () => {
  it('la búsqueda es el tipo y el número del asunto', () => {
    expect(consultaBandeja('Bitácora 4, CC 1, Ficha 2, Ana Pérez')).toBe('Bitácora 4')
    expect(consultaBandeja('Formato Visita 2, CC 1, Ficha 2, Ana')).toBe('Formato Visita 2')
    expect(consultaBandeja('')).toBe('')
  })

  it('solo encuentra los asuntos que empiezan con el formato', () => {
    expect(coincideBandeja('Bitácora 4, CC 9, Ficha 3114731, Laura', 'Bitácora 4')).toBe(true)
    expect(coincideBandeja('bitacora 4 laura', 'Bitácora 4')).toBe(false)
    expect(coincideBandeja('RE: Bitácora 4', 'Bitácora 4')).toBe(false)
    expect(coincideBandeja('Bitácora 40, CC 9', 'Bitácora 4')).toBe(false)
  })
})
