import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  acercar,
  DISPOSICION_ALTA,
  DISPOSICION_ANCHA,
  fuera,
  rotarIndice,
  solapes,
  tamOptico,
} from '../src/lib/marcas-relieve'
import { MARCAS } from '../src/data/marcas'
import es from '../src/i18n/es'
import en from '../src/i18n/en'

// Mismos tamaños que usa MarcasRelieve.astro: si cambian allí, cambian aquí.
const BASE_ANCHA = 92
const BASE_ALTA = 66

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

describe('disposiciones', () => {
  const tams = (base: number) => MARCAS.map((m) => tamOptico(m.proporcion, base))

  it('hay una cumbre por marca en cada disposición', () => {
    expect(DISPOSICION_ANCHA).toHaveLength(MARCAS.length)
    expect(DISPOSICION_ALTA).toHaveLength(MARCAS.length)
  })

  // Tamaños reales del escenario: escritorio de 1024 a 1280 de contenido y
  // 540 de alto; móvil de 320 a 430 de ancho y 680 de alto.
  for (const ancho of [1024, 1280]) {
    it(`escritorio ${ancho}×540: ningún logo pisa a otro ni se sale`, () => {
      expect(solapes(DISPOSICION_ANCHA, tams(BASE_ANCHA), ancho, 540, 24)).toEqual([])
      expect(fuera(DISPOSICION_ANCHA, tams(BASE_ANCHA), ancho, 540, 12)).toEqual([])
    })
  }

  for (const ancho of [320, 358, 398]) {
    it(`móvil ${ancho}×680: ningún logo pisa a otro ni se sale`, () => {
      expect(solapes(DISPOSICION_ALTA, tams(BASE_ALTA), ancho, 680, 12)).toEqual([])
      expect(fuera(DISPOSICION_ALTA, tams(BASE_ALTA), ancho, 680, 6)).toEqual([])
    })
  }

  it('solapes detecta un choque de verdad', () => {
    const p = [
      { x: 0.5, y: 0.5 },
      { x: 0.52, y: 0.5 },
    ]
    const t = [
      { ancho: 100, alto: 40 },
      { ancho: 100, alto: 40 },
    ]
    expect(solapes(p, t, 1000, 500)).toEqual([[0, 1]])
  })
})

describe('acercar', () => {
  it('no depende de los fps', () => {
    let a = 0
    for (let i = 0; i < 60; i++) a = acercar(a, 1, 1 / 60, 5)
    let b = 0
    for (let i = 0; i < 30; i++) b = acercar(b, 1, 1 / 30, 5)
    expect(a).toBeCloseTo(b, 6)
  })

  it('llega al objetivo y no se pasa', () => {
    const v = acercar(0, 1, 10, 5)
    expect(v).toBeLessThanOrEqual(1)
    expect(v).toBeGreaterThan(0.999)
  })
})

describe('rotarIndice', () => {
  it('da la vuelta en los dos sentidos', () => {
    expect(rotarIndice(5, 1, 6)).toBe(0)
    expect(rotarIndice(0, -1, 6)).toBe(5)
    expect(rotarIndice(2, 1, 6)).toBe(3)
  })
})

describe('datos de marcas', () => {
  it('cada logo existe en public/', () => {
    for (const m of MARCAS) expect(existsSync(join('public', m.logo)), m.logo).toBe(true)
  })

  it('cada marca tiene su ficha en los dos idiomas', () => {
    for (const m of MARCAS) {
      expect(es.home.marcas.fichas[m.slug]).toBeTruthy()
      expect(en.home.marcas.fichas[m.slug]).toBeTruthy()
    }
  })

  it('slugs únicos y tonos en hex (el shader los parsea)', () => {
    expect(new Set(MARCAS.map((m) => m.slug)).size).toBe(MARCAS.length)
    for (const m of MARCAS) expect(m.tono).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
