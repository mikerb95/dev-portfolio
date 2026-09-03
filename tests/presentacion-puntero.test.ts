import { describe, expect, it } from 'vitest'
import {
  ABIERTO,
  ATRIBUTO,
  combinarSelector,
  debeVoltear,
  esMasNuevo,
  espejarHover,
  mismoObjetivo,
  parsearPuntero,
  PROFUNDIDAD_MAX,
  punteroPara,
  resolverRuta,
  rutaDe,
  PANEL_HOLGURA,
  POPOVER,
  selectorEspejado,
  sincronizarPopover,
  siguientePuntero,
  tieneHover,
  UMBRAL,
  VOLTEADO,
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
    expect(
      parsearPuntero(pnt({ objetivo: obj({ ruta: ['1'] as unknown as number[] }) }))
    ).toBeNull()
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
    const a = siguientePuntero(14, obj({ ruta: [1] }), pnt({ seq: 3 }))
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

  it('no toca el :hover ESCAPADO de un nombre de clase de Tailwind', () => {
    // `.md\:hover\:bg-x` es un nombre de clase, no una pseudoclase. Sustituirlo
    // ahí dentro no daría una regla de más: daría una regla rota, y encima en
    // la página que se enseña.
    expect(tieneHover(String.raw`.md\:hover\:bg-x`)).toBe(false)
    expect(selectorEspejado(String.raw`.md\:hover\:bg-x:hover`)).toBe(
      String.raw`.md\:hover\:bg-x[${ATRIBUTO}]`
    )
  })

  it('preguntar dos veces por el mismo selector responde lo mismo', () => {
    // `test` con un regex global arrastra `lastIndex`: el mismo selector diría
    // que sí y luego que no, y media hoja se quedaría sin gemela por el orden
    // en que se leyó.
    expect(tieneHover('a:hover')).toBe(true)
    expect(tieneHover('a:hover')).toBe(true)
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

/* ==================================================================== *
 * La mitad que toca el DOM
 *
 * Los tests corren en `environment: 'node'` y no hay jsdom, así que el
 * documento se finge: son objetos con lo justo que estas dos funciones miran.
 * Fingirlo es exactamente el punto - lo que se quiere probar no es el
 * navegador, es el aplanado de reglas anidadas y la ida y vuelta de la ruta,
 * que es donde está el filo y lo que rompería en silencio.
 * ==================================================================== */

/** Un elemento con lo que `rutaDe` y `resolverRuta` necesitan. */
type Nodo = {
  tagName: string
  children: Nodo[]
  parentElement: Nodo | null
  ownerDocument: { documentElement: Nodo }
}

function arbol(spec: string[]): { raiz: Nodo; nodo: (ruta: number[]) => Nodo } {
  const doc = { documentElement: null as unknown as Nodo }
  const crear = (tag: string): Nodo =>
    ({
      tagName: tag.toUpperCase(),
      children: [],
      parentElement: null,
      ownerDocument: doc,
    }) as Nodo
  const raiz = crear('html')
  doc.documentElement = raiz
  // `spec` es una lista de rutas "1/0/2:tag" colgadas de la raíz, en orden.
  for (const linea of spec) {
    const [camino, tag] = linea.split(':')
    const idx = camino.split('/').map(Number)
    let n = raiz
    for (let i = 0; i < idx.length; i++) {
      const k = idx[i]
      if (!n.children[k]) {
        const hijo = crear(i === idx.length - 1 ? tag : 'div')
        hijo.parentElement = n
        n.children[k] = hijo
      }
      n = n.children[k]
    }
  }
  const nodo = (ruta: number[]) => ruta.reduce((n, k) => n.children[k], raiz)
  return { raiz, nodo }
}

describe('rutaDe y resolverRuta', () => {
  const { raiz, nodo } = arbol(['1/3/0:tr', '0/0:link'])
  const doc = { documentElement: raiz } as unknown as Document

  it('la ruta va y vuelve al mismo elemento', () => {
    const el = nodo([1, 3, 0])
    const ruta = rutaDe(el as unknown as Element)
    expect(ruta).toEqual([1, 3, 0])
    expect(resolverRuta(doc, ruta as number[])).toBe(el)
  })

  it('la raíz no es un objetivo: no hay nada que señalar en el <html>', () => {
    expect(rutaDe(raiz as unknown as Element)).toBeNull()
  })

  it('una ruta que no existe devuelve null en vez del elemento de al lado', () => {
    // Es lo que pasa cuando el seguidor está en otra página, y es la diferencia
    // entre no pintar nada y señalar la fila que no es.
    expect(resolverRuta(doc, [1, 3, 9])).toBeNull()
    expect(resolverRuta(doc, [1, 3, 0, 0])).toBeNull()
  })

  it('un elemento suelto, sin raíz encima, no da ruta', () => {
    const huerfano = {
      tagName: 'DIV',
      children: [],
      parentElement: null,
      ownerDocument: { documentElement: raiz },
    }
    expect(rutaDe(huerfano as unknown as Element)).toBeNull()
  })
})

/* Un CSSOM de mentira: `espejarHover` solo mira `cssRules`, `selectorText`,
 * `style.cssText` y `cssText`, así que con eso basta para probar el aplanado. */
const reglaEstilo = (selectorText: string, cssText: string, hijas: unknown[] = []) => ({
  selectorText,
  style: { cssText },
  ...(hijas.length ? { cssRules: hijas } : {}),
})

class CSSMediaRule {
  constructor(
    public cssText: string,
    public cssRules: unknown[]
  ) {}
}

function docFalso(reglas: unknown[]) {
  const inyectados: { dataset: Record<string, string>; textContent: string }[] = []
  const doc = {
    styleSheets: [{ ownerNode: null, cssRules: reglas }],
    createElement: () => ({ dataset: {} as Record<string, string>, textContent: '' }),
    head: {
      appendChild: (n: { dataset: Record<string, string>; textContent: string }) => {
        inyectados.push(n)
      },
    },
    querySelectorAll: () => [] as unknown[],
  }
  return { doc: doc as unknown as Document, inyectados }
}

describe('espejarHover', () => {
  it('duplica la regla plana y deja intacta la original', () => {
    const { doc, inyectados } = docFalso([reglaEstilo('.fila:hover', 'background: #111')])
    espejarHover(doc)
    expect(inyectados).toHaveLength(1)
    expect(inyectados[0].textContent).toBe(`.fila[${ATRIBUTO}]{background: #111}`)
  })

  it('no duplica lo que no tiene hover', () => {
    const { doc, inyectados } = docFalso([reglaEstilo('.fila', 'background: #111')])
    espejarHover(doc)
    expect(inyectados).toHaveLength(0)
  })

  it('baja al anidamiento de Tailwind y conserva el @media de dentro', () => {
    // `.hover\:underline { &:hover { @media (hover:hover) { ... } } }`, que es
    // la forma real que emite Tailwind 4. Sin bajar por la regla padre -que no
    // tiene hover ninguno- se perdería entera.
    const dentro = reglaEstilo('&', 'text-decoration-line: underline')
    const media = new CSSMediaRule('@media (hover: hover) { }', [dentro])
    const padre = reglaEstilo(String.raw`.hover\:underline`, '', [
      reglaEstilo('&:hover', '', [media]),
    ])
    const { doc, inyectados } = docFalso([padre])
    espejarHover(doc)
    expect(inyectados[0].textContent).toBe(
      `@media (hover: hover){.hover\\:underline[${ATRIBUTO}]{text-decoration-line: underline}}`
    )
  })

  it('una hoja que no se deja leer no se lleva por delante a las demás', () => {
    // Una tipografía de Google lanza al tocar `cssRules`. Fail-open hoja por
    // hoja: se pierde ella y solo ella.
    const ajena = {
      ownerNode: null,
      get cssRules(): unknown[] {
        throw new Error('cross-origin')
      },
    }
    const { doc, inyectados } = docFalso([reglaEstilo('a:hover', 'color: red')])
    ;(doc.styleSheets as unknown as unknown[]).unshift(ajena)
    espejarHover(doc)
    expect(inyectados[0].textContent).toBe(`a[${ATRIBUTO}]{color: red}`)
  })
})

/* Un popover de mentira, con lo poco que `sincronizarPopover` toca de él: la
 * lista de clases, el ancestro más cercano y la caja. */
function popoverFalso(caja: { top: number; bottom: number }, panelAlto = 200) {
  const clases = new Set<string>()
  const nodo = {
    clases,
    classList: {
      add: (...c: string[]) => c.forEach((x) => clases.add(x)),
      remove: (...c: string[]) => c.forEach((x) => clases.delete(x)),
      contains: (c: string) => clases.has(c),
    },
    querySelector: () => ({ offsetHeight: panelAlto }),
    getBoundingClientRect: () => caja,
  }
  const dentro = { closest: () => nodo }
  return { nodo, dentro }
}

function docConPopovers(abiertos: unknown[], alto = 800) {
  return {
    defaultView: { innerHeight: alto },
    querySelectorAll: () => abiertos,
  } as unknown as Document
}

describe('debeVoltear', () => {
  const caja = (top: number, bottom: number) => ({ top, bottom })

  it('no voltea si el panel cabe debajo', () => {
    expect(debeVoltear(caja(100, 200), 220, 800)).toBe(false)
  })

  it('voltea si no cabe debajo y sí encima', () => {
    expect(debeVoltear(caja(500, 600), 220, 800)).toBe(true)
  })

  it('no voltea si no cabe en ninguno de los dos lados', () => {
    // Es lo que hace el componente en el portátil del ponente, así que es lo
    // que tiene que verse en la sala: abierto hacia abajo aunque se corte.
    expect(debeVoltear(caja(100, 300), 220, 400)).toBe(false)
  })

  it('la holgura cuenta contra el borde', () => {
    const justo = 800 - (220 + PANEL_HOLGURA)
    expect(debeVoltear(caja(justo - 100, justo), 220, 800)).toBe(false)
    expect(debeVoltear(caja(justo - 99, justo + 1), 220, 800)).toBe(true)
  })
})

describe('sincronizarPopover', () => {
  it('abre el popover que contiene al elemento señalado', () => {
    const { nodo, dentro } = popoverFalso({ top: 100, bottom: 200 })
    sincronizarPopover(docConPopovers([]), dentro as unknown as Element)
    expect(nodo.clases.has(ABIERTO)).toBe(true)
    expect(nodo.clases.has(VOLTEADO)).toBe(false)
  })

  it('voltea el panel cuando debajo no cabe', () => {
    const { nodo, dentro } = popoverFalso({ top: 600, bottom: 700 })
    sincronizarPopover(docConPopovers([]), dentro as unknown as Element)
    expect(nodo.clases.has(VOLTEADO)).toBe(true)
  })

  it('cierra el que estaba abierto al señalar otro', () => {
    const viejo = popoverFalso({ top: 100, bottom: 200 })
    viejo.nodo.classList.add(ABIERTO, VOLTEADO)
    const nuevo = popoverFalso({ top: 100, bottom: 200 })
    sincronizarPopover(
      docConPopovers([viejo.nodo]),
      nuevo.dentro as unknown as Element
    )
    expect(viejo.nodo.clases.has(ABIERTO)).toBe(false)
    expect(viejo.nodo.clases.has(VOLTEADO)).toBe(false)
    expect(nuevo.nodo.clases.has(ABIERTO)).toBe(true)
  })

  it('sin objetivo cierra todo', () => {
    const abierto = popoverFalso({ top: 100, bottom: 200 })
    abierto.nodo.classList.add(ABIERTO)
    sincronizarPopover(docConPopovers([abierto.nodo]), null)
    expect(abierto.nodo.clases.has(ABIERTO)).toBe(false)
  })

  it('no reescribe el que ya está abierto', () => {
    // Correría dos veces por segundo: volver a poner la clase reiniciaría la
    // transición de entrada del panel en cada vuelta.
    const { nodo, dentro } = popoverFalso({ top: 600, bottom: 700 })
    nodo.classList.add(ABIERTO)
    sincronizarPopover(docConPopovers([nodo]), dentro as unknown as Element)
    expect(nodo.clases.has(VOLTEADO)).toBe(false)
  })

  it('un elemento fuera de cualquier popover no abre nada', () => {
    const suelto = { closest: () => null }
    const abierto = popoverFalso({ top: 100, bottom: 200 })
    abierto.nodo.classList.add(ABIERTO)
    sincronizarPopover(docConPopovers([abierto.nodo]), suelto as unknown as Element)
    expect(abierto.nodo.clases.has(ABIERTO)).toBe(false)
  })

  it('la clase del contenedor es la del componente', () => {
    expect(POPOVER).toBe('card-pop')
  })
})
