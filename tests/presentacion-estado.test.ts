import { describe, expect, it } from 'vitest'
import {
  acotar,
  destinoTrasReporte,
  esFresco,
  FRESCURA_MS,
  mover,
  parsearActual,
  POS_MAX,
  techo,
  type Actual,
} from '../src/lib/presentacion/estado'

const actual = (pos: number, total: number, ts = 0): Actual => ({ pos, total, ts })

describe('acotar', () => {
  it('encierra en [1, techo]', () => {
    expect(acotar(0)).toBe(1)
    expect(acotar(-7)).toBe(1)
    expect(acotar(5, 14)).toBe(5)
    expect(acotar(99, 14)).toBe(14)
  })

  it('nunca devuelve menos de 1, ni con un techo absurdo', () => {
    // Un total corrupto no puede dejar el destino en 0 y congelar el mando.
    expect(acotar(5, 0)).toBe(1)
    expect(acotar(5, -3)).toBe(1)
  })
})

describe('parsearActual', () => {
  it('lee lo que publica la pantalla', () => {
    expect(parsearActual('{"pos":5,"total":14,"ts":1000}')).toEqual(actual(5, 14, 1000))
  })

  it('trae la geometría del iframe cuando la diapositiva la tiene', () => {
    expect(
      parsearActual('{"pos":14,"total":22,"ts":1,"scroll":{"y":300,"max":2400,"alto":900}}')?.scroll
    ).toEqual({ y: 300, max: 2400, alto: 900 })
  })

  it('una geometría rota deja la posición intacta', () => {
    // Sin controles de scroll, nunca sin control de las diapositivas: el paso
    // del mazo no puede depender de que se pueda medir la página de dentro.
    const a = parsearActual('{"pos":14,"total":22,"ts":1,"scroll":{"y":300,"alto":0}}')
    expect(a).toEqual(actual(14, 22, 1))
    expect(a?.scroll).toBeUndefined()
  })

  it('devuelve null en vez de lanzar ante basura', () => {
    // Un JSON roto significa "no sé dónde está la pantalla", no una excepción
    // que tumbe el mando a mitad de la charla.
    for (const crudo of [
      null,
      '',
      'no es json',
      '{"pos":5}',
      '{"pos":"5","total":14,"ts":1}',
      '{"pos":1.5,"total":14,"ts":1}',
      '{"pos":0,"total":14,"ts":1}',
      '{"pos":15,"total":14,"ts":1}',
    ]) {
      expect(parsearActual(crudo)).toBeNull()
    }
  })
})

describe('frescura', () => {
  it('un reporte reciente vale; uno viejo deja de valer', () => {
    expect(esFresco(actual(3, 14, 1_000), 1_000 + FRESCURA_MS - 1)).toBe(true)
    expect(esFresco(actual(3, 14, 1_000), 1_000 + FRESCURA_MS)).toBe(false)
    expect(esFresco(null, 0)).toBe(false)
  })

  it('el techo es el total real solo mientras la pantalla esté viva', () => {
    expect(techo(actual(3, 14, 1_000), 1_000)).toBe(14)
    expect(techo(actual(3, 14, 1_000), 1_000 + FRESCURA_MS)).toBe(POS_MAX)
    expect(techo(null, 0)).toBe(POS_MAX)
  })
})

describe('mover', () => {
  it('acumula toques sobre el destino, no sobre la posición real', () => {
    // Tres toques mientras la pantalla anima valen tres: es la razón de que el
    // estado sea una posición absoluta y no una cola de comandos.
    let destino = 1
    for (let i = 0; i < 3; i++) destino = mover(destino, 1, 14)
    expect(destino).toBe(4)
  })

  it('no se pasa del final del mazo', () => {
    expect(mover(14, 1, 14)).toBe(14)
    expect(mover(1, -1, 14)).toBe(1)
  })
})

describe('destinoTrasReporte', () => {
  it('una recarga no pierde la charla', () => {
    // La pantalla vuelve a cargar en la 1 con el destino en 7: adoptar aquí
    // dejaría la presentación clavada al principio delante del público.
    expect(destinoTrasReporte(7, actual(1, 14), 'inicial')).toBe(7)
  })

  it('el latido solo refresca, no mueve el destino', () => {
    expect(destinoTrasReporte(7, actual(7, 14), 'latido')).toBe(7)
  })

  it('un movimiento ajeno manda sobre el destino', () => {
    // Alguien pasó la diapositiva desde el teclado del portátil: sin adoptar,
    // el sondeo siguiente arrastraría la presentación de vuelta.
    expect(destinoTrasReporte(3, actual(9, 14), 'ajena')).toBe(9)
  })

  it('acota el destino contra el total real en cuanto se conoce', () => {
    // El mando pudo pedir la 40 antes de que la pantalla dijera cuántas hay.
    expect(destinoTrasReporte(40, actual(14, 14), 'inicial')).toBe(14)
    expect(destinoTrasReporte(40, actual(14, 14), 'mando')).toBe(14)
  })
})
