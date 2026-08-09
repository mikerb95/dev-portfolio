import { describe, expect, it } from 'vitest'
import {
  PIN_DIGITS,
  PIN_LENGTH,
  PIN_LETTERS,
  PIN_SPACE_SIZE,
  PinExhaustedError,
  generatePin,
  isPinShape,
  normalizePin,
  randomPin,
} from '../src/lib/present/pin'
import { RESERVED_ROOT_SEGMENTS, isReservedSegment } from '../src/lib/present/reserved'
import { isPinPath } from '../src/lib/security/paths'

const countLetters = (pin: string) => [...pin].filter((c) => PIN_LETTERS.includes(c)).length
const countDigits = (pin: string) => [...pin].filter((c) => PIN_DIGITS.includes(c)).length

describe('forma del PIN', () => {
  it('siempre son 2 letras y 2 dígitos, en cualquier orden', () => {
    for (let i = 0; i < 500; i++) {
      const pin = randomPin()
      expect(pin).toHaveLength(PIN_LENGTH)
      expect(countLetters(pin)).toBe(2)
      expect(countDigits(pin)).toBe(2)
    }
  })

  it('reparte las letras por todas las posiciones (no las fija al principio)', () => {
    // Sin barajar, las letras caerían siempre en las mismas dos posiciones y el
    // espacio real sería 6 veces menor que el anunciado.
    const positions = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const pin = randomPin()
      for (const [idx, ch] of [...pin].entries()) {
        if (PIN_LETTERS.includes(ch)) positions.add(idx)
      }
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3])
  })

  it('excluye los caracteres ambiguos i, l, o, 0 y 1', () => {
    expect(PIN_LETTERS).not.toMatch(/[ilo]/)
    expect(PIN_DIGITS).not.toMatch(/[01]/)
    for (const bad of ['ab01', 'io23', 'l1a2', '0a2b']) {
      expect(isPinShape(bad)).toBe(false)
    }
  })

  it('rechaza lo que no tiene exactamente 2 letras y 2 dígitos', () => {
    expect(isPinShape('abcd')).toBe(false)
    expect(isPinShape('2345')).toBe(false)
    expect(isPinShape('ab2')).toBe(false)
    expect(isPinShape('ab234')).toBe(false)
    expect(isPinShape('abc2')).toBe(false)
    expect(isPinShape('a234')).toBe(false)
    expect(isPinShape('')).toBe(false)
    expect(isPinShape(null)).toBe(false)
    expect(isPinShape(undefined)).toBe(false)
  })

  it('resuelve sin distinguir mayúsculas', () => {
    expect(normalizePin('A7B3')).toBe('a7b3')
    expect(normalizePin('a7b3')).toBe('a7b3')
    expect(normalizePin('A7b3')).toBe(normalizePin('a7B3'))
  })

  it('normalizePin devuelve null en vez de construir una clave con basura', () => {
    // Quien llama usa el resultado para armar una clave de Redis: si esto
    // devolviera el texto crudo, cualquier cosa entraría en el almacén.
    expect(normalizePin('../../etc')).toBeNull()
    expect(normalizePin('admin')).toBeNull()
    expect(normalizePin('a7b3 ')).toBeNull()
  })
})

describe('generación sin colisiones', () => {
  it('nunca devuelve un PIN que choque con una ruta reservada', async () => {
    const seen: string[] = []
    for (let i = 0; i < 200; i++) {
      const pin = await generatePin({ isReserved: isReservedSegment, isTaken: () => false })
      expect(isReservedSegment(pin)).toBe(false)
      seen.push(pin)
    }
    expect(new Set(seen).size).toBeGreaterThan(150) // sin repetirse en bucle
  })

  it('descarta los candidatos reservados en vez de devolverlos', async () => {
    // Se fuerza el peor caso: los tres primeros intentos "chocan".
    let calls = 0
    const pin = await generatePin({
      isReserved: () => ++calls <= 3,
      isTaken: () => false,
    })
    expect(calls).toBe(4)
    expect(isPinShape(pin)).toBe(true)
  })

  it('reintenta cuando el PIN ya está tomado por otra sesión viva', async () => {
    const taken = new Set<string>()
    let first = ''
    const guards = {
      isReserved: isReservedSegment,
      isTaken: (p: string) => taken.has(p),
    }
    first = await generatePin(guards)
    taken.add(first)
    for (let i = 0; i < 50; i++) {
      const next = await generatePin(guards)
      expect(next).not.toBe(first)
      taken.add(next)
    }
  })

  it('lanza en vez de devolver un PIN inválido si el espacio se agota', async () => {
    await expect(
      generatePin({ isReserved: () => true, isTaken: () => false }, 5)
    ).rejects.toThrow(PinExhaustedError)
  })

  it('el espacio es lo bastante grande para que la colisión sea irrelevante', () => {
    expect(PIN_SPACE_SIZE).toBe(6 * 23 ** 2 * 8 ** 2)
    expect(PIN_SPACE_SIZE).toBeGreaterThan(200_000)
  })
})

describe('rutas reservadas', () => {
  it('cubre todas las rutas raíz reales del sitio', async () => {
    // Cruce contra el disco: si mañana alguien añade `src/pages/algo.astro` y no
    // lo registra, este test falla antes de que un PIN pueda taparlo.
    const { readdirSync } = await import('node:fs')
    const entries = readdirSync(new URL('../src/pages', import.meta.url), { withFileTypes: true })

    const roots = entries
      .map((e) => e.name)
      // `[pin].astro` es la propia ruta comodín; `404` no es alcanzable a mano.
      .filter((n) => !n.startsWith('['))
      .map((n) => n.replace(/\.(astro|ts|js)$/, ''))

    for (const root of roots) {
      expect(isReservedSegment(root), `falta "${root}" en RESERVED_ROOT_SEGMENTS`).toBe(true)
    }
  })

  it('ninguna ruta reservada tiene forma de PIN (no se bloquean PINs válidos)', () => {
    // Si una ruta real tuviera forma de PIN, la lista estaría quitándole a la
    // generación un hueco legítimo - señal de que hay que renombrar la ruta.
    for (const seg of RESERVED_ROOT_SEGMENTS) {
      expect(isPinShape(seg), `la ruta "${seg}" tiene forma de PIN`).toBe(false)
    }
  })
})

describe('isPinPath (middleware) coincide con isPinShape (lib)', () => {
  // Son dos implementaciones a propósito: el middleware no debe importar el
  // módulo de presentaciones. Este test es lo que impide que se separen.
  it('coincide sobre PINs generados', () => {
    for (let i = 0; i < 300; i++) {
      const pin = randomPin()
      expect(isPinPath(`/${pin}`)).toBe(true)
      expect(isPinPath(`/${pin.toUpperCase()}`)).toBe(true)
    }
  })

  it('coincide sobre lo que no es un PIN', () => {
    const notPins = ['/admin', '/tools', '/abcd', '/2345', '/ab2', '/ab234', '/a7b3/x', '/', '/io23', '/ab01']
    for (const path of notPins) {
      expect(isPinPath(path), path).toBe(isPinShape(path.slice(1)))
    }
  })
})
