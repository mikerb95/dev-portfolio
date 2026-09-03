import { describe, expect, it, vi } from 'vitest'
import {
  aplicarEco,
  ecoPara,
  ECO_MAX,
  esMasNuevo,
  espejoVivoDe,
  GLOBAL,
  leerEco,
  parsearEco,
  serializar,
  siguienteEco,
  type Eco,
} from '../src/lib/presentacion/eco'

const eco = (p: Partial<Eco> = {}): Eco => ({
  pos: 23,
  seq: 3,
  estado: { valor: 'codebymike.tech', res: [] },
  ...p,
})

/** Un documento de mentira con la `window` que hace falta: `espejoVivoDe` solo
 *  mira `defaultView` y lo que cuelgue de él con el nombre del contrato. */
const docCon = (global: unknown) =>
  ({ defaultView: { [GLOBAL]: global } }) as unknown as Document

describe('parsearEco', () => {
  it('acepta lo que tiene la forma buena', () => {
    expect(parsearEco(eco())).toEqual(eco())
  })

  it('acepta el mismo mensaje serializado', () => {
    expect(parsearEco(JSON.stringify(eco()))).toEqual(eco())
  })

  it('acepta un estado nulo, que es "no hay nada escrito"', () => {
    expect(parsearEco(eco({ estado: null }))).toEqual(eco({ estado: null }))
  })

  it('rechaza lo que no es objeto, JSON roto y campos ausentes', () => {
    expect(parsearEco(null)).toBeNull()
    expect(parsearEco('{')).toBeNull()
    expect(parsearEco({ pos: 23, seq: 1 })).toBeNull()
    expect(parsearEco({ pos: 23, estado: {} })).toBeNull()
  })

  it('rechaza posiciones y secuencias que no son enteros positivos', () => {
    expect(parsearEco(eco({ pos: 0 }))).toBeNull()
    expect(parsearEco(eco({ pos: 2.5 }))).toBeNull()
    expect(parsearEco(eco({ seq: -1 }))).toBeNull()
  })

  it('rechaza un estado que no cabe', () => {
    // El techo es del transporte, no de la página: sin él, cualquier página
    // podría publicar su DOM entero dos veces por segundo.
    expect(parsearEco(eco({ estado: { x: 'a'.repeat(ECO_MAX) } }))).toBeNull()
  })

  it('rechaza un estado que no se deja serializar', () => {
    const ciclo: Record<string, unknown> = {}
    ciclo.yo = ciclo
    expect(parsearEco(eco({ estado: ciclo }))).toBeNull()
  })
})

describe('serializar', () => {
  it('devuelve null en vez de lanzar ante un ciclo', () => {
    const ciclo: Record<string, unknown> = {}
    ciclo.yo = ciclo
    expect(serializar(ciclo)).toBeNull()
  })

  it('devuelve null cuando JSON no produce texto', () => {
    expect(serializar(undefined)).toBeNull()
  })
})

describe('esMasNuevo', () => {
  it('sin nada previo, cualquiera es nuevo', () => {
    expect(esMasNuevo(eco(), null)).toBe(true)
  })

  it('un mensaje atrasado o empatado no sustituye al que hay', () => {
    expect(esMasNuevo(eco({ seq: 2 }), eco({ seq: 3 }))).toBe(false)
    expect(esMasNuevo(eco({ seq: 3 }), eco({ seq: 3 }))).toBe(false)
    expect(esMasNuevo(eco({ seq: 4 }), eco({ seq: 3 }))).toBe(true)
  })
})

describe('ecoPara', () => {
  it('solo el de esta diapositiva', () => {
    expect(ecoPara(eco({ pos: 23 }), 23)?.pos).toBe(23)
    expect(ecoPara(eco({ pos: 23 }), 24)).toBeNull()
    expect(ecoPara(null, 23)).toBeNull()
  })
})

describe('siguienteEco', () => {
  it('sin nada que contar no publica', () => {
    expect(siguienteEco(23, undefined, null)).toBeNull()
  })

  it('el primer estado publica con seq 1', () => {
    expect(siguienteEco(23, { valor: 'a' }, null)).toEqual({
      pos: 23,
      seq: 1,
      estado: { valor: 'a' },
    })
  })

  it('el mismo contenido en otro objeto no es novedad', () => {
    // La página construye su estado de cero en cada lectura: comparar por
    // identidad publicaría dos veces por segundo durante toda la charla.
    const anterior = siguienteEco(23, { valor: 'a' }, null)
    expect(siguienteEco(23, { valor: 'a' }, anterior)).toBeNull()
  })

  it('un cambio sube el seq', () => {
    const anterior = eco({ seq: 7, estado: { valor: 'a' } })
    expect(siguienteEco(23, { valor: 'ab' }, anterior)?.seq).toBe(8)
  })

  it('cambiar de diapositiva cuenta como novedad aunque el estado sea igual', () => {
    const anterior = eco({ pos: 23, estado: { valor: 'a' } })
    expect(siguienteEco(24, { valor: 'a' }, anterior)?.pos).toBe(24)
  })

  it('un estado que no cabe no se publica a medias', () => {
    expect(siguienteEco(23, { x: 'a'.repeat(ECO_MAX) }, null)).toBeNull()
  })
})

describe('espejoVivoDe', () => {
  const contrato = { leer: () => 1, aplicar: () => {} }

  it('encuentra el contrato de la página que participa', () => {
    expect(espejoVivoDe(docCon(contrato))).toBe(contrato)
  })

  it('una página que no participa no tiene eco', () => {
    expect(espejoVivoDe(docCon(undefined))).toBeNull()
    expect(espejoVivoDe(null)).toBeNull()
    expect(espejoVivoDe(docCon({ leer: () => 1 }))).toBeNull()
  })

  it('un documento de otro origen no rompe nada', () => {
    const ajeno = {
      get defaultView(): never {
        throw new Error('cross-origin')
      },
    } as unknown as Document
    expect(espejoVivoDe(ajeno)).toBeNull()
  })
})

describe('leerEco', () => {
  it('devuelve lo que cuenta la página', () => {
    expect(leerEco(docCon({ leer: () => ({ valor: 'x' }), aplicar: () => {} }))).toEqual({
      valor: 'x',
    })
  })

  it('sin página que participe, no hay nada que contar', () => {
    expect(leerEco(docCon(undefined))).toBeUndefined()
    expect(leerEco(null)).toBeUndefined()
  })

  it('un `leer` que lanza no tumba el bucle que publica la posición', () => {
    const roto = {
      leer: () => {
        throw new Error('a medio cargar')
      },
      aplicar: () => {},
    }
    expect(leerEco(docCon(roto))).toBeUndefined()
  })
})

describe('aplicarEco', () => {
  it('le pasa el estado a la página', () => {
    const aplicar = vi.fn()
    expect(aplicarEco(docCon({ leer: () => 1, aplicar }), eco())).toBe(true)
    expect(aplicar).toHaveBeenCalledWith(eco().estado)
  })

  it('sin eco o sin página no aplica nada', () => {
    expect(aplicarEco(docCon({ leer: () => 1, aplicar: () => {} }), null)).toBe(false)
    expect(aplicarEco(docCon(undefined), eco())).toBe(false)
    expect(aplicarEco(null, eco())).toBe(false)
  })

  it('una página a medio cargar es un "todavía no", no una avería', () => {
    const roto = {
      leer: () => 1,
      aplicar: () => {
        throw new Error('todavía no')
      },
    }
    expect(aplicarEco(docCon(roto), eco())).toBe(false)
  })
})
