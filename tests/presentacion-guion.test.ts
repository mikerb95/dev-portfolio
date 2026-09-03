import { describe, expect, it } from 'vitest'
import { GUION_BEATS, GUION_INTRO, GUION_OUTRO } from '../src/data/guion-final'
import { mazoPublicado, notaDeGlobal, notaDePunto } from '../src/lib/presentacion/guion'
import { parsearActual, parsearForma } from '../src/lib/presentacion/estado'
import type { Mazo } from '../src/lib/presentacion/mapa'
// @ts-expect-error -- script .mjs sin tipos: lee la forma del bundle real.
import { leerMazo } from '../scripts/leer-mazo.mjs'

const MAZO: Mazo = { intro: 2, beats: 19, outro: 1 }

describe('forma del mazo publicada', () => {
  it('se reconstruye desde lo que publica la pantalla', () => {
    expect(mazoPublicado({ total: 22, intro: 2, outro: 1 })).toEqual(MAZO)
  })

  it('sin forma no hay mazo: mejor sin notas que con la nota de otra', () => {
    expect(mazoPublicado({ total: 22 })).toBeNull()
    expect(mazoPublicado({ total: 22, intro: 2 })).toBeNull()
  })

  it('una forma que no deja ni un beat en medio se rechaza', () => {
    expect(mazoPublicado({ total: 3, intro: 2, outro: 1 })).toBeNull()
  })

  it('parsearForma descarta la forma entera en cuanto no cuadra', () => {
    expect(parsearForma(2, 1, 22)).toEqual({ intro: 2, outro: 1 })
    expect(parsearForma(0, 0, 19)).toEqual({ intro: 0, outro: 0 })
    expect(parsearForma(2, undefined, 22)).toEqual({})
    expect(parsearForma(-1, 1, 22)).toEqual({})
    expect(parsearForma(2.5, 1, 22)).toEqual({})
    expect(parsearForma(20, 2, 22)).toEqual({})
  })

  it('el estado guardado conserva la forma, y sobrevive sin ella', () => {
    const con = parsearActual(JSON.stringify({ pos: 3, total: 22, ts: 1, intro: 2, outro: 1 }))
    expect(con).toEqual({ pos: 3, total: 22, ts: 1, intro: 2, outro: 1 })
    const sin = parsearActual(JSON.stringify({ pos: 3, total: 22, ts: 1 }))
    expect(sin).toEqual({ pos: 3, total: 22, ts: 1 })
    // Una forma rota no puede llevarse por delante la posición: el mando se
    // queda sin notas, no sin control.
    const rota = parsearActual(JSON.stringify({ pos: 3, total: 22, ts: 1, intro: 30, outro: 1 }))
    expect(rota).toEqual({ pos: 3, total: 22, ts: 1 })
  })
})

describe('nota de cada posición', () => {
  it('cada zona lee su propia lista', () => {
    expect(notaDePunto({ zona: 'intro', idx: 0 })).toBe(GUION_INTRO[0])
    expect(notaDePunto({ zona: 'beat', beat: 1 })).toBe(GUION_BEATS[0])
    expect(notaDePunto({ zona: 'beat', beat: 19 })).toBe(GUION_BEATS[18])
    expect(notaDePunto({ zona: 'outro', idx: 0 })).toBe(GUION_OUTRO[0])
  })

  it('el índice global cae en la nota que toca', () => {
    expect(notaDeGlobal(MAZO, 1)).toBe(GUION_INTRO[0])
    expect(notaDeGlobal(MAZO, 2)).toBe(GUION_INTRO[1])
    // La 3 es el beat 1: el desfase de las capas de entrada es justo lo que
    // una lista plana del 1 al 22 se comería al crecer el mazo.
    expect(notaDeGlobal(MAZO, 3)).toBe(GUION_BEATS[0])
    expect(notaDeGlobal(MAZO, 21)).toBe(GUION_BEATS[18])
    expect(notaDeGlobal(MAZO, 22)).toBe(GUION_OUTRO[0])
  })

  it('una zona más larga que su guion devuelve null, no la nota de al lado', () => {
    // El mazo real y el guion van sincronizados (`npm run guion:sync`), así
    // que el hueco hay que fabricarlo: un mazo con más beats de los que hay
    // escritos es exactamente lo que pasa entre que se reemplaza el bundle y
    // se corre la sincronización.
    const crecido: Mazo = { intro: 2, beats: GUION_BEATS.length + 6, outro: 1 }
    expect(notaDeGlobal(crecido, 2 + GUION_BEATS.length + 1)).toBeNull()
    expect(notaDePunto({ zona: 'outro', idx: 3 })).toBeNull()
  })
})

describe('guion del mazo actual', () => {
  // La cifra NO se escribe aquí: sale del propio `public/final.html`. Es la
  // prueba que faltaba el 3 de septiembre de 2026, cuando el mazo pasó de 19 a
  // 25 beats con cuatro insertados por delante y el guion, que se leía por
  // posición, quedó corrido cuatro puestos sin que nada fallara.
  it('cubre todos los beats del mazo, con título y notas', () => {
    expect(GUION_BEATS).toHaveLength(leerMazo().length)
    for (const [i, n] of GUION_BEATS.entries()) {
      expect(n.titulo, `beat ${i + 1} sin título`).not.toBe('')
      expect(n.notas.length, `beat ${i + 1} sin notas`).toBeGreaterThan(0)
    }
  })

  it('las capas tienen entrada propia', () => {
    expect(GUION_INTRO).toHaveLength(2)
    expect(GUION_OUTRO).toHaveLength(1)
  })

  it('no se cuela ningún em dash', () => {
    const todo = [...GUION_INTRO, ...GUION_BEATS, ...GUION_OUTRO]
      .flatMap((n) => [n.titulo, n.enPantalla ?? '', ...n.notas])
      .join(' ')
    expect(todo).not.toMatch(/[—–]/)
  })
})
