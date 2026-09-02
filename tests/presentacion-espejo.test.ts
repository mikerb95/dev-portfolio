import { describe, expect, it } from 'vitest'
import {
  debeNavegar,
  esMasNuevo,
  parsearEspejo,
  siguienteEspejo,
  urlPara,
  type Espejo,
} from '../src/lib/presentacion/espejo'

const BASE = 'https://codebymike.tech'
const esp = (p: Partial<Espejo> = {}): Espejo => ({
  pos: 14,
  href: `${BASE}/portal`,
  seq: 1,
  ...p,
})

describe('parsearEspejo', () => {
  it('acepta un mensaje completo, venga como objeto o como texto', () => {
    const bueno = { pos: 14, href: `${BASE}/portal/facturas`, seq: 7 }
    expect(parsearEspejo(bueno, BASE)).toEqual(bueno)
    expect(parsearEspejo(JSON.stringify(bueno), BASE)).toEqual(bueno)
  })

  it('resuelve una ruta relativa contra el origen', () => {
    expect(parsearEspejo({ pos: 16, href: '/status', seq: 2 }, BASE)?.href).toBe(`${BASE}/status`)
  })

  it('rechaza lo que apunte fuera del sitio', () => {
    // La cadena entera es de un solo origen a propósito. Una URL ajena aquí
    // solo puede venir de un error o de alguien probando cosas.
    expect(parsearEspejo({ pos: 14, href: 'https://ejemplo.com/x', seq: 1 }, BASE)).toBeNull()
  })

  it('rechaza protocolos que no son de navegación', () => {
    // Un `javascript:` en un `location.replace` sería ejecución de código
    // venida de la red, y ninguna página del mazo lo necesita.
    expect(parsearEspejo({ pos: 14, href: 'javascript:alert(1)', seq: 1 }, BASE)).toBeNull()
    expect(parsearEspejo({ pos: 14, href: 'data:text/html,x', seq: 1 }, BASE)).toBeNull()
  })

  it('rechaza la basura sin lanzar', () => {
    for (const v of [null, undefined, 42, '', 'no es json', '{roto', {}, []]) {
      expect(parsearEspejo(v, BASE)).toBeNull()
    }
  })

  it('rechaza posiciones y secuencias imposibles', () => {
    expect(parsearEspejo({ pos: 0, href: `${BASE}/x`, seq: 1 }, BASE)).toBeNull()
    expect(parsearEspejo({ pos: 1.5, href: `${BASE}/x`, seq: 1 }, BASE)).toBeNull()
    expect(parsearEspejo({ pos: 1, href: `${BASE}/x`, seq: -1 }, BASE)).toBeNull()
    expect(parsearEspejo({ pos: 1, href: `${BASE}/x` }, BASE)).toBeNull()
  })
})

describe('esMasNuevo', () => {
  it('el primero siempre entra', () => {
    expect(esMasNuevo(esp({ seq: 1 }), null)).toBe(true)
  })

  it('un mensaje que llega tarde no deshace una navegación buena', () => {
    // El bus no garantiza orden. Sin esto, la sala volvería al login justo
    // después de que el ponente entrara al panel.
    const puesto = esp({ seq: 5, href: `${BASE}/portal` })
    expect(esMasNuevo(esp({ seq: 4, href: `${BASE}/portal/login` }), puesto)).toBe(false)
    expect(esMasNuevo(esp({ seq: 6 }), puesto)).toBe(true)
  })

  it('un empate no cuenta como nuevo', () => {
    expect(esMasNuevo(esp({ seq: 5 }), esp({ seq: 5 }))).toBe(false)
  })
})

describe('urlPara', () => {
  it('da la URL de SU diapositiva', () => {
    expect(urlPara(esp({ pos: 14 }), 14)).toBe(`${BASE}/portal`)
  })

  it('en otra diapositiva no hay URL, que es la vuelta al arranque del beat', () => {
    // Sin esto, la URL del panel seguiría aplicándose después de pasar a
    // /status y la sala vería la página que no es.
    expect(urlPara(esp({ pos: 14 }), 16)).toBeNull()
    expect(urlPara(null, 14)).toBeNull()
  })
})

describe('debeNavegar', () => {
  it('navega cuando la pedida es otra', () => {
    expect(debeNavegar(`${BASE}/portal`, `${BASE}/portal/login`)).toBe(true)
  })

  it('no recarga la página en la que ya está', () => {
    expect(debeNavegar(`${BASE}/portal`, `${BASE}/portal`)).toBe(false)
  })

  it('no toca nada si no hay URL para esta diapositiva', () => {
    expect(debeNavegar(null, `${BASE}/portal/login`)).toBe(false)
  })

  it('no le pisa la navegación al propio mazo', () => {
    // `actual` en null es "otro origen, o todavía no ha navegado". El bundle
    // monta esas páginas por su cuenta en algunos beats, y navegar mientras lo
    // está haciendo deja el iframe donde no toca.
    expect(debeNavegar(`${BASE}/portal`, null)).toBe(false)
  })
})

describe('siguienteEspejo', () => {
  it('el primero arranca en 1', () => {
    expect(siguienteEspejo(14, `${BASE}/portal/login`, null)).toEqual({
      pos: 14,
      href: `${BASE}/portal/login`,
      seq: 1,
    })
  })

  it('la secuencia solo sube', () => {
    const a = siguienteEspejo(14, `${BASE}/portal/login`, null)!
    const b = siguienteEspejo(14, `${BASE}/portal`, a)!
    const c = siguienteEspejo(16, `${BASE}/status`, b)!
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3])
  })

  it('sin novedad no se publica nada', () => {
    const a = esp({ pos: 14, href: `${BASE}/portal`, seq: 3 })
    expect(siguienteEspejo(14, `${BASE}/portal`, a)).toBeNull()
    expect(siguienteEspejo(14, null, a)).toBeNull()
  })

  it('la misma URL en otra diapositiva sí se publica', () => {
    // El vínculo es con la diapositiva, no solo con la dirección: volver al
    // beat 14 después de pasar por el 16 tiene que reponer su página.
    const a = esp({ pos: 14, href: `${BASE}/portal`, seq: 3 })
    expect(siguienteEspejo(16, `${BASE}/portal`, a)).toEqual({
      pos: 16,
      href: `${BASE}/portal`,
      seq: 4,
    })
  })
})
