import { describe, expect, it } from 'vitest'
import { translationCoverage, tx, txAll, type Bilingual } from '../src/i18n/bilingual'

// Contrato: un campo de /docs sin traducir se muestra en español en la versión
// inglesa. Nunca vacío. Es lo que permite traducir los 5 módulos de datos poco
// a poco sin dejar la página rota en el intermedio.

describe('tx', () => {
  it('un string plano es español y se devuelve tal cual en ambos idiomas', () => {
    expect(tx('Listado de proyectos', 'es')).toBe('Listado de proyectos')
    expect(tx('Listado de proyectos', 'en')).toBe('Listado de proyectos')
  })

  it('un par bilingüe devuelve el idioma pedido', () => {
    const v: Bilingual = { es: 'Listado de proyectos', en: 'Project listing' }
    expect(tx(v, 'es')).toBe('Listado de proyectos')
    expect(tx(v, 'en')).toBe('Project listing')
  })

  it('una traducción vacía cae al español (hueco > idioma equivocado)', () => {
    expect(tx({ es: 'Hola', en: '' }, 'en')).toBe('Hola')
    expect(tx({ es: 'Hola', en: '   ' }, 'en')).toBe('Hola')
  })

  it('undefined sigue siendo undefined (campo opcional ausente)', () => {
    expect(tx(undefined, 'en')).toBeUndefined()
  })
})

describe('txAll', () => {
  it('resuelve listas mezclando traducidos y sin traducir', () => {
    const list: Bilingual[] = ['Sin traducir', { es: 'Con par', en: 'Translated' }]
    expect(txAll(list, 'en')).toEqual(['Sin traducir', 'Translated'])
    expect(txAll(list, 'es')).toEqual(['Sin traducir', 'Con par'])
  })
})

describe('translationCoverage', () => {
  it('cuenta un par bilingüe como un campo traducido', () => {
    expect(translationCoverage({ a: { es: 'x', en: 'y' } })).toEqual({ translated: 1, total: 1 })
  })

  it('cuenta un string plano como campo sin traducir', () => {
    expect(translationCoverage({ a: 'solo español' })).toEqual({ translated: 0, total: 1 })
  })

  it('recorre listas y objetos anidados', () => {
    const data = {
      items: [
        { titulo: { es: 'a', en: 'b' }, nota: 'sin traducir' },
        { titulo: { es: 'c', en: 'd' } },
      ],
    }
    expect(translationCoverage(data)).toEqual({ translated: 2, total: 3 })
  })

  it('ignora números, booleanos y nulos: solo mide texto', () => {
    expect(translationCoverage({ n: 3, b: true, x: null })).toEqual({ translated: 0, total: 0 })
  })

  it('un objeto con es/en más otras claves NO es un par bilingüe', () => {
    // p. ej. { es: 'x', en: 'y', id: 'z' } es un registro, no una traducción.
    const r = translationCoverage({ es: 'x', en: 'y', id: 'z' })
    expect(r).toEqual({ translated: 0, total: 3 })
  })
})
