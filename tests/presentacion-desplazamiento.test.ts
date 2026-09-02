import { describe, expect, it } from 'vitest'
import {
  desplazamientoPedido,
  FRACCION,
  hayQueDesplazar,
  MINIMO_PX,
  mover,
  parsearGeometria,
  parsearPeticion,
  paso,
  type Geometria,
  type Peticion,
} from '../src/lib/presentacion/desplazamiento'

/** Una página el triple de alta que la ventanilla, que es el caso corriente. */
const geo = (max = 2400, alto = 900, y = 0): Geometria => ({ y, max, alto })

describe('paso', () => {
  it('es un tercio de la ventanilla', () => {
    expect(paso(900)).toBe(300)
    expect(paso(1200)).toBe(1200 / FRACCION)
  })

  it('nunca es cero, ni con una ventanilla diminuta', () => {
    // Un paso de 0 sería un botón que responde y no mueve nada, que es
    // exactamente el fallo que este sistema evita en el mazo.
    expect(paso(1)).toBe(1)
    expect(paso(0)).toBe(1)
  })
})

describe('parsearGeometria', () => {
  it('lee lo que publica la pantalla', () => {
    expect(parsearGeometria({ y: 300, max: 2400, alto: 900 })).toEqual(geo(2400, 900, 300))
  })

  it('acota `y` en vez de tirar la geometría entera', () => {
    // El rebote elástico de iOS deja el scroll fuera de rango unos fotogramas.
    // Perder los controles por eso en mitad de una demo sería peor que
    // corregir el número.
    expect(parsearGeometria({ y: 9999, max: 2400, alto: 900 })?.y).toBe(2400)
    expect(parsearGeometria({ y: -80, max: 2400, alto: 900 })?.y).toBe(0)
  })

  it('descarta una forma incoherente', () => {
    for (const v of [
      undefined,
      null,
      42,
      'no',
      {},
      { y: 0, max: 100 },
      { y: 0, max: 100, alto: 0 },
      { y: 0, max: -1, alto: 900 },
      { y: 1.5, max: 100, alto: 900 },
      { y: 0, max: 100, alto: '900' },
    ]) {
      expect(parsearGeometria(v)).toBeUndefined()
    }
  })

  it('una página que cabe entera es geometría válida sin nada que bajar', () => {
    // No es un error: es la diapositiva normal. Quien decide esconder los
    // controles es el mando, mirando `max`.
    expect(parsearGeometria({ y: 0, max: 0, alto: 900 })).toEqual(geo(0, 900))
  })
})

describe('hayQueDesplazar', () => {
  it('una página con recorrido de verdad sí', () => {
    expect(hayQueDesplazar(geo(2400, 900))).toBe(true)
    expect(hayQueDesplazar(geo(MINIMO_PX, 900))).toBe(true)
  })

  it('un recorrido de redondeo no', () => {
    // Caso real, no hipotético: la demo del portal publica `max: 10` porque su
    // login cabe entero y esos diez píxeles son el redondeo de un iframe
    // escalado. Dos botones que mueven la proyección un pelo se leen como un
    // mando roto, y ahí la rejilla de saltos vale más.
    expect(hayQueDesplazar(geo(10, 910))).toBe(false)
    expect(hayQueDesplazar(geo(0, 900))).toBe(false)
    expect(hayQueDesplazar(undefined)).toBe(false)
  })
})

describe('parsearPeticion', () => {
  it('lee lo guardado', () => {
    expect(parsearPeticion('{"pos":14,"y":600}')).toEqual({ pos: 14, y: 600 })
  })

  it('devuelve null en vez de lanzar ante basura', () => {
    for (const crudo of [
      null,
      '',
      'no es json',
      '{"pos":14}',
      '{"pos":0,"y":10}',
      '{"pos":14,"y":-1}',
      '{"pos":"14","y":10}',
      '{"pos":14,"y":1.5}',
    ]) {
      expect(parsearPeticion(crudo)).toBeNull()
    }
  })
})

describe('desplazamientoPedido', () => {
  it('vale para su diapositiva', () => {
    expect(desplazamientoPedido({ pos: 14, y: 600 }, 14)).toBe(600)
  })

  it('vale cero en cualquier otra: la vuelta arriba automática', () => {
    // Es lo que hace que el iframe vuelva arriba solo al cambiar de beat, sin
    // escrituras extra, sin cron de limpieza y sin carrera. Cualquier camino
    // que cambie de diapositiva -incluida la adopción de un movimiento hecho
    // desde el teclado del portátil- lo reinicia por construcción.
    expect(desplazamientoPedido({ pos: 14, y: 600 }, 15)).toBe(0)
    expect(desplazamientoPedido({ pos: 14, y: 600 }, 13)).toBe(0)
    expect(desplazamientoPedido(null, 14)).toBe(0)
  })

  it('volver a la diapositiva recupera lo pedido', () => {
    // Consecuencia del vínculo, no una regla aparte: nadie borró nada al
    // salir, así que al volver el número sigue ahí.
    const p: Peticion = { pos: 14, y: 600 }
    expect(desplazamientoPedido(p, 15)).toBe(0)
    expect(desplazamientoPedido(p, 14)).toBe(600)
  })
})

describe('mover', () => {
  it('baja y sube un tercio de la ventanilla', () => {
    expect(mover(null, 14, 1, geo())).toEqual({ pos: 14, y: 300 })
    expect(mover({ pos: 14, y: 300 }, 14, 1, geo())).toEqual({ pos: 14, y: 600 })
    expect(mover({ pos: 14, y: 600 }, 14, -1, geo())).toEqual({ pos: 14, y: 300 })
  })

  it('acumula sobre lo PEDIDO, no sobre lo que se ve', () => {
    // Tres toques seguidos valen tres. Mientras el `scrollTo` anima, la
    // posición real va por detrás: partir de ella los convertiría en uno.
    const enPlenaAnimacion = geo(2400, 900, 40)
    let p = mover(null, 14, 1, enPlenaAnimacion)!
    p = mover(p, 14, 1, enPlenaAnimacion)!
    p = mover(p, 14, 1, enPlenaAnimacion)!
    expect(p.y).toBe(900)
  })

  it('se acota en los dos topes', () => {
    expect(mover({ pos: 14, y: 2300 }, 14, 1, geo())).toEqual({ pos: 14, y: 2400 })
    expect(mover({ pos: 14, y: 100 }, 14, -1, geo())).toEqual({ pos: 14, y: 0 })
    expect(mover({ pos: 14, y: 0 }, 14, -1, geo())).toEqual({ pos: 14, y: 0 })
  })

  it('un toque en otra diapositiva empieza desde arriba', () => {
    expect(mover({ pos: 13, y: 900 }, 14, 1, geo())).toEqual({ pos: 14, y: 300 })
    // Y subir desde arriba no baja de cero: no se hereda el scroll del beat
    // anterior ni por el lado de atrás.
    expect(mover({ pos: 13, y: 900 }, 14, -1, geo())).toEqual({ pos: 14, y: 0 })
  })

  it('sella la diapositiva a la que pertenece', () => {
    expect(mover(null, 16, 1, geo())?.pos).toBe(16)
  })

  it('no escribe nada cuando no hay qué desplazar', () => {
    // Sin geometría (diapositiva sin iframe, o uno de otro origen) y con una
    // página que cabe entera. No es un error: la pantalla pudo cambiar de
    // diapositiva entre el toque y su llegada.
    expect(mover(null, 14, 1, undefined)).toBeNull()
    expect(mover(null, 14, 1, geo(0, 900))).toBeNull()
    // Y con un recorrido de puro redondeo, que es el de la demo del portal.
    expect(mover(null, 14, 1, geo(10, 910))).toBeNull()
  })
})
