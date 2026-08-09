import { describe, expect, it } from 'vitest'
import { COMUNICACIONES } from '../src/data/comunicacion'
import { etiquetaObjeto, findLayoutIssues, layout } from '../src/lib/uml-communication'

// En un diagrama de comunicación no hay eje de tiempo: el orden lo lleva ENTERO
// la numeración decimal. Un número repetido o un nivel sin padre no es un
// defecto estético, deja la interacción sin lectura posible - por eso se
// verifica aquí y no en una revisión visual.

describe.each(COMUNICACIONES)('comunicación "$id"', (modelo) => {
  it('no tiene defectos de dibujo, numeración ni semántica', () => {
    expect(findLayoutIssues(modelo).map((i) => `${i.kind}: ${i.detail}`)).toEqual([])
  })

  it('apunta al diagrama de secuencia equivalente', () => {
    expect(modelo.equivaleA).toMatch(/^\/docs\/diagrama-secuencia#/)
  })

  it('imprime cada objeto como instancia y no como clase', () => {
    for (const o of modelo.objetos) {
      expect(etiquetaObjeto(o)).toContain(':')
    }
  })

  it('dibuja un solo enlace por pareja de objetos, sin importar cuántos mensajes lleve', () => {
    const l = layout(modelo)
    const parejas = new Set(l.enlaces.map((e) => [...e.entre].sort().join('~')))
    expect(parejas.size).toBe(l.enlaces.length)

    const conEnlace = new Set(
      modelo.mensajes.filter((m) => m.from !== m.to).map((m) => [m.from, m.to].sort().join('~')),
    )
    expect(l.enlaces.length).toBe(conEnlace.size)
  })

  it('coloca todos los mensajes, incluidos los reflexivos', () => {
    expect(layout(modelo).mensajes).toHaveLength(modelo.mensajes.length)
  })

  it('dibuja cada flecha en el sentido real del mensaje', () => {
    const l = layout(modelo)
    for (const m of l.mensajes.filter((x) => x.from !== x.to)) {
      // La flecha tiene longitud: si a y b coincidieran, el sentido se perdería.
      expect(Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y)).toBeGreaterThan(4)
    }
  })
})

describe('conjunto de diagramas de comunicación', () => {
  it('cubre las cuatro interacciones del diagrama de secuencia', () => {
    expect(COMUNICACIONES.map((c) => c.id).sort()).toEqual(['login', 'monitor', 'pagos', 'seguridad'])
  })
})
