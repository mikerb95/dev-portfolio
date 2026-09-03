// Descubrir la forma de `final.html` desde fuera.
//
// El bundle se reemplaza entero cada vez que se itera la presentación, así que
// nada suyo puede estar cableado: ni cuántos beats trae, ni cuántas capas, ni
// sus z-index, ni qué páginas mete en qué iframe. Lo que se busca son FORMAS,
// no identidades.
//
// Dos ventanas necesitan este código: `/presentacion`, que la mira, y
// `/present-admin`, que además la toca. Vive aquí para que no acaben con dos
// copias divergiendo, que es exactamente el fallo que nadie notaría hasta que
// una de las dos se quedara en la diapositiva de al lado.
//
// El módulo está partido en dos mitades y la línea entre ellas es deliberada:
//
//  · REGLAS: puras, sin DOM, probadas en `tests/presentacion-lienzo.test.ts`.
//    Es donde vive todo lo que costó una depuración.
//  · LECTURA: corre solo en el navegador, lee el DOM del iframe y le pasa a
//    las reglas lo que ha visto. No decide nada por su cuenta.
//
// Los tests corren en `environment: 'node'` y no hay jsdom, así que la segunda
// mitad no se prueba aquí: se prueba delante del mazo real. Por eso la primera
// se lleva toda la lógica que se pueda llevar.

/* ==================================================================== *
 * REGLAS (puras)
 * ==================================================================== */

/** Lo que pinta el contador del bundle, que solo sabe contar beats. */
export type Beat = { pos: number; total: number }

// La geometría se define UNA vez, y es en `desplazamiento.ts` porque es quien
// la usa para calcular el paso en el servidor. Aquí solo se produce. Dos
// definiciones estructuralmente iguales compilarían igual y se separarían el
// día que una de las dos ganara un campo.
export type { Geometria } from './desplazamiento'
import type { Geometria } from './desplazamiento'

/** Un rectángulo en coordenadas del escenario. */
export type Rect = { izq: number; arr: number; der: number; aba: number }

/** Lo que hace falta saber de una caja para decidir si recorta o si tapa. */
export type Caja = { position: string; overflow: string; oculto: boolean }

/**
 * Cuánto del escenario tiene que cubrir un iframe para contar como "la página
 * de la que se está hablando". Por debajo de eso es un adorno incrustado.
 */
export const COBERTURA_MINIMA = 0.15

/** Diferencia de píxeles por debajo de la cual dos medidas son la misma. */
export const RUIDO_PX = 2

/**
 * Los separadores que un mazo puede poner entre la posición y el total.
 *
 * La lista es explícita y `.` NO está dentro a propósito: con el punto, el
 * `8.1` del índice del dossier sería un contador perfectamente válido y el
 * sistema entero se colgaría de un número de sección.
 *
 * Que haya lista y no un solo carácter es la lección de la iteración del 3 de
 * septiembre de 2026: el mazo pasó de pintar `01 / 19` a pintar `/01 · 25`, un
 * cambio puramente tipográfico, y con la barra cableada el descubrimiento
 * devolvía `null` para siempre. El mando no se degradaba: no arrancaba.
 */
const SEPARADORES = '\\s/·|'

/** Solo cifras, separadores y espacios, con DOS números dentro: ni una letra. */
const SOLO_CONTADOR = new RegExp(
  `^[${SEPARADORES}]*\\d{1,3}[${SEPARADORES}]+\\d{1,3}[${SEPARADORES}]*$`
)

/**
 * "07 / 19" -> { pos: 7, total: 19 }. También "/07 · 19", y cualquier otra
 * decoración que el mazo le ponga alrededor mientras sean dos números.
 *
 * Si el texto es un contador y nada más, se leen sus dos números en orden. Si
 * no lo es -el respaldo de la lectura es el `innerText` del documento entero-
 * se cae a la forma clásica con barra, que es lo bastante estrecha para no
 * confundir una cifra cualquiera de una diapositiva con la posición.
 */
export function parsearContador(texto: string | null | undefined): Beat | null {
  const t = (texto ?? '').trim()
  const nums = esTextoDeContador(t)
    ? t.match(/\d{1,3}/g)
    : t.match(/(\d{1,3})\s*\/\s*(\d{1,3})/)?.slice(1)
  if (!nums || nums.length < 2) return null
  const pos = Number(nums[0])
  const total = Number(nums[1])
  return pos >= 1 && total >= pos ? { pos, total } : null
}

/** ¿El texto ENTERO de este elemento es un contador y nada más? */
export function esTextoDeContador(texto: string | null | undefined): boolean {
  return SOLO_CONTADOR.test((texto ?? '').trim())
}

/**
 * De los elementos cuyo texto entero es un contador, el que menos descendientes
 * tiene: el más interior, que es el que de verdad lo pinta.
 *
 * Se elige un ELEMENTO y no se lee el documento entero porque con una capa
 * delante el texto de la capa va primero y una cifra suya podría colarse en el
 * regex, dejando la posición pegada a un número que no significa nada.
 *
 * Devuelve el índice, o -1 si no hay ninguno.
 */
export function elegirContador(candidatos: { texto: string; descendientes: number }[]): number {
  let mejor = -1
  for (let i = 0; i < candidatos.length; i++) {
    const c = candidatos[i]
    if (!esTextoDeContador(c.texto)) continue
    if (mejor === -1 || c.descendientes < candidatos[mejor].descendientes) mejor = i
  }
  return mejor
}

/**
 * Reparte las capas en las dos zonas del mazo por lo que se ve EN EL ARRANQUE,
 * que es el único momento en que el bundle habla sin que nadie le haya tocado
 * nada: lo que ya está puesto va ANTES de los beats (cita, portada) y lo que
 * está oculto va DESPUÉS (el cierre, y lo que se le añada detrás).
 *
 * El orden dentro de cada zona también sale de la forma. En la entrada se ve
 * primero la más alta, porque tapa a las de abajo. En el cierre es al revés:
 * cada una se apila sobre la anterior, así que la primera es la más baja.
 *
 * Devuelve índices sobre la lista de entrada, no las capas: quien las tenga
 * sabrá con qué quedarse. Los empates conservan el orden del documento.
 */
export function clasificarCapas(capas: { z: number; visible: boolean }[]): {
  intro: number[]
  outro: number[]
} {
  const idx = capas.map((_, i) => i)
  return {
    intro: idx.filter((i) => capas[i].visible).sort((a, b) => capas[b].z - capas[a].z),
    outro: idx.filter((i) => !capas[i].visible).sort((a, b) => capas[a].z - capas[b].z),
  }
}

/**
 * ¿Esta caja es un VELO decorativo y no una diapositiva?
 *
 * Un grano de película o una viñeta también son divs apilados que cubren el
 * escenario entero, así que pasan todas las demás pruebas de `esCapa`. Lo que
 * los delata es que no reciben clics: una diapositiva del mazo se pulsa para
 * pasarla, un adorno se deja atravesar.
 *
 * Sin esta puerta, el `grano` que trajo el mazo de septiembre entraba como
 * capa de cierre (su opacidad de 0.035 lo hacía pasar por oculto) y añadía al
 * final una posición de más cuyo único efecto era subir el grano a opacidad 1
 * y tapar la pantalla de textura delante del jurado.
 */
export function esVeloDecorativo(s: { pointerEvents: string }): boolean {
  return s.pointerEvents === 'none'
}

/** ¿Esta caja está fuera de la vista? Media opacidad ya cuenta como ida. */
export function estaOculto(s: { display: string; visibility: string; opacity: string }): boolean {
  return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) <= 0.5
}

/**
 * De los ancestros de un elemento, cuáles lo RECORTAN de verdad. Devuelve sus
 * índices, o `null` si el elemento (o alguno de los que lo contienen) está
 * oculto y por tanto no hay nada que medir.
 *
 * Esta es la regla que costó la depuración, y no es teoría. Un `overflow:hidden`
 * solo recorta a los descendientes de los que es bloque contenedor. El mazo
 * cuelga su escenario de un `position:fixed` y deja `<body>` y `<html>` con
 * altura cero y `overflow:hidden`: midiendo contra TODO ancestro, esas dos
 * cajas vacías daban área cero y el iframe no se descubría nunca.
 *
 * De ahí las dos excepciones:
 *  · un ancestro estático no recorta a un descendiente absoluto;
 *  · por encima de un `fixed` ya no recorta nadie, y un elemento `fixed` no lo
 *    recorta ningún ancestro.
 *
 * Los ancestros se reciben como iterable y NO como lista para que quien los
 * produzca pueda hacerlo perezosamente: esto corre en el sondeo, dos veces por
 * segundo y por cada iframe del mazo, y `getComputedStyle` fuerza recálculo de
 * estilo. Casi siempre se para en el `fixed` del escenario a un par de saltos,
 * así que calcular la cadena entera por adelantado sería pagar el árbol
 * completo para tirar la mayor parte. Un array también es iterable, que es lo
 * que usan los tests.
 */
export function recortadoresDe(propio: Caja, ancestros: Iterable<Caja>): number[] | null {
  if (propio.oculto) return null
  if (propio.position === 'fixed') return []

  const recortan: number[] = []
  let saltarEstaticos = propio.position === 'absolute'
  let i = 0

  for (const a of ancestros) {
    if (a.oculto) return null
    if ((!saltarEstaticos || a.position !== 'static') && a.overflow !== 'visible') recortan.push(i)
    if (a.position === 'fixed') break
    if (a.position !== 'static') saltarEstaticos = a.position === 'absolute'
    i++
  }
  return recortan
}

/** Lo que queda de `r` después de pasarlo por todos los recortes. */
export function intersecar(r: Rect, recortes: Rect[]): Rect {
  return recortes.reduce(
    (acc, c) => ({
      izq: Math.max(acc.izq, c.izq),
      arr: Math.max(acc.arr, c.arr),
      der: Math.min(acc.der, c.der),
      aba: Math.min(acc.aba, c.aba),
    }),
    r
  )
}

/** El área de un rectángulo, nunca negativa. */
export function areaDe(r: Rect): number {
  return Math.max(r.der - r.izq, 0) * Math.max(r.aba - r.arr, 0)
}

/** ¿Este iframe se asoma lo bastante como para ser el de la diapositiva? */
export function superaCobertura(area: number, ancho: number, alto: number): boolean {
  return area > 0 && area >= ancho * alto * COBERTURA_MINIMA
}

/**
 * La geometría de la página de dentro, a partir de lo que diga su elemento de
 * scroll. `null` si no hay altura que medir: una página sin montar todavía no
 * se desplaza, y publicar una geometría de cero haría que el mando enseñara
 * unos controles que no mueven nada.
 *
 * `y` se ACOTA en vez de descartarse: el rebote elástico de iOS deja un
 * `scrollTop` fuera de rango durante unos fotogramas.
 */
export function geometriaDesde(m: {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}): Geometria | null {
  const alto = Math.round(m.clientHeight)
  if (!Number.isFinite(alto) || alto < 1) return null
  const max = Math.max(0, Math.round(m.scrollHeight - m.clientHeight))
  const y = Math.min(Math.max(Math.round(m.scrollTop), 0), max)
  return { y, max, alto }
}

/** Si dos geometrías dicen lo mismo, con el subpíxel perdonado. */
export function mismaGeometria(a: Geometria | undefined, b: Geometria | undefined): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.y - b.y) < RUIDO_PX && a.max === b.max && Math.abs(a.alto - b.alto) < RUIDO_PX
}

/* ==================================================================== *
 * LECTURA DEL DOM (solo navegador)
 *
 * Nada de aquí abajo decide: mira el iframe y le pasa a las reglas de arriba
 * lo que ha visto. Se importa desde `<script>` de una página, nunca desde el
 * servidor ni desde un test.
 * ==================================================================== */

/** Una capa descubierta: el elemento y el z-index con el que se ordenó. */
export type Capa = { el: HTMLElement; z: number }

/** Lo que sale de descubrir el mazo entero de una vez. */
export type Descubrimiento = {
  contador: HTMLElement
  intro: Capa[]
  outro: Capa[]
  beats: number
}

/** `getComputedStyle` DEL IFRAME. Con el de la página de fuera, los valores
 *  calculados de un documento ajeno no son los que el navegador está usando. */
export const estiloEn =
  (marco: HTMLIFrameElement) =>
  (e: Element): CSSStyleDeclaration =>
    marco.contentWindow!.getComputedStyle(e)

/** Una capa es cualquier cosa apilada que cubre el escenario entero. */
function esCapa(e: HTMLElement, estilo: (x: Element) => CSSStyleDeclaration): boolean {
  const s = estilo(e)
  if (s.position !== 'absolute' && s.position !== 'fixed') return false
  if (esVeloDecorativo(s)) return false
  const z = Number(s.zIndex)
  if (!Number.isFinite(z) || z < 1) return false
  const padre = (e.offsetParent as HTMLElement | null) ?? e.parentElement
  if (!padre || e.offsetWidth < 600) return false
  return e.offsetWidth >= padre.offsetWidth * 0.9 && e.offsetHeight >= padre.offsetHeight * 0.9
}

/** El elemento que pinta "NN / MM", o `null` si el bundle no ha montado. */
export function buscarContador(d: Document): HTMLElement | null {
  const els = [...d.querySelectorAll<HTMLElement>('div,span,p')]
  const i = elegirContador(
    els.map((e) => ({ texto: e.textContent ?? '', descendientes: e.querySelectorAll('*').length }))
  )
  return i === -1 ? null : els[i]
}

/**
 * Lee el beat actual del contador ya localizado, o del texto del documento si
 * ese elemento ya no está en el árbol (el bundle lo repinta al animar).
 */
export function leerBeat(d: Document | null, contador: HTMLElement | null): Beat | null {
  if (!d) return null
  return parsearContador(contador?.isConnected ? contador.textContent : d.body?.innerText)
}

/**
 * Descubre el mazo entero: el contador, las capas de entrada y las de cierre.
 *
 * `null` mientras no haya contador: sin él el bundle todavía no ha montado, y
 * descubrir ahora daría un mazo a medias que luego nadie volvería a mirar.
 */
export function descubrirMazo(marco: HTMLIFrameElement): Descubrimiento | null {
  const d = marco.contentDocument
  if (!d?.body) return null
  const contador = buscarContador(d)
  if (!contador) return null

  const estilo = estiloEn(marco)
  const els = [...d.body.querySelectorAll<HTMLElement>('div')].filter((e) => esCapa(e, estilo))
  const z = (e: HTMLElement) => Number(estilo(e).zIndex)
  const visible = (e: HTMLElement) =>
    estilo(e).visibility !== 'hidden' && Number(estilo(e).opacity) > 0.5

  const zonas = clasificarCapas(els.map((e) => ({ z: z(e), visible: visible(e) })))
  const capa = (i: number): Capa => ({ el: els[i], z: z(els[i]) })

  return {
    contador,
    intro: zonas.intro.map(capa),
    outro: zonas.outro.map(capa),
    beats: leerBeat(d, contador)?.total ?? 1,
  }
}

/**
 * Cuánto de un elemento se está viendo de verdad, en píxeles del escenario.
 *
 * No basta con su `getBoundingClientRect`, y esto NO es teoría: el mazo monta
 * las tres páginas desde el primer beat y las guarda en cajas plegadas de
 * 336x186 con `overflow:hidden`, que se despliegan al llegar a su diapositiva.
 * El rectángulo de un iframe ignora ese recorte y devuelve sus 1572x776 aunque
 * de él solo se asome una esquina, así que sin subir por los ancestros los tres
 * parecerían estar en pantalla a la vez y el mando desplazaría el que no es.
 *
 * Quién recorta a quién lo decide `recortadoresDe`, que es donde está la regla.
 */
export function areaVisible(
  el: HTMLElement,
  W: number,
  H: number,
  estilo: (x: Element) => CSSStyleDeclaration
): number {
  const caja = (e: Element): Caja => {
    const s = estilo(e)
    return { position: s.position, overflow: s.overflow, oculto: estaOculto(s) }
  }
  const rect = (e: Element): Rect => {
    const r = e.getBoundingClientRect()
    return { izq: r.left, arr: r.top, der: r.right, aba: r.bottom }
  }

  // Recoger los elementos es barato (subir punteros); calcular sus estilos no.
  // Por eso los primeros van a una lista y los segundos salen de un generador
  // que solo llega hasta donde `recortadoresDe` decida parar.
  const ancestros: HTMLElement[] = []
  for (let a = el.parentElement; a; a = a.parentElement) ancestros.push(a)
  function* cajas() {
    for (const a of ancestros) yield caja(a)
  }

  const recortan = recortadoresDe(caja(el), cajas())
  if (!recortan) return 0

  const pantalla: Rect = { izq: 0, arr: 0, der: W, aba: H }
  return areaDe(intersecar(rect(el), [pantalla, ...recortan.map((i) => rect(ancestros[i]))]))
}

/**
 * El iframe de la diapositiva actual: el visible más grande que se solape con
 * el escenario. Por forma y no por identidad, como todo lo demás: no se busca
 * "el iframe de /status".
 */
export function iframeEnJuego(marco: HTMLIFrameElement): HTMLIFrameElement | null {
  const d = marco.contentDocument
  if (!d?.documentElement) return null
  const estilo = estiloEn(marco)
  const W = d.documentElement.clientWidth
  const H = d.documentElement.clientHeight

  let mejor: HTMLIFrameElement | null = null
  let mayor = 0
  for (const f of d.querySelectorAll('iframe')) {
    const area = areaVisible(f, W, H, estilo)
    if (area > mayor) {
      mayor = area
      mejor = f
    }
  }
  return superaCobertura(mayor, W, H) ? mejor : null
}

/**
 * Dónde está la página de dentro y cuánto queda por bajar, o `null`.
 *
 * `null` sin ruido en los tres casos en que no hay nada que hacer: no hay
 * iframe, es de OTRO ORIGEN (que es lo que pasa en local, donde esas URLs
 * apuntan absolutas a producción) o la página cabe entera. Fail-open, como el
 * resto: el mando esconde los controles y el paso de diapositivas sigue igual.
 */
export function geometriaDe(f: HTMLIFrameElement | null): Geometria | null {
  if (!f) return null
  try {
    const d = f.contentDocument
    const e = d?.scrollingElement ?? d?.documentElement
    if (!e) return null
    return geometriaDesde({
      clientHeight: e.clientHeight,
      scrollHeight: e.scrollHeight,
      scrollTop: e.scrollTop,
    })
  } catch {
    // Otro origen. El navegador ya lo dice todo; aquí solo significa "esta
    // diapositiva no se desplaza".
    return null
  }
}

/**
 * La URL de la página de dentro, para el espejo. `null` si es de otro origen o
 * si todavía no ha navegado a ninguna parte (`about:blank`).
 */
export function urlDe(f: HTMLIFrameElement | null): string | null {
  if (!f) return null
  try {
    const href = f.contentWindow?.location.href
    return !href || href === 'about:blank' ? null : href
  } catch {
    return null
  }
}
