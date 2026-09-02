// El puntero: que la sala vea QUÉ estás señalando dentro de la página viva.
//
// El espejo (`espejo.ts`) lleva la URL, y con eso la sala ve la misma página.
// Lo que no ve es el ratón: el ponente pasa por encima de una fila de la tabla
// de facturas, esa fila se ilumina en su portátil, y en los treinta equipos de
// la sala no pasa nada. Delante de un jurado eso es peor que no señalar: se
// habla de "esta fila" y cada quien mira la suya.
//
// LO QUE VIAJA ES UNA RUTA, NO PÍXELES NI DOM. Del elemento bajo el ratón se
// manda el camino de índices de hijo desde la raíz del documento
// (`[1,3,0,5]`), su etiqueta como sello, y en qué fracción de su caja está el
// puntero. El seguidor resuelve esa ruta en SU copia de la misma página y pinta
// el hover ahí. Tres consecuencias, y las tres son la razón de hacerlo así:
//
//  · Es independiente de la resolución. Un proyector 4:3 y un portátil 16:9
//    tienen la misma fila tercera; no tienen el mismo píxel (240, 512).
//  · Es diminuto. Una ruta son cuarenta bytes y cabe en el reporte de posición
//    que ya se hace dos veces por segundo, sin clave nueva en el camino
//    caliente ni escritor nuevo.
//  · No puede pintar lo que no existe. Si el seguidor está en otra página, la
//    ruta no resuelve o el sello no cuadra, y no pasa nada. Un espejo de
//    píxeles habría dibujado un cursor flotando sobre la página que no es.
//
// EL HOVER DE CSS NO SE PUEDE FALSIFICAR con eventos: `:hover` lo decide el
// navegador por dónde está el ratón de verdad, y un `mouseover` sintético no lo
// mueve. Lo que sí se puede es duplicar las REGLAS: por cada una que use
// `:hover` se escribe su gemela con `[data-puntero]`, y marcar el elemento con
// ese atributo enciende exactamente el mismo estilo. Es la única vía que no
// pasa por inyectar eventos en la página, que además dispararían sus menús y
// sus tooltips en cada equipo de la sala.
//
// SOLO LA PÁGINA VIVA, no la lámina. En `/present-admin` el mazo tiene el
// `body` inerte a propósito (§11.3): el ratón ni siquiera llega a sus
// elementos, así que no hay hover del mazo que espejar. Lo que se refleja es lo
// único que se toca.
//
// Partido en dos mitades como `lienzo.ts`, y por lo mismo: las REGLAS son puras
// y están probadas en `tests/presentacion-puntero.test.ts`; la LECTURA toca el
// DOM del iframe y se prueba delante de la página real.

/* ==================================================================== *
 * REGLAS (puras)
 * ==================================================================== */

/** Dónde está el ratón, en coordenadas del DOM y no de la pantalla. */
export type Objetivo = {
  /** Índices de hijo desde `documentElement` hasta el elemento señalado. */
  ruta: number[]
  /** La etiqueta del elemento, en minúsculas. Sello barato contra el desfase. */
  tag: string
  /** Dónde cae el puntero dentro de su caja, de 0 a 1. */
  fx: number
  fy: number
}

/**
 * Lo que publica `/present-admin` y leen los seguidores.
 *
 * `objetivo: null` no es un mensaje vacío: significa "el ratón ya no está sobre
 * nada de la página viva" y es lo que apaga el cursor y el hover en la sala.
 * Sin él, salir del iframe dejaría una fila iluminada para siempre.
 *
 * El `pos` ata el puntero a SU diapositiva, igual que en el espejo: al cambiar
 * de beat, el de la anterior deja de aplicarse solo.
 */
export type Puntero = { pos: number; seq: number; objetivo: Objetivo | null }

/** Hasta dónde se acepta una ruta. Ninguna página del mazo anida cuarenta
 *  niveles, y un número suelto tiene que tener un techo. */
export const PROFUNDIDAD_MAX = 40
/** Índice de hijo más alto que se acepta. Mismo motivo. */
export const INDICE_MAX = 5_000
/**
 * Cuánto se tiene que mover el puntero DENTRO del mismo elemento para que valga
 * la pena contarlo. Sin esto, un pulso quieto sobre un botón publicaría dos
 * veces por segundo durante toda la charla; con esto, quieto es gratis.
 */
export const UMBRAL = 0.02

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const fraccion = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1

/**
 * Valida lo que venga del almacén o de la red. `null` ante cualquier duda: la
 * sala sin puntero es una degradación (se ve la página igual), y un objetivo
 * inventado es un cursor señalando lo que no es.
 */
export function parsearPuntero(v: unknown): Puntero | null {
  const c = typeof v === 'string' ? seguroJson(v) : v
  if (!c || typeof c !== 'object') return null
  const { pos, seq, objetivo } = c as Record<string, unknown>
  if (!entero(pos) || pos < 1) return null
  if (!entero(seq) || seq < 0) return null
  if (objetivo === null || objetivo === undefined) return { pos, seq, objetivo: null }
  const o = parsearObjetivo(objetivo)
  return o === null ? null : { pos, seq, objetivo: o }
}

function parsearObjetivo(v: unknown): Objetivo | null {
  if (!v || typeof v !== 'object') return null
  const { ruta, tag, fx, fy } = v as Record<string, unknown>
  if (!Array.isArray(ruta) || ruta.length === 0 || ruta.length > PROFUNDIDAD_MAX) return null
  if (!ruta.every((n) => entero(n) && n >= 0 && n <= INDICE_MAX)) return null
  // El sello se compara literalmente contra `tagName.toLowerCase()`, así que
  // cualquier cosa que no sea un nombre de etiqueta no puede cuadrar nunca.
  if (typeof tag !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(tag)) return null
  if (!fraccion(fx) || !fraccion(fy)) return null
  return { ruta: ruta as number[], tag, fx, fy }
}

function seguroJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * ¿Este mensaje sustituye al que ya teníamos? Solo con un `seq` mayor. El bus
 * no garantiza orden, y sin esta comparación un mensaje que llegue tarde
 * devolvería el cursor a donde estaba hace medio segundo.
 */
export function esMasNuevo(entrante: Puntero, actual: Puntero | null): boolean {
  return !actual || entrante.seq > actual.seq
}

/** El puntero que toca para esta diapositiva, o `null` si es de otra. */
export function punteroPara(p: Puntero | null, pos: number): Puntero | null {
  return p && p.pos === pos ? p : null
}

/**
 * ¿Son el mismo señalamiento? Mismo elemento y sin haberse movido lo bastante
 * dentro de él. La tolerancia es lo que separa "el ponente está señalando el
 * botón" de "el ponente tiene el pulso de un ser humano".
 */
export function mismoObjetivo(a: Objetivo | null, b: Objetivo | null): boolean {
  if (a === null || b === null) return a === b
  if (a.tag !== b.tag || a.ruta.length !== b.ruta.length) return false
  if (!a.ruta.every((n, i) => n === b.ruta[i])) return false
  return Math.abs(a.fx - b.fx) < UMBRAL && Math.abs(a.fy - b.fy) < UMBRAL
}

/**
 * El mensaje a publicar, o `null` si no hay nada nuevo que contar. El `seq` lo
 * lleva el emisor y solo sube, derivado del anterior y no del reloj: dos
 * mensajes en el mismo milisegundo empatarían y el segundo se descartaría.
 *
 * Un cambio de diapositiva SIEMPRE cuenta como novedad aunque el ratón no se
 * haya movido: el puntero de la anterior ya no se aplica, y sin republicarlo la
 * sala se quedaría sin cursor hasta el próximo temblor de la mano.
 */
export function siguientePuntero(
  pos: number,
  objetivo: Objetivo | null,
  anterior: Puntero | null
): Puntero | null {
  if (anterior && anterior.pos === pos && mismoObjetivo(anterior.objetivo, objetivo)) return null
  if (!anterior && objetivo === null) return null
  return { pos, seq: (anterior?.seq ?? 0) + 1, objetivo }
}

/* -------------------------------------------------------------------- *
 * Las reglas de CSS, que también son puras
 * -------------------------------------------------------------------- */

/** El atributo que enciende en el seguidor lo que en el ponente enciende el
 *  ratón. Se pone en el elemento señalado Y en sus ancestros, porque una regla
 *  como `.fila:hover .celda` se dispara desde arriba. */
export const ATRIBUTO = 'data-puntero'

/** Marca del `<style>` que inyecta el espejo, para no volver a leerlo. */
export const MARCA = 'puntero-espejo'

/**
 * `a:hover .x` -> `a[data-puntero] .x`.
 *
 * Sustitución literal y no un parser de selectores a propósito: la especificidad
 * de `[data-puntero]` es idéntica a la de `:hover` (0,1,0), así que la gemela no
 * gana ni pierde contra el resto de la hoja por serlo; gana los empates solo
 * porque se inyecta al final. Cambiar eso por una clase (0,1,0 también) daría
 * igual, pero un `#id` o un `!important` reordenarían la cascada de la página
 * espejada y el resultado dejaría de ser el mismo que ve el ponente.
 */
export function selectorEspejado(sel: string): string {
  return sel.replace(/:hover\b/g, `[${ATRIBUTO}]`)
}

/** ¿Vale la pena duplicar esta regla? */
export function tieneHover(sel: string): boolean {
  return /:hover\b/.test(sel)
}

/**
 * Resuelve el `&` del anidamiento nativo. Hace falta de verdad: Tailwind 4 no
 * emite `.hover\:underline:hover{...}` sino `.hover\:underline{&:hover{...}}`,
 * y sin resolverlo se perdería el hover de casi toda la interfaz del portal,
 * que es justo la página que se enseña.
 *
 * El padre con comas se envuelve en `:is(...)`: `a,b` y `&` da `:is(a,b) x`, y
 * no `a,b x`, que significaría otra cosa.
 */
export function combinarSelector(padre: string, hijo: string): string {
  if (!padre) return hijo
  const p = padre.includes(',') ? `:is(${padre})` : padre
  return hijo.includes('&') ? hijo.replace(/&/g, p) : `${p} ${hijo}`
}

/* ==================================================================== *
 * LECTURA (navegador)
 * ==================================================================== */

/**
 * El camino del elemento desde la raíz, por índices de hijo ELEMENTO (no de
 * nodo): los textos y los comentarios no cuentan, así que un espacio en blanco
 * de más en el HTML de una de las dos copias no descuadra la ruta.
 *
 * `null` si el elemento no cuelga de la raíz o si está más hondo de lo que se
 * acepta.
 */
export function rutaDe(el: Element): number[] | null {
  const ruta: number[] = []
  let n: Element | null = el
  const raiz = el.ownerDocument?.documentElement
  if (!raiz) return null
  while (n && n !== raiz) {
    const padre: Element | null = n.parentElement
    if (!padre) return null
    const i = [...padre.children].indexOf(n)
    if (i < 0 || i > INDICE_MAX) return null
    ruta.unshift(i)
    if (ruta.length > PROFUNDIDAD_MAX) return null
    n = padre
  }
  return n === raiz && ruta.length > 0 ? ruta : null
}

/** El elemento al que apunta una ruta en ESTE documento, o `null`. */
export function resolverRuta(doc: Document, ruta: number[]): Element | null {
  let n: Element | undefined = doc.documentElement
  for (const i of ruta) {
    n = n?.children[i]
    if (!n) return null
  }
  return n ?? null
}

/**
 * Qué se está señalando, leído del ratón. `null` si el punto no cae sobre nada
 * aprovechable, que es lo que se publica al salirse de la página.
 *
 * `elementFromPoint` y no `event.target` porque son distintos donde importa: el
 * `target` de un `mousemove` es el elemento con el evento, y bajo un contenedor
 * con `pointer-events:none` eso es el ancestro, no lo que se ve debajo.
 */
export function objetivoDe(doc: Document, x: number, y: number): Objetivo | null {
  const el = doc.elementFromPoint(x, y)
  if (!el || el === doc.documentElement) return null
  const ruta = rutaDe(el)
  if (!ruta) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  const acotar = (n: number) => Math.min(Math.max(n, 0), 1)
  return {
    ruta,
    tag: el.tagName.toLowerCase(),
    // Redondeado a dos decimales: es la resolución que `UMBRAL` distingue, y
    // así el mensaje no engorda con doce decimales de un ratón que tiembla.
    fx: Number(acotar((x - r.left) / r.width).toFixed(2)),
    fy: Number(acotar((y - r.top) / r.height).toFixed(2)),
  }
}

/**
 * Duplica en `doc` las reglas de `:hover` con su gemela de `[data-puntero]`.
 *
 * Idempotente por documento y fail-open en cada hoja por separado: una hoja de
 * otro origen (una tipografía de Google, por ejemplo) lanza al leer sus reglas
 * y solo se pierde ella. Se vuelve a llamar cuando la página viva navega,
 * porque entonces es otro documento.
 */
export function espejarHover(doc: Document): void {
  try {
    const marcado = doc as Document & { __hoverEspejado?: boolean }
    if (marcado.__hoverEspejado) return
    marcado.__hoverEspejado = true
    const gemelas: string[] = []
    for (const hoja of [...doc.styleSheets]) {
      try {
        if ((hoja.ownerNode as HTMLElement | null)?.dataset?.espejo === MARCA) continue
        recogerHover(hoja.cssRules, '', [], gemelas)
      } catch {
        // Hoja de otro origen: no se puede leer y no pasa nada más.
      }
    }
    if (!gemelas.length) return
    const style = doc.createElement('style')
    style.dataset.espejo = MARCA
    style.textContent = gemelas.join('\n')
    // Al final del `head` y no del `body`: una hoja del `body` se aplica igual,
    // pero algunas páginas reordenan sus hijos y la perderían.
    ;(doc.head ?? doc.documentElement).appendChild(style)
  } catch {
    // Documento a medio cargar o de otro origen: sin espejo de hover, que es
    // una degradación y no una avería.
  }
}

/** Recorre las reglas arrastrando el envoltorio (`@media`, `@supports`,
 *  `@layer`) y el selector del padre, que es lo que el anidamiento necesita. */
function recogerHover(
  reglas: CSSRuleList,
  padre: string,
  envolturas: string[],
  fuera: string[]
): void {
  for (const regla of [...reglas]) {
    const grupo = regla as CSSGroupingRule & { selectorText?: string; style?: CSSStyleDeclaration }
    const esEstilo = typeof grupo.selectorText === 'string'
    if (esEstilo) {
      const sel = combinarSelector(padre, grupo.selectorText as string)
      const decls = grupo.style?.cssText ?? ''
      if (decls && tieneHover(sel)) fuera.push(envolver(envolturas, selectorEspejado(sel), decls))
      // Un `&:hover` puede colgar de una regla sin hover ninguno, que es
      // exactamente lo que emite Tailwind: hay que bajar siempre.
      if (grupo.cssRules) recogerHover(grupo.cssRules, sel, envolturas, fuera)
      continue
    }
    const prelude = preludeDe(regla)
    if (grupo.cssRules && prelude) recogerHover(grupo.cssRules, padre, [...envolturas, prelude], fuera)
  }
}

/** El encabezado de una regla de grupo, o `null` si no es de las que se copian
 *  (una `@font-face` o una `@keyframes` no tienen nada que espejar). */
function preludeDe(regla: CSSRule): string | null {
  const tipo = regla.constructor?.name ?? ''
  const texto = regla.cssText ?? ''
  if (!/^(CSSMediaRule|CSSSupportsRule|CSSLayerBlockRule|CSSContainerRule|CSSScopeRule)$/.test(tipo)) {
    return null
  }
  const i = texto.indexOf('{')
  return i > 0 ? texto.slice(0, i).trim() : null
}

const envolver = (envolturas: string[], sel: string, decls: string): string =>
  `${envolturas.map((e) => `${e}{`).join('')}${sel}{${decls}}${'}'.repeat(envolturas.length)}`

/**
 * Enciende el hover espejado en un elemento y sus ancestros, y apaga el
 * anterior. Devuelve lo que quedó marcado, que es lo que hay que pasarle a la
 * llamada siguiente: guardar la lista es más barato y más seguro que buscar el
 * atributo por el documento entero, y no deja nada encendido si la página
 * reemplaza el trozo del DOM que lo tenía.
 */
export function marcarHover(el: Element | null, marcados: Element[]): Element[] {
  for (const m of marcados) m.removeAttribute(ATRIBUTO)
  const nuevos: Element[] = []
  for (let n: Element | null = el; n; n = n.parentElement) {
    n.setAttribute(ATRIBUTO, '')
    nuevos.push(n)
  }
  return nuevos
}
