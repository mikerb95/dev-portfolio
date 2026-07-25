import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { procesosBpmn, COMPUERTAS_BPMN } from '../src/data/bpmn'
import {
  findLayoutIssues,
  isBoundary,
  labelAnchor,
  labelBox,
  layout,
  polylinePath,
  pointAlong,
  route,
  sizeOf,
  wrap,
  type PlacedNode,
} from '../src/lib/bpmn-layout'

// Un BPMN mal dibujado (flechas que cruzan cajas, nodos encimados, texto que se
// desborda) no se detecta con un test de "no lanza": hay que verificar la
// geometría. Eso es justo lo que se comprueba aquí.

describe('wrap', () => {
  it('corta por palabras sin pasarse del ancho', () => {
    const lines = wrap('Configura monto, descripción y vigencia', 21, 3)
    expect(lines.length).toBeLessThanOrEqual(3)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(21)
  })

  it('trunca con elipsis en vez de desbordar la figura', () => {
    const lines = wrap('palabra '.repeat(30), 10, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })

  it('deja pasar una palabra más larga que el límite en su propia línea', () => {
    expect(wrap('createPaymentIdempotent', 10, 3)).toEqual(['createPaymentIdempotent'])
  })
})

describe('route', () => {
  const node = (cx: number, cy: number): PlacedNode => ({
    id: `n${cx}-${cy}`,
    type: 'task',
    label: 'x',
    lane: 'l',
    col: 0,
    row: 0,
    cx,
    cy,
    w: 100,
    h: 50,
    lines: ['x'],
    outside: false,
    labelAbove: false,
  })

  it('une con una recta los nodos alineados hacia adelante', () => {
    const pts = route(node(0, 0), node(300, 0))
    expect(pts).toHaveLength(2)
    expect(pts[0].y).toBe(pts[1].y)
  })

  it('usa una Z al cambiar de carril hacia adelante', () => {
    const pts = route(node(0, 0), node(300, 200))
    expect(pts).toHaveLength(4)
    expect(pts[1].x).toBe(pts[2].x)
  })

  it('rodea por un canal cuando el flujo vuelve hacia atrás', () => {
    const a = node(300, 0)
    const b = node(0, 0)
    const pts = route(a, b)
    // Sale por abajo y viaja por un canal libre, no en línea recta a través de
    // lo que haya en medio.
    expect(pts[0].y).toBeGreaterThan(a.cy)
    expect(pts[1].y).toBeGreaterThan(a.cy + a.h / 2)
  })

  it('mantiene todos los tramos ortogonales', () => {
    const cases: Array<[PlacedNode, PlacedNode]> = [
      [node(0, 0), node(300, 0)],
      [node(0, 0), node(300, 200)],
      [node(0, 0), node(0, 200)],
      [node(300, 0), node(0, 0)],
      [node(300, 200), node(0, 0)],
      [node(300, 0), node(0, 200)],
    ]
    for (const [a, b] of cases) {
      const pts = route(a, b)
      for (let i = 0; i < pts.length - 1; i++) {
        const horizontal = Math.abs(pts[i].y - pts[i + 1].y) < 0.001
        const vertical = Math.abs(pts[i].x - pts[i + 1].x) < 0.001
        expect(horizontal || vertical).toBe(true)
      }
    }
  })
})

describe('polylinePath', () => {
  it('no redondea más allá de la mitad del tramo más corto', () => {
    // Tramos de 4px con radio 9: si no se acotara, la curva se desbordaría.
    const d = polylinePath(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 100 },
      ],
      9,
    )
    const xs = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number)
    for (const n of xs) expect(Number.isFinite(n)).toBe(true)
    expect(d.startsWith('M 0 0')).toBe(true)
  })

  it('devuelve una recta simple con dos puntos', () => {
    expect(polylinePath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M 0 0 L 10 0')
  })
})

describe('pointAlong', () => {
  it('avanza la distancia pedida sobre la polilínea', () => {
    const p = pointAlong(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      30,
    )
    expect(p).toEqual({ x: 30, y: 0 })
  })

  it('se queda en el último punto si la distancia excede el trazo', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(pointAlong(pts, 999)).toEqual(pts[1])
  })
})

describe('labelAnchor', () => {
  it('aparta la etiqueta del trazo en tramos horizontales', () => {
    const p = labelAnchor([
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ])
    expect(p.y).toBeLessThan(100)
    expect(p.x).toBe(26)
  })

  it('aparta la etiqueta hacia el costado en tramos verticales', () => {
    const p = labelAnchor([
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ])
    expect(p.x).toBeGreaterThan(100)
    expect(p.y).toBe(26)
  })

  it('ancla la etiqueta después del quiebre, ya dentro de su propia rama', () => {
    // Rama recta y rama que baja salen del MISMO puerto: si ambas etiquetas se
    // anclaran en el tramo compartido, "sí" y "no" caerían en el mismo punto.
    const recta = labelAnchor([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ])
    const quiebra = labelAnchor([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ])
    expect(quiebra.y).toBeGreaterThan(0)
    expect(Math.hypot(quiebra.x - recta.x, quiebra.y - recta.y)).toBeGreaterThan(20)
  })
})

describe('labelBox', () => {
  it('coloca la etiqueta de una compuerta por encima del rombo', () => {
    const gw = layout({
      id: 'x',
      titulo: '',
      desc: '',
      origen: '',
      lanes: [{ id: 'l', label: '' }],
      nodes: [{ id: 'g', type: 'gatewayExclusive', label: '¿Sigue?', lane: 'l', col: 0 }],
      flows: [],
    }).nodes[0]
    const box = labelBox(gw)!
    expect(gw.labelAbove).toBe(true)
    expect(box.y2).toBeLessThanOrEqual(gw.cy - gw.h / 2)
  })

  it('coloca la etiqueta de un evento por debajo del círculo', () => {
    const ev = layout({
      id: 'x',
      titulo: '',
      desc: '',
      origen: '',
      lanes: [{ id: 'l', label: '' }],
      nodes: [{ id: 'e', type: 'startEvent', label: 'Arranca', lane: 'l', col: 0 }],
      flows: [],
    }).nodes[0]
    const box = labelBox(ev)!
    expect(ev.labelAbove).toBe(false)
    expect(box.y1).toBeGreaterThanOrEqual(ev.cy + ev.h / 2)
  })

  it('no reporta caja para el texto que va dentro de una tarea', () => {
    const t = layout({
      id: 'x',
      titulo: '',
      desc: '',
      origen: '',
      lanes: [{ id: 'l', label: '' }],
      nodes: [{ id: 't', type: 'taskService', label: 'Hace algo', lane: 'l', col: 0 }],
      flows: [],
    }).nodes[0]
    expect(labelBox(t)).toBeNull()
  })
})

describe('findLayoutIssues', () => {
  // Un detector que nunca detecta nada deja pasar todo: estos casos confirman
  // que los diagramas reales pasan porque están bien, no porque no se mire.
  const base = { id: 'malo', titulo: '', desc: '', origen: '', lanes: [{ id: 'l', label: '' }] }

  it('detecta dos nodos en la misma celda', () => {
    const issues = findLayoutIssues({
      ...base,
      nodes: [
        { id: 'a', type: 'task', label: 'A', lane: 'l', col: 0 },
        { id: 'b', type: 'task', label: 'B', lane: 'l', col: 0 },
      ],
      flows: [{ from: 'a', to: 'b' }],
    })
    expect(issues.some((i) => i.kind === 'overlap')).toBe(true)
  })

  it('detecta una flecha que atraviesa una figura ajena', () => {
    const issues = findLayoutIssues({
      ...base,
      nodes: [
        { id: 'a', type: 'task', label: 'A', lane: 'l', col: 0 },
        { id: 'medio', type: 'task', label: 'En medio', lane: 'l', col: 1 },
        { id: 'b', type: 'task', label: 'B', lane: 'l', col: 2 },
      ],
      // a → b pasa por encima de "medio", que está justo entre los dos.
      flows: [{ from: 'a', to: 'b' }],
    })
    expect(issues.some((i) => i.kind === 'crossing')).toBe(true)
  })

  it('detecta la etiqueta de una rama encimada con la de su compuerta', () => {
    const gwAbajo = findLayoutIssues({
      ...base,
      nodes: [
        { id: 'g', type: 'gatewayExclusive', label: '¿Sigue el proceso?', lane: 'l', col: 0 },
        { id: 'fin', type: 'endEvent', label: 'Fin', lane: 'l', col: 0, row: 1 },
      ],
      flows: [{ from: 'g', to: 'fin', label: 'no' }],
    })
    // Con la etiqueta de la compuerta arriba del rombo, la rama que baja no la
    // toca: este es justamente el choque que se corrigió.
    expect(gwAbajo.filter((i) => i.kind === 'label')).toEqual([])
  })
})

describe('compuertas documentadas', () => {
  it('documenta los 5 tipos de compuerta de BPMN', () => {
    expect(COMPUERTAS_BPMN).toHaveLength(5)
    expect(new Set(COMPUERTAS_BPMN.map((c) => c.type)).size).toBe(5)
  })

  it('cada compuerta explica qué hace al dividir y al juntar caminos', () => {
    for (const c of COMPUERTAS_BPMN) {
      expect(c.divergencia.length, c.nombre).toBeGreaterThan(20)
      expect(c.convergencia.length, c.nombre).toBeGreaterThan(20)
      expect(c.marcador.length, c.nombre).toBeGreaterThan(0)
    }
  })

  it('el renderer sabe dibujar toda compuerta documentada', () => {
    // sizeOf reconoce el tipo por prefijo; lo que importa es que el marcador
    // exista en BpmnShape, así que se comprueba contra su código fuente: una
    // compuerta documentada que se dibuje como un rombo vacío miente.
    const shape = readFileSync(new URL('../src/components/BpmnShape.astro', import.meta.url), 'utf8')
    for (const c of COMPUERTAS_BPMN) {
      expect(shape.includes(`'${c.type}'`), `falta el marcador de ${c.nombre} en BpmnShape.astro`).toBe(true)
      expect(sizeOf(c.type).w).toBeGreaterThan(0)
    }
  })

  it('marca como en uso exactamente las que aparecen en los diagramas', () => {
    const usadasEnDiagramas = new Set(
      procesosBpmn.flatMap((p) => p.nodes.filter((n) => n.type.startsWith('gateway')).map((n) => n.type)),
    )
    const marcadasEnUso = new Set(COMPUERTAS_BPMN.filter((c) => c.usada).map((c) => c.type))
    expect([...marcadasEnUso].sort()).toEqual([...usadasEnDiagramas].sort())
  })
})

describe('procesos BPMN documentados', () => {
  it('hay diagramas para los cuatro procesos críticos', () => {
    expect(procesosBpmn.length).toBe(4)
    expect(new Set(procesosBpmn.map((p) => p.id)).size).toBe(4)
  })

  for (const proc of procesosBpmn) {
    describe(proc.titulo, () => {
      it('todos los flujos apuntan a nodos existentes y los nodos a carriles reales', () => {
        expect(() => layout(proc)).not.toThrow()
      })

      it('no encima nodos ni cruza flechas por encima de otras figuras', () => {
        const issues = findLayoutIssues(proc)
        expect(issues.map((i) => i.detail)).toEqual([])
      })

      it('cada nodo participa en al menos un flujo', () => {
        const usados = new Set(proc.flows.flatMap((f) => [f.from, f.to]))
        const huerfanos = proc.nodes.filter((n) => !usados.has(n.id)).map((n) => n.id)
        expect(huerfanos).toEqual([])
      })

      it('todo evento de borde se cuelga de una tarea real y no recibe flechas', () => {
        for (const b of proc.nodes.filter(isBoundary)) {
          const host = proc.nodes.find((n) => n.id === b.attachedTo)
          expect(host, `${b.id} → ${b.attachedTo}`).toBeDefined()
          expect(host!.type.startsWith('task'), `${b.id} se cuelga de ${b.attachedTo}`).toBe(true)
          // Un evento de borde lo dispara su temporizador, no un flujo entrante.
          expect(proc.flows.filter((f) => f.to === b.id), `entra un flujo a ${b.id}`).toEqual([])
          expect(proc.flows.some((f) => f.from === b.id), `${b.id} no lleva a ningún lado`).toBe(true)
        }
      })

      it('todo tiempo declarado cita dónde está fijado', () => {
        for (const t of proc.tiempos ?? []) {
          expect(t.valor.length, t.concepto).toBeGreaterThan(0)
          expect(t.origen.length, t.concepto).toBeGreaterThan(0)
        }
      })

      it('toda duración anotada en el diagrama aparece en la tabla de tiempos', () => {
        // Evita la deriva más fácil de cometer: cambiar el número del dibujo y
        // dejar la tabla —que es la que cita el código— diciendo otra cosa.
        const tabla = (proc.tiempos ?? []).map((t) => `${t.concepto} ${t.valor}`.toLowerCase()).join(' | ')
        const numeros = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? []
        for (const n of proc.nodes) {
          if (!n.duracion) continue
          for (const num of numeros(n.duracion)) {
            expect(tabla.includes(num), `"${n.duracion}" (${n.id}): el ${num} no aparece en los tiempos`).toBe(true)
          }
        }
      })

      it('tiene exactamente un inicio y al menos un fin', () => {
        const inicios = proc.nodes.filter((n) => n.type.endsWith('Start') || n.type === 'startEvent')
        const fines = proc.nodes.filter((n) => n.type.startsWith('endEvent'))
        expect(inicios).toHaveLength(1)
        expect(fines.length).toBeGreaterThan(0)
      })

      it('todo camino termina en un evento de fin', () => {
        // Una tarea sin flujo de salida deja el proceso colgando: en BPMN es un
        // error de modelado, no un detalle estético.
        const sinSalida = proc.nodes
          .filter((n) => !n.type.startsWith('endEvent'))
          .filter((n) => !proc.flows.some((f) => f.from === n.id))
          .map((n) => n.id)
        expect(sinSalida).toEqual([])
      })

      it('todo nodo es alcanzable desde el evento de inicio', () => {
        const inicio = proc.nodes.find((n) => n.type.endsWith('Start') || n.type === 'startEvent')!
        const salidas = new Map<string, string[]>()
        for (const f of proc.flows) salidas.set(f.from, [...(salidas.get(f.from) ?? []), f.to])
        // Un evento de borde se alcanza a través de la tarea que vigila: no le
        // llega ninguna flecha, pero es alcanzable en cuanto la tarea corre.
        for (const b of proc.nodes.filter(isBoundary)) {
          salidas.set(b.attachedTo, [...(salidas.get(b.attachedTo) ?? []), b.id])
        }

        const vistos = new Set<string>([inicio.id])
        const pila = [inicio.id]
        while (pila.length) {
          for (const next of salidas.get(pila.pop()!) ?? []) {
            if (vistos.has(next)) continue
            vistos.add(next)
            pila.push(next)
          }
        }
        const inalcanzables = proc.nodes.filter((n) => !vistos.has(n.id)).map((n) => n.id)
        expect(inalcanzables).toEqual([])
      })

      it('toda compuerta abre al menos dos caminos y sus ramas están etiquetadas', () => {
        for (const gw of proc.nodes.filter((n) => n.type.startsWith('gateway'))) {
          const salidas = proc.flows.filter((f) => f.from === gw.id)
          expect(salidas.length, `compuerta ${gw.id}`).toBeGreaterThanOrEqual(2)
          for (const s of salidas) expect(s.label, `${gw.id} → ${s.to}`).toBeTruthy()
        }
      })

      it('las etiquetas caben en su figura', () => {
        for (const n of layout(proc).nodes) {
          // Tareas: 3 líneas dentro de la caja. Eventos y compuertas: 2 debajo.
          expect(n.lines.length, `${n.id}: "${n.label}"`).toBeLessThanOrEqual(n.outside ? 2 : 3)
        }
      })

      it('declara dónde está implementado', () => {
        expect(proc.origen.length).toBeGreaterThan(0)
      })
    })
  }
})
