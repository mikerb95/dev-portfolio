import { describe, expect, it } from 'vitest'
import {
  ATRIBUTO,
  combinarSelector,
  esMasNuevo,
  mismoObjetivo,
  parsearPuntero,
  PROFUNDIDAD_MAX,
  punteroPara,
  selectorEspejado,
  siguientePuntero,
  tieneHover,
  UMBRAL,
  type Objetivo,
  type Puntero,
} from '../src/lib/presentacion/puntero'

const obj = (p: Partial<Objetivo> = {}): Objetivo => ({
  ruta: [1, 3, 0],
  tag: 'tr',
  fx: 0.5,
  fy: 0.5,
  ...p,
})

const pnt = (p: Partial<Puntero> = {}): Puntero => ({
  pos: 14,
  seq: 1,
  objetivo: obj(),
  ...p,
})

describe('parsearPuntero', () => {
  it('acepta un mensaje completo, venga como objeto o como texto', () => {
    const bueno = { pos: 14, seq: 7, objetivo: obj() }
    expect(parsearPuntero(bueno)).toEqual(bueno)
    expect(parsearPuntero(JSON.stringify(bueno))).toEqual(bueno)
  })

  it('acepta el mensaje que APAGA el cursor', () => {
    // `objetivo: null` no es un mensaje a medias: es "el ratón ya no está sobre
    // la página", y es lo único que apaga el hover en la sala.
    expect(parsearPuntero({ pos: 3, seq: 2, objetivo: null })).toEqual({
      pos: 3,
      seq: 2,
      objetivo: null,
    })
    expect(parsearPuntero({ pos: 3, seq: 2 })).toEqual({ pos: 3, seq: 2, objetivo: null })
  })

  it('rechaza la basura sin lanzar', () => {
    for (const v of [null, undefined, 42, '', 'no es json', '{roto', {}, []]) {
      expect(parsearPuntero(v)).toBeNull()
    }
  })

  it('rechaza posiciones y secuencias imposibles', () => {
    expect(parsearPuntero({ pos: 0, seq: 1, objetivo: null })).toBeNull()
    expect(parsearPuntero({ pos: 1.5, seq: 1, objetivo: null })).toBeNull()
    expect(parsearPuntero({ pos: 1, seq: -1, objetivo: null })).toBeNull()
  })

  it('rechaza rutas imposibles en vez de recortarlas', () => {
    // Una ruta rota resolvería en OTRO elemento, y señalar la fila que no es es
    // peor que no señalar nada.
    expect(parsearPuntero(pnt({ objetivo: obj({ ruta: [] }) }))).toBeNull()
    expect(parsearPuntero(pnt({ objetivo: obj({ ruta: [1, -1] }) }))).toBeNull()
    expect(parsearPuntero(pnt({ objetivo: obj({ ruta: [1, 2.5] }) }))).toBeNull()
    expect(parsearPuntero(pnt({ objetivo: obj({ ruta: ['1'] as unknown as number[] }) }))).toBeNull()
    const honda = Array.from({ length: PROFUNDIDAD_MAX + 1 }, () => 0)
    expect(parsearPuntero(pnt({ objetivo: obj({ ruta: honda }) }))).toBeNull()
  })

  it('rechaza un sello que no puede ser una etiqueta', () => {
    // El sello se compara contra `tagName.toLowerCase()`: lo que no lo parezca
    // no cuadraría nunca, así que se descarta en la puerta.
    expect(parsearPuntero(pnt({ objetivo: obj({ tag: 'TR' }) }))).toBeNull()
    expect(parsearPuntero(pnt({ objetivo: obj({ tag: 'div > a' }) }))).toBeNull()
    expect(parsearPuntero(pnt({ objetivo: obj({ tag: '' }) }))).toBeNull()
  })

  it('rechaza fracciones fuera de la caja', () => {
    expect(parsearPuntero(pnt({ objetivo: obj({ fx: 1.4 }) }))).toBeNull()
    expect(parsearPuntero(pnt({ objetivo: obj({ fy: -0.1 }) }))).toBeNull()
  })
})

describe('esMasNuevo', () => {
  it('el primero entra y los empatados no', () => {
    expect(esMasNuevo(pnt({ seq: 1 }), null)).toBe(true)
    expect(esMasNuevo(pnt({ seq: 5 }), pnt({ seq: 5 }))).toBe(false)
    expect(esMasNuevo(pnt({ seq: 4 }), pnt({ seq: 5 }))).toBe(false)
    expect(esMasNuevo(pnt({ seq: 6 }), pnt({ seq: 5 }))).toBe(true)
  })
})

describe('punteroPara', () => {
  it('el puntero de otra diapositiva no se aplica', () => {
    // Es la vuelta a "sin cursor" al cambiar de beat, sin escrituras ni
    // limpieza: la misma idea que ata el espejo y el scroll a su diapositiva.
    expect(punteroPara(pnt({ pos: 14 }), 14)?.pos).toBe(14)
    expect(punteroPara(pnt({ pos: 14 }), 15)).toBeNull()
    expect(punteroPara(null, 14)).toBeNull()
  })
})

describe('mismoObjetivo', () => {
  it('el pulso quieto sobre el mismo elemento no cuenta como movimiento', () => {
    expect(mismoObjetivo(obj({ fx: 0.5 }), obj({ fx: 0.5 + UMBRAL / 2 }))).toBe(true)
    expect(mismoObjetivo(obj({ fx: 0.5 }), obj({ fx: 0.5 + UMBRAL * 2 }))).toBe(false)
  })

  it('otro elemento es otro objetivo aunque el punto coincida', () => {
    expect(mismoObjetivo(obj({ ruta: [1, 3, 0] }), obj({ ruta: [1, 3, 1] }))).toBe(false)
    expect(mismoObjetivo(obj({ ruta: [1, 3] }), obj({ ruta: [1, 3, 0] }))).toBe(false)
    expect(mismoObjetivo(obj({ tag: 'tr' }), obj({ tag: 'td' }))).toBe(false)
  })

  it('salir de la página es un cambio, y seguir fuera no', () => {
    expect(mismoObjetivo(null, null)).toBe(true)
    expect(mismoObjetivo(obj(), null)).toBe(false)
    expect(mismoObjetivo(null, obj())).toBe(false)
  })
})

describe('siguientePuntero', () => {
  it('el primer señalamiento entra con seq 1', () => {
    expect(siguientePuntero(14, obj(), null)).toEqual({ pos: 14, seq: 1, objetivo: obj() })
  })

  it('no publica nada mientras el ratón no cambie de elemento', () => {
    const anterior = pnt({ pos: 14, seq: 3 })
    expect(siguientePuntero(14, obj({ fx: 0.5 + UMBRAL / 2 }), anterior)).toBeNull()
  })

  it('no publica nada si nunca ha habido ratón', () => {
    // Arrancar la charla sin tocar el ratón no puede gastar una escritura por
    // vuelta del sondeo.
    expect(siguientePuntero(14, null, null)).toBeNull()
  })

  it('el seq sube y sale del anterior, no del reloj', () => {
    // Dos mensajes en el mismo milisegundo empatarían, y un empate es un
    // mensaje descartado por el seguidor.
    const a = siguientePuntero(14, obj(), pnt({ seq: 3 }))
    expect(a?.seq).toBe(4)
    expect(siguientePuntero(14, obj({ ruta: [2] }), a)?.seq).toBe(5)
  })

  it('salir de la página se publica, porque es lo que apaga el cursor', () => {
    expect(siguientePuntero(14, null, pnt({ seq: 2 }))).toEqual({
      pos: 14,
      seq: 3,
      objetivo: null,
    })
  })

  it('cambiar de diapositiva republica aunque el ratón esté quieto', () => {
    // Sin esto, el puntero se quedaría atado al beat anterior y la sala se
    // quedaría sin cursor hasta el próximo temblor de la mano.
    const anterior = pnt({ pos: 14, seq: 9 })
    expect(siguientePuntero(15, obj(), anterior)).toEqual({ pos: 15, seq: 10, objetivo: obj() })
  })
})

describe('las reglas de CSS', () => {
  it('cambia el :hover por el atributo sin tocar el resto del selector', () => {
    expect(selectorEspejado('a:hover')).toBe(`a[${ATRIBUTO}]`)
    expect(selectorEspejado('.fila:hover .celda')).toBe(`.fila[${ATRIBUTO}] .celda`)
    expect(selectorEspejado('a:hover, button:hover')).toBe(
      `a[${ATRIBUTO}], button[${ATRIBUTO}]`
    )
  })

  it('no confunde :hover con un nombre que empieza igual', () => {
    expect(tieneHover('.hover-card')).toBe(false)
    expect(tieneHover('a:hover-intent')).toBe(false)
    expect(tieneHover('a:hover')).toBe(true)
    expect(selectorEspejado('.x:hoverable')).toBe('.x:hoverable')
  })

  it('resuelve el & del anidamiento que emite Tailwind', () => {
    // Tailwind 4 no emite `.hover\:underline:hover`, sino la regla anidada. Sin
    // resolver el `&` se perdería el hover de casi toda la interfaz del portal.
    expect(combinarSelector('.boton', '&:hover')).toBe('.boton:hover')
    expect(combinarSelector('', '.boton')).toBe('.boton')
  })

  it('un padre con comas se envuelve en :is', () => {
    // `a,b` con `& .x` no es `a,b .x`: eso solo aplicaría el descendiente a `b`.
    expect(combinarSelector('a,b', '& .x')).toBe(':is(a,b) .x')
    expect(combinarSelector('a,b', '.x')).toBe(':is(a,b) .x')
  })
})
