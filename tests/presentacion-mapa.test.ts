import { describe, expect, it } from 'vitest'
import {
  aGlobal,
  aPunto,
  bundleAunLaTiene,
  capasDe,
  paso,
  puntoDesdeCapas,
  totalGlobal,
  type Accion,
  type Mazo,
  type Punto,
} from '../src/lib/presentacion/mapa'

/** El mazo real de la sustentación: cita + portada, 19 beats, cierre. */
const MAZO: Mazo = { intro: 2, beats: 19, outro: 1 }

/**
 * Simula la pantalla: capas puestas + beat del bundle. El beat solo se mueve
 * con teclas, y las teclas solo llegan al bundle cuando no hay capa delante,
 * que es exactamente la regla que `paso` tiene que respetar.
 */
function recorrer(m: Mazo, desde: number, hasta: number): Accion[] {
  const inicio = aPunto(m, desde)
  const pantalla = {
    ...capasDe(m, inicio),
    beat: inicio.zona === 'outro' ? m.beats : inicio.zona === 'beat' ? inicio.beat : 1,
  }
  const camino: Accion[] = []
  for (let i = 0; i < 200; i++) {
    const punto = puntoDesdeCapas(m, pantalla)
    const acc = paso(m, punto, aPunto(m, hasta))
    if (!acc) return camino
    camino.push(acc)
    if (acc.tipo === 'tecla') {
      if (punto.zona !== 'beat') throw new Error('tecla con una capa delante')
      const paso1 = pantalla.beat + (acc.tecla === 'ArrowRight' ? 1 : -1)
      pantalla.beat = Math.min(Math.max(paso1, 1), m.beats)
    } else {
      pantalla[acc.zona][acc.idx] = acc.visible
    }
  }
  throw new Error('no converge')
}

describe('índice global', () => {
  it('cuenta las tres zonas, no solo los beats', () => {
    expect(totalGlobal(MAZO)).toBe(22)
  })

  it('ida y vuelta entre índice y punto', () => {
    for (let g = 1; g <= totalGlobal(MAZO); g++) {
      expect(aGlobal(MAZO, aPunto(MAZO, g))).toBe(g)
    }
  })

  it('ordena cita, portada, beats y cierre', () => {
    expect(aPunto(MAZO, 1)).toEqual({ zona: 'intro', idx: 0 })
    expect(aPunto(MAZO, 2)).toEqual({ zona: 'intro', idx: 1 })
    expect(aPunto(MAZO, 3)).toEqual({ zona: 'beat', beat: 1 })
    expect(aPunto(MAZO, 21)).toEqual({ zona: 'beat', beat: 19 })
    expect(aPunto(MAZO, 22)).toEqual({ zona: 'outro', idx: 0 })
  })

  it('acota fuera de rango en vez de inventar una zona', () => {
    expect(aPunto(MAZO, 0)).toEqual({ zona: 'intro', idx: 0 })
    expect(aPunto(MAZO, 999)).toEqual({ zona: 'outro', idx: 0 })
  })

  it('un bundle sin capas se comporta como antes', () => {
    const solo: Mazo = { intro: 0, beats: 14, outro: 0 }
    expect(totalGlobal(solo)).toBe(14)
    expect(aPunto(solo, 5)).toEqual({ zona: 'beat', beat: 5 })
  })
})

describe('lectura de la pantalla', () => {
  it('manda la capa de entrada más alta que siga puesta', () => {
    const visto = { intro: [true, true], outro: [false], beat: 1 }
    expect(puntoDesdeCapas(MAZO, visto)).toEqual({ zona: 'intro', idx: 0 })
    expect(puntoDesdeCapas(MAZO, { ...visto, intro: [false, true] })).toEqual({
      zona: 'intro',
      idx: 1,
    })
  })

  it('manda la última capa de cierre, que es la que queda encima', () => {
    const m: Mazo = { ...MAZO, outro: 2 }
    expect(puntoDesdeCapas(m, { intro: [false, false], outro: [true, true], beat: 19 })).toEqual({
      zona: 'outro',
      idx: 1,
    })
  })

  it('sin capas puestas, la posición es el beat del contador', () => {
    expect(puntoDesdeCapas(MAZO, { intro: [false, false], outro: [false], beat: 7 })).toEqual({
      zona: 'beat',
      beat: 7,
    })
  })

  it('un contador corrupto no saca la posición del mazo', () => {
    expect(puntoDesdeCapas(MAZO, { intro: [false, false], outro: [false], beat: 99 })).toEqual({
      zona: 'beat',
      beat: 19,
    })
  })
})

describe('capas de cada punto', () => {
  it('la entrada se pela desde arriba', () => {
    expect(capasDe(MAZO, { zona: 'intro', idx: 0 })).toEqual({
      intro: [true, true],
      outro: [false],
    })
    expect(capasDe(MAZO, { zona: 'intro', idx: 1 })).toEqual({
      intro: [false, true],
      outro: [false],
    })
  })

  it('en los beats no hay ninguna capa puesta', () => {
    expect(capasDe(MAZO, { zona: 'beat', beat: 9 })).toEqual({
      intro: [false, false],
      outro: [false],
    })
  })

  it('el cierre se apila', () => {
    const m: Mazo = { ...MAZO, outro: 3 }
    expect(capasDe(m, { zona: 'outro', idx: 1 }).outro).toEqual([true, true, false])
  })
})

describe('paso a paso', () => {
  it('no hace nada si ya está donde se le pidió', () => {
    expect(paso(MAZO, { zona: 'beat', beat: 4 }, { zona: 'beat', beat: 4 })).toBeNull()
  })

  it('converge a cualquier destino desde cualquier origen', () => {
    const total = totalGlobal(MAZO)
    for (let desde = 1; desde <= total; desde++) {
      for (let hasta = 1; hasta <= total; hasta++) {
        expect(recorrer(MAZO, desde, hasta).length).toBe(Math.abs(hasta - desde))
      }
    }
  })

  it('sale de la entrada quitando capas, no moviendo beats', () => {
    expect(recorrer(MAZO, 1, 3)).toEqual([
      { tipo: 'capa', zona: 'intro', idx: 0, visible: false },
      { tipo: 'capa', zona: 'intro', idx: 1, visible: false },
    ])
  })

  it('llega al cierre, que con el contador solo era inalcanzable', () => {
    expect(recorrer(MAZO, 21, 22)).toEqual([
      { tipo: 'capa', zona: 'outro', idx: 0, visible: true },
    ])
  })

  it('vuelve del cierre al último beat', () => {
    expect(recorrer(MAZO, 22, 21)).toEqual([
      { tipo: 'capa', zona: 'outro', idx: 0, visible: false },
    ])
  })

  it('vuelve a la portada desde el primer beat, que el bundle no sabe hacer', () => {
    expect(recorrer(MAZO, 3, 1)).toEqual([
      { tipo: 'capa', zona: 'intro', idx: 1, visible: true },
      { tipo: 'capa', zona: 'intro', idx: 0, visible: true },
    ])
  })

  it('entre beats solo manda flechas', () => {
    expect(recorrer(MAZO, 5, 8)).toEqual(
      Array.from({ length: 3 }, () => ({ tipo: 'tecla', tecla: 'ArrowRight' }))
    )
    expect(recorrer(MAZO, 8, 5)).toEqual(
      Array.from({ length: 3 }, () => ({ tipo: 'tecla', tecla: 'ArrowLeft' }))
    )
  })

  it('un salto largo cruza las tres zonas en orden', () => {
    const camino = recorrer(MAZO, 1, 22)
    expect(camino.filter((a) => a.tipo === 'capa')).toHaveLength(3)
    expect(camino.filter((a) => a.tipo === 'tecla')).toHaveLength(18)
    expect(camino[0]).toEqual({ tipo: 'capa', zona: 'intro', idx: 0, visible: false })
    expect(camino.at(-1)).toEqual({ tipo: 'capa', zona: 'outro', idx: 0, visible: true })
  })
})

describe('teclas que el bundle todavía se debe', () => {
  it('gasta una por capa de entrada y solo la primera vez', () => {
    expect(bundleAunLaTiene(0, 0)).toBe(true)
    expect(bundleAunLaTiene(1, 1)).toBe(true)
    // Segunda pasada por la misma capa: ya no es suya, la tecla movería un beat.
    expect(bundleAunLaTiene(0, 2)).toBe(false)
    expect(bundleAunLaTiene(1, 2)).toBe(false)
  })
})
