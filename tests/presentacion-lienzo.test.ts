import { describe, expect, it } from 'vitest'
import {
  areaDe,
  clasificarCapas,
  COBERTURA_MINIMA,
  elegirContador,
  esTextoDeContador,
  estaOculto,
  geometriaDesde,
  intersecar,
  mismaGeometria,
  parsearContador,
  recortadoresDe,
  superaCobertura,
  type Caja,
} from '../src/lib/presentacion/lienzo'

/** Una caja normal y corriente, para no repetir los tres campos en cada test. */
const caja = (p: Partial<Caja> = {}): Caja => ({
  position: 'static',
  overflow: 'visible',
  oculto: false,
  ...p,
})

describe('parsearContador', () => {
  it('lee la posición y el total', () => {
    expect(parsearContador('07 / 19')).toEqual({ pos: 7, total: 19 })
    expect(parsearContador('1/3')).toEqual({ pos: 1, total: 3 })
  })

  it('lo encuentra dentro de un texto más largo (respaldo por innerText)', () => {
    expect(parsearContador('algo antes 12 / 19 algo después')).toEqual({ pos: 12, total: 19 })
  })

  it('descarta lo que no es una posición posible', () => {
    // Un beat 0 no existe, y una posición por encima del total es basura de
    // otro sitio de la página, no el contador.
    expect(parsearContador('0 / 19')).toBeNull()
    expect(parsearContador('20 / 19')).toBeNull()
    expect(parsearContador('sin números')).toBeNull()
    expect(parsearContador(null)).toBeNull()
    expect(parsearContador(undefined)).toBeNull()
  })
})

describe('esTextoDeContador', () => {
  it('acepta solo el elemento cuyo texto ENTERO es el contador', () => {
    expect(esTextoDeContador(' 07 / 19 ')).toBe(true)
    expect(esTextoDeContador('07/19')).toBe(true)
    expect(esTextoDeContador('beat 07 / 19')).toBe(false)
    expect(esTextoDeContador('')).toBe(false)
  })
})

describe('elegirContador', () => {
  it('se queda con el elemento más interior', () => {
    // El de fuera contiene al de dentro, así que su texto también cuadra: sin
    // la regla de los descendientes, la posición quedaría pegada a un
    // contenedor que el bundle puede reemplazar entero al animar.
    const i = elegirContador([
      { texto: '07 / 19', descendientes: 12 },
      { texto: '07 / 19', descendientes: 0 },
    ])
    expect(i).toBe(1)
  })

  it('ignora a los que solo contienen un contador entre más texto', () => {
    const i = elegirContador([
      { texto: 'portada 01 / 19 cita', descendientes: 0 },
      { texto: '01 / 19', descendientes: 3 },
    ])
    expect(i).toBe(1)
  })

  it('devuelve -1 cuando el bundle todavía no ha montado', () => {
    expect(elegirContador([])).toBe(-1)
    expect(elegirContador([{ texto: 'cargando', descendientes: 0 }])).toBe(-1)
  })
})

describe('clasificarCapas', () => {
  it('lo visible va a la entrada y lo oculto al cierre', () => {
    const zonas = clasificarCapas([
      { z: 10, visible: true },
      { z: 30, visible: false },
      { z: 20, visible: true },
    ])
    expect(zonas.intro).toEqual([2, 0])
    expect(zonas.outro).toEqual([1])
  })

  it('la entrada va de mayor a menor z, el cierre al revés', () => {
    // En la entrada se ve primero la más alta porque tapa a las de abajo; en
    // el cierre cada una se apila sobre la anterior.
    const zonas = clasificarCapas([
      { z: 1, visible: true },
      { z: 3, visible: true },
      { z: 2, visible: true },
      { z: 9, visible: false },
      { z: 5, visible: false },
    ])
    expect(zonas.intro).toEqual([1, 2, 0])
    expect(zonas.outro).toEqual([4, 3])
  })

  it('los empates conservan el orden del documento', () => {
    const zonas = clasificarCapas([
      { z: 5, visible: true },
      { z: 5, visible: true },
    ])
    expect(zonas.intro).toEqual([0, 1])
  })

  it('un mazo sin capas no rompe nada: solo beats', () => {
    expect(clasificarCapas([])).toEqual({ intro: [], outro: [] })
  })
})

describe('estaOculto', () => {
  it('media opacidad ya cuenta como ida', () => {
    const s = (opacity: string) => ({ display: 'block', visibility: 'visible', opacity })
    expect(estaOculto(s('1'))).toBe(false)
    expect(estaOculto(s('0.51'))).toBe(false)
    expect(estaOculto(s('0.5'))).toBe(true)
    expect(estaOculto(s('0'))).toBe(true)
  })

  it('display y visibility también la esconden', () => {
    expect(estaOculto({ display: 'none', visibility: 'visible', opacity: '1' })).toBe(true)
    expect(estaOculto({ display: 'block', visibility: 'hidden', opacity: '1' })).toBe(true)
  })
})

describe('recortadoresDe', () => {
  it('un ancestro con overflow oculto recorta', () => {
    expect(recortadoresDe(caja(), [caja({ overflow: 'hidden' })])).toEqual([0])
  })

  it('un ancestro con overflow visible no recorta', () => {
    expect(recortadoresDe(caja(), [caja(), caja({ overflow: 'hidden' }), caja()])).toEqual([1])
  })

  it('un ancestro ESTÁTICO no recorta a un descendiente absoluto', () => {
    // Es la regla que hacía que el iframe no se descubriera NUNCA: el mazo
    // deja <body> y <html> con altura cero y overflow:hidden, y medir contra
    // ellos daba área cero.
    expect(recortadoresDe(caja({ position: 'absolute' }), [caja({ overflow: 'hidden' })])).toEqual(
      []
    )
  })

  it('pero un ancestro POSICIONADO sí recorta a un descendiente absoluto', () => {
    expect(
      recortadoresDe(caja({ position: 'absolute' }), [
        caja({ position: 'relative', overflow: 'hidden' }),
      ])
    ).toEqual([0])
  })

  it('deja de saltarse estáticos en cuanto aparece uno posicionado', () => {
    // El primer ancestro relative es el bloque contenedor del absoluto; a
    // partir de ahí la cadena vuelve a ser normal y los estáticos recortan.
    const r = recortadoresDe(caja({ position: 'absolute' }), [
      caja({ overflow: 'hidden' }), // estático: no recorta al absoluto
      caja({ position: 'relative' }), // el bloque contenedor
      caja({ overflow: 'hidden' }), // estático, pero ya no se salta
    ])
    expect(r).toEqual([2])
  })

  it('por encima de un fixed ya no recorta nadie', () => {
    const r = recortadoresDe(caja(), [
      caja({ overflow: 'hidden' }),
      caja({ position: 'fixed', overflow: 'hidden' }),
      caja({ overflow: 'hidden' }),
    ])
    expect(r).toEqual([0, 1])
  })

  it('a un elemento fixed no lo recorta ningún ancestro', () => {
    expect(
      recortadoresDe(caja({ position: 'fixed' }), [caja({ overflow: 'hidden' })])
    ).toEqual([])
  })

  it('null si el propio elemento está oculto', () => {
    expect(recortadoresDe(caja({ oculto: true }), [])).toBeNull()
  })

  it('null si algún ancestro por debajo del corte está oculto', () => {
    expect(recortadoresDe(caja(), [caja(), caja({ oculto: true })])).toBeNull()
  })

  it('un ancestro oculto POR ENCIMA de un fixed ya no cuenta', () => {
    // El recorrido para en el fixed, así que lo de arriba no puede esconder
    // algo que el navegador sí está pintando.
    expect(recortadoresDe(caja(), [caja({ position: 'fixed' }), caja({ oculto: true })])).toEqual([])
  })
})

describe('intersecar y areaDe', () => {
  const r = { izq: 0, arr: 0, der: 100, aba: 100 }

  it('sin recortes, el rectángulo entero', () => {
    expect(areaDe(intersecar(r, []))).toBe(10_000)
  })

  it('el recorte se queda con lo común', () => {
    const c = intersecar(r, [{ izq: 50, arr: 0, der: 200, aba: 40 }])
    expect(c).toEqual({ izq: 50, arr: 0, der: 100, aba: 40 })
    expect(areaDe(c)).toBe(2_000)
  })

  it('se aplican todos los recortes, no solo el último', () => {
    const c = intersecar(r, [
      { izq: 10, arr: 10, der: 90, aba: 90 },
      { izq: 0, arr: 0, der: 50, aba: 50 },
    ])
    expect(areaDe(c)).toBe(40 * 40)
  })

  it('un recorte que no toca da área cero, nunca negativa', () => {
    // El caso de la caja plegada de 336x186 fuera de pantalla: sin el suelo en
    // cero, un área negativa habría ganado la comparación del "más grande".
    const c = intersecar(r, [{ izq: 300, arr: 300, der: 400, aba: 400 }])
    expect(areaDe(c)).toBe(0)
  })
})

describe('superaCobertura', () => {
  const W = 1000
  const H = 1000

  it('acepta el iframe que se asoma lo suficiente', () => {
    expect(superaCobertura(W * H * COBERTURA_MINIMA, W, H)).toBe(true)
    expect(superaCobertura(W * H, W, H)).toBe(true)
  })

  it('rechaza el adorno incrustado y el que no se ve', () => {
    // Las cajas plegadas del mazo (336x186 sobre un escenario de 1920x1080)
    // no llegan ni de lejos al 15%.
    expect(superaCobertura(336 * 186, 1920, 1080)).toBe(false)
    expect(superaCobertura(0, W, H)).toBe(false)
  })
})

describe('geometriaDesde', () => {
  it('mide lo que queda por bajar', () => {
    expect(geometriaDesde({ clientHeight: 800, scrollHeight: 2000, scrollTop: 300 })).toEqual({
      y: 300,
      max: 1200,
      alto: 800,
    })
  })

  it('una página que cabe entera tiene max 0', () => {
    expect(geometriaDesde({ clientHeight: 800, scrollHeight: 800, scrollTop: 0 })).toEqual({
      y: 0,
      max: 0,
      alto: 800,
    })
  })

  it('acota el rebote elástico de iOS en vez de descartar la geometría', () => {
    // Perder los controles a mitad de una demo por unos fotogramas de rebote
    // sería peor que corregir el número.
    expect(geometriaDesde({ clientHeight: 800, scrollHeight: 2000, scrollTop: 5000 })).toEqual({
      y: 1200,
      max: 1200,
      alto: 800,
    })
    expect(geometriaDesde({ clientHeight: 800, scrollHeight: 2000, scrollTop: -80 })).toEqual({
      y: 0,
      max: 1200,
      alto: 800,
    })
  })

  it('null si no hay altura que medir', () => {
    expect(geometriaDesde({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 })).toBeNull()
    expect(geometriaDesde({ clientHeight: NaN, scrollHeight: 100, scrollTop: 0 })).toBeNull()
  })
})

describe('mismaGeometria', () => {
  const g = { y: 100, max: 500, alto: 800 }

  it('perdona el subpíxel', () => {
    expect(mismaGeometria(g, { ...g, y: 101 })).toBe(true)
    expect(mismaGeometria(g, { ...g, y: 103 })).toBe(false)
  })

  it('un cambio de max nunca se perdona: cambió la página, no el scroll', () => {
    expect(mismaGeometria(g, { ...g, max: 501 })).toBe(false)
  })

  it('sin geometría, solo son iguales si faltan las dos', () => {
    expect(mismaGeometria(undefined, undefined)).toBe(true)
    expect(mismaGeometria(g, undefined)).toBe(false)
  })
})
