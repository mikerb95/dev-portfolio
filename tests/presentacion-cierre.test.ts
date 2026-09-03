import { describe, expect, it } from 'vitest'
import {
  ESPERA_MS,
  ordenDeCierre,
  RUTA_CIERRE,
  segundosParaCierre,
  type Vigilancia,
} from '../src/lib/presentacion/cierre'

/** El mazo real: 22 posiciones globales, la última es "¿Preguntas?". */
const TOTAL = 22
const en = (pos: number, extra: Partial<{ total: number; aplicando: boolean }> = {}) => ({
  pos,
  total: TOTAL,
  aplicando: false,
  ...extra,
})

describe('cuándo se arma la cuenta del cierre', () => {
  it('al llegar a la última y estando quieto', () => {
    expect(ordenDeCierre('ocioso', en(TOTAL))).toBe('armar')
  })

  it('en cualquier otra diapositiva no pasa nada', () => {
    for (const pos of [1, 2, 11, TOTAL - 1]) {
      expect(ordenDeCierre('ocioso', en(pos))).toBe('nada')
    }
  })

  it('no se rearma sola por seguir ahí: solo al volver a entrar', () => {
    expect(ordenDeCierre('armado', en(TOTAL))).toBe('nada')
  })

  it('salir de la última la cancela', () => {
    // Es la garantía de la feature: un salto al final por equivocación no
    // secuestra la ventana que conduce.
    expect(ordenDeCierre('armado', en(TOTAL - 1))).toBe('cancelar')
    expect(ordenDeCierre('armado', en(1))).toBe('cancelar')
  })

  it('un mazo en movimiento la cancela aunque el número ya coincida', () => {
    // Reconciliando es que alguien pidió otra cosa.
    expect(ordenDeCierre('armado', en(TOTAL, { aplicando: true }))).toBe('cancelar')
    expect(ordenDeCierre('ocioso', en(TOTAL, { aplicando: true }))).toBe('nada')
  })

  it('vuelve a armar si se sale y se entra otra vez', () => {
    let v: Vigilancia = 'ocioso'
    const aplicar = (o: string) => {
      v = o === 'armar' ? 'armado' : o === 'cancelar' ? 'ocioso' : v
    }
    aplicar(ordenDeCierre(v, en(TOTAL)))
    expect(v).toBe('armado')
    aplicar(ordenDeCierre(v, en(TOTAL - 1)))
    expect(v).toBe('ocioso')
    expect(ordenDeCierre(v, en(TOTAL))).toBe('armar')
  })

  it('sin total creíble no se va a ninguna parte', () => {
    // Una pantalla que aún no descubrió el mazo publica cualquier cosa.
    expect(ordenDeCierre('ocioso', { pos: 1, total: 0, aplicando: false })).toBe('nada')
    expect(ordenDeCierre('ocioso', { pos: Number.NaN, total: TOTAL, aplicando: false })).toBe(
      'nada'
    )
    expect(ordenDeCierre('ocioso', { pos: 1.5, total: TOTAL, aplicando: false })).toBe('nada')
  })

  it('una posición pasada del total también es el final', () => {
    // El total encoge si el mazo se reexporta con menos diapositivas.
    expect(ordenDeCierre('ocioso', en(TOTAL + 3))).toBe('armar')
  })
})

describe('la cuenta que se enseña', () => {
  it('redondea hacia arriba, para que se vea el 5', () => {
    expect(segundosParaCierre(1_000 + ESPERA_MS, 1_000)).toBe(5)
    expect(segundosParaCierre(5_400, 1_000)).toBe(5)
    expect(segundosParaCierre(1_200, 1_000)).toBe(1)
  })

  it('no baja de cero ni con relojes rotos', () => {
    expect(segundosParaCierre(1_000, 9_000)).toBe(0)
    expect(segundosParaCierre(Number.NaN, 1_000)).toBe(0)
  })
})

describe('a dónde se va', () => {
  it('a la página de cierre, que es una ruta del sitio', () => {
    expect(RUTA_CIERRE).toBe('/presentacion-end')
  })
})
