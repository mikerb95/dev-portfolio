import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tamOptico } from '../src/lib/marcas-logos'
import { MARCAS } from '../src/data/marcas'
import es from '../src/i18n/es'
import en from '../src/i18n/en'

describe('tamOptico', () => {
  it('un logo cuadrado mide la base', () => {
    const t = tamOptico(1, 90)
    expect(t.alto).toBeCloseTo(90)
    expect(t.ancho).toBeCloseTo(90)
  })

  it('compensa: el alargado es más bajo pero más ancho, y su área queda cerca', () => {
    const cuadrado = tamOptico(1, 90)
    const largo = tamOptico(4.88, 90)
    expect(largo.alto).toBeLessThan(cuadrado.alto)
    expect(largo.ancho).toBeGreaterThan(cuadrado.ancho)
    const razon = (largo.ancho * largo.alto) / (cuadrado.ancho * cuadrado.alto)
    // Ni "mismo alto" (razón 4.9) ni "misma área" (razón 1).
    expect(razon).toBeGreaterThan(1)
    expect(razon).toBeLessThan(1.6)
  })

  it('respeta la proporción del logo', () => {
    const t = tamOptico(2.5, 70)
    expect(t.ancho / t.alto).toBeCloseTo(2.5)
  })
})

describe('datos de marcas', () => {
  it('cada logo existe en public/', () => {
    for (const m of MARCAS) expect(existsSync(join('public', m.logo)), m.logo).toBe(true)
  })

  it('cada marca tiene su texto en los dos idiomas', () => {
    for (const m of MARCAS) {
      expect(es.home.marcas.fichas[m.slug]).toBeTruthy()
      expect(en.home.marcas.fichas[m.slug]).toBeTruthy()
    }
  })

  it('slugs únicos y enlaces https', () => {
    expect(new Set(MARCAS.map((m) => m.slug)).size).toBe(MARCAS.length)
    for (const m of MARCAS) expect(m.url).toMatch(/^https:\/\//)
  })
})
