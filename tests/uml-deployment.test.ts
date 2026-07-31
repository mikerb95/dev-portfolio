import { describe, expect, it } from 'vitest'
import { DESPLIEGUES } from '../src/data/despliegue'
import { findLayoutIssues, layout } from '../src/lib/uml-deployment'

describe.each(DESPLIEGUES)('despliegue "$id"', (modelo) => {
  it('no tiene defectos de dibujo ni de notación', () => {
    expect(findLayoutIssues(modelo).map((i) => `${i.kind}: ${i.detail}`)).toEqual([])
  })

  it('declara el protocolo de todos los caminos de comunicación', () => {
    for (const c of modelo.caminos) expect(c.protocolo.trim().length).toBeGreaterThan(0)
  })

  it('despliega al menos un artefacto o nodo anidado en cada nodo', () => {
    for (const n of modelo.nodos) expect(n.contenido?.length ?? 0).toBeGreaterThan(0)
  })

  it('coloca cada elemento contenido dentro de su nodo', () => {
    for (const n of layout(modelo).nodos) {
      for (const e of n.elementos) {
        expect(e.x).toBeGreaterThanOrEqual(n.x)
        expect(e.x + e.w).toBeLessThanOrEqual(n.x + n.w)
        expect(e.y).toBeGreaterThanOrEqual(n.y)
        expect(e.y + e.h).toBeLessThanOrEqual(n.y + n.h)
      }
    }
  })

  it('conecta el grafo entero: ningún nodo queda aislado', () => {
    const vecinos = new Map<string, string[]>()
    for (const c of modelo.caminos) {
      vecinos.set(c.from, [...(vecinos.get(c.from) ?? []), c.to])
      vecinos.set(c.to, [...(vecinos.get(c.to) ?? []), c.from])
    }
    const vistos = new Set([modelo.nodos[0].id])
    const pila = [modelo.nodos[0].id]
    while (pila.length) {
      for (const v of vecinos.get(pila.pop()!) ?? []) {
        if (vistos.has(v)) continue
        vistos.add(v)
        pila.push(v)
      }
    }
    expect(vistos.size).toBe(modelo.nodos.length)
  })
})
