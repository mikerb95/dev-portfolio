import { describe, expect, it } from 'vitest'
import { totalCommits, type Iteracion } from '../src/data/iteraciones'
import { ITERACIONES } from '../src/data/iteraciones-portfolio'

const base: Omit<Iteracion, 'id' | 'commits'> = {
  fase: 'F',
  nombre: 'n',
  rango: 'r',
  ghSince: '2026-10-06',
  ghUntil: '2026-10-07',
  resumen: 's',
  historias: [],
}

describe('totalCommits', () => {
  it('ignora las iteraciones sin conteo en vez de dar NaN', () => {
    const its: Iteracion[] = [
      { ...base, id: 'a', commits: 10 },
      { ...base, id: 'b' },
      { ...base, id: 'c', commits: 5 },
    ]
    expect(totalCommits(its)).toBe(15)
  })

  it('con los datos reales del deck da un entero positivo', () => {
    // El vigía encontró "NaN commits" publicado en /docs/presentacion: cuatro
    // iteraciones del mismo día entraron sin `commits`.
    const total = totalCommits(ITERACIONES)
    expect(Number.isInteger(total)).toBe(true)
    expect(total).toBeGreaterThan(0)
  })
})
