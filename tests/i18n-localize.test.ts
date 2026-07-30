import { describe, expect, it } from 'vitest'
import { hasRowTranslation, pickLocalized } from '../src/i18n/localize'

// El contrato que estos tests fijan: una fila de BD sin traducir se muestra en
// español, NUNCA en blanco. Un fallo aquí no rompe la página — la vacía, que
// es peor porque parece intencional. Ver docs/plan-i18n-en.md §7.

const row = {
  title: 'Portal de pedidos Altiplano',
  titleEn: 'Altiplano ordering portal',
  description: 'Tienda en línea con pagos y despacho por zonas.',
  descriptionEn: null as string | null,
  techStack: 'Astro,Turso',
}

describe('pickLocalized', () => {
  it('en español devuelve el campo base, ignorando la traducción', () => {
    expect(pickLocalized(row, 'title', 'es')).toBe('Portal de pedidos Altiplano')
  })

  it('en inglés devuelve la traducción cuando existe', () => {
    expect(pickLocalized(row, 'title', 'en')).toBe('Altiplano ordering portal')
  })

  it('cae al español cuando la traducción es null', () => {
    expect(pickLocalized(row, 'description', 'en')).toBe('Tienda en línea con pagos y despacho por zonas.')
  })

  it('cae al español cuando la traducción es undefined (columna ausente)', () => {
    expect(pickLocalized({ title: 'Hola' }, 'title', 'en')).toBe('Hola')
  })

  it('cae al español con cadena vacía o solo espacios (el admin la dejó en blanco)', () => {
    expect(pickLocalized({ title: 'Hola', titleEn: '' }, 'title', 'en')).toBe('Hola')
    expect(pickLocalized({ title: 'Hola', titleEn: '   ' }, 'title', 'en')).toBe('Hola')
  })

  it('un valor base null sigue siendo null si no hay traducción (no inventa texto)', () => {
    expect(pickLocalized({ description: null, descriptionEn: null }, 'description', 'en')).toBeNull()
  })

  it('no toca campos que no se traducen', () => {
    expect(pickLocalized(row, 'techStack', 'en')).toBe('Astro,Turso')
  })
})

describe('hasRowTranslation', () => {
  it('en español siempre existe', () => {
    expect(hasRowTranslation({ title: 'x' }, ['title'], 'es')).toBe(true)
  })

  it('true cuando todos los campos requeridos están traducidos', () => {
    expect(hasRowTranslation(row, ['title'], 'en')).toBe(true)
  })

  it('false si falta alguno de los requeridos', () => {
    expect(hasRowTranslation(row, ['title', 'description'], 'en')).toBe(false)
  })

  it('false con traducción vacía: no se anuncia una URL /en/ que saldría en español', () => {
    expect(hasRowTranslation({ title: 'x', titleEn: '  ' }, ['title'], 'en')).toBe(false)
  })
})
