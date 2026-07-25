import { describe, it, expect } from 'vitest'
import { procesosBpmn } from '../src/data/bpmn'
import {
  findLayoutIssues,
  layout,
  polylinePath,
  pointAlong,
  route,
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

      it('tiene exactamente un inicio y al menos un fin', () => {
        const inicios = proc.nodes.filter((n) => n.type.endsWith('Start') || n.type === 'startEvent')
        const fines = proc.nodes.filter((n) => n.type.startsWith('endEvent'))
        expect(inicios).toHaveLength(1)
        expect(fines.length).toBeGreaterThan(0)
      })

      it('todo nodo es alcanzable desde el evento de inicio', () => {
        const inicio = proc.nodes.find((n) => n.type.endsWith('Start') || n.type === 'startEvent')!
        const salidas = new Map<string, string[]>()
        for (const f of proc.flows) salidas.set(f.from, [...(salidas.get(f.from) ?? []), f.to])

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
