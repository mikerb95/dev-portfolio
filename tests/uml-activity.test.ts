import { describe, expect, it } from 'vitest'
import { ACTIVIDADES } from '../src/data/actividades'
import { findLayoutIssues, layout, route, type PlacedActivityNode } from '../src/lib/uml-activity'

// El diagrama se genera, no se dibuja a mano: el único modo de saber que sale
// legible y que es UML correcto es comprobar la geometría y las reglas de la
// notación aquí. Un solapamiento o una decisión sin guarda son defectos que en
// una revisión visual se escapan y en la sustentación no.

const nodo = (cx: number, cy: number, w = 100, h = 40): PlacedActivityNode =>
  ({ id: 'x', type: 'action', particion: 'p', fila: 0, cx, cy, w, h, lines: [], labelX: cx, labelY: cy, labelAlign: 'middle' })

describe('ruteo de transiciones', () => {
  it('traza una recta vertical entre nodos de la misma columna', () => {
    const pts = route(nodo(100, 100), nodo(100, 220))
    expect(pts).toEqual([
      { x: 100, y: 120 },
      { x: 100, y: 200 },
    ])
  })

  it('traza una recta horizontal entre nodos de la misma fila', () => {
    const pts = route(nodo(100, 100), nodo(400, 100))
    expect(pts[0]).toEqual({ x: 150, y: 100 })
    expect(pts.at(-1)).toEqual({ x: 350, y: 100 })
  })

  it('baja por un canal lateral cuando la transición trae desvío explícito', () => {
    const pts = route(nodo(100, 100), nodo(100, 400), 80)
    // Sale por la derecha, baja por x=180 y entra por la cara que mira al canal.
    expect(pts[0]).toEqual({ x: 150, y: 100 })
    expect(pts[1].x).toBe(180)
    expect(pts[2].x).toBe(180)
    expect(pts.at(-1)).toEqual({ x: 150, y: 400 })
  })

  it('rodea por un canal cuando el flujo vuelve hacia arriba', () => {
    const pts = route(nodo(100, 400), nodo(100, 100))
    expect(pts).toHaveLength(4)
    // Nunca sube por encima de la propia columna: se aparta primero.
    expect(pts[1].x).toBeGreaterThan(150)
  })
})

describe.each(ACTIVIDADES)('actividad "$id"', (modelo) => {
  it('no tiene defectos de dibujo ni de notación', () => {
    const issues = findLayoutIssues(modelo)
    expect(issues.map((i) => `${i.kind}: ${i.detail}`)).toEqual([])
  })

  it('declara un nodo inicial y al menos un final de actividad', () => {
    expect(modelo.nodes.filter((n) => n.type === 'initial')).toHaveLength(1)
    expect(modelo.nodes.some((n) => n.type === 'activityFinal')).toBe(true)
  })

  it('cita dónde vive en el código', () => {
    expect(modelo.origen.length).toBeGreaterThan(10)
  })

  it('todo nodo es alcanzable desde el inicial', () => {
    const inicial = modelo.nodes.find((n) => n.type === 'initial')!
    const salidas = new Map<string, string[]>()
    for (const e of modelo.edges) salidas.set(e.from, [...(salidas.get(e.from) ?? []), e.to])

    const vistos = new Set<string>([inicial.id])
    const pila = [inicial.id]
    while (pila.length) {
      for (const destino of salidas.get(pila.pop()!) ?? []) {
        if (vistos.has(destino)) continue
        vistos.add(destino)
        pila.push(destino)
      }
    }
    const huerfanos = modelo.nodes.filter((n) => !vistos.has(n.id)).map((n) => n.id)
    expect(huerfanos).toEqual([])
  })

  it('produce un lienzo con área positiva', () => {
    const l = layout(modelo)
    expect(l.w).toBeGreaterThan(0)
    expect(l.h).toBeGreaterThan(0)
    expect(l.nodes).toHaveLength(modelo.nodes.length)
  })
})
