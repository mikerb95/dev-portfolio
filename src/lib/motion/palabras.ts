// Texto de una respuesta del asesor partido en palabras, con las cifras
// calculadas resaltadas. Separado del motion (sin GSAP) porque lo usan las
// dos formas de pintar una respuesta: la animada (motion/asesor.ts) y la
// quieta (movimiento reducido, o la conversación recuperada al recargar).
// Si solo la animada resaltara el precio, el mismo dato se vería distinto
// según cómo llegó.
//
// Módulo solo de navegador, sin dependencias.

/**
 * Parte `texto` en palabras dentro de `el`: cada palabra en un `<span
 * class="mw">` y los espacios y saltos de línea como texto suelto, para que
 * `white-space: pre-line` siga respetando los párrafos. Lo escribe todo con
 * textContent: el texto puede venir de un modelo y nunca se interpreta como
 * HTML.
 */
export function partirEnPalabras(el: HTMLElement, texto: string): HTMLElement[] {
  el.textContent = ''
  const palabras: HTMLElement[] = []
  for (const trozo of texto.split(/(\s+)/)) {
    if (!trozo) continue
    if (/^\s+$/.test(trozo)) {
      el.append(document.createTextNode(trozo))
      continue
    }
    const w = document.createElement('span')
    w.className = 'mw'
    w.textContent = trozo
    el.append(w)
    palabras.push(w)
  }
  return palabras
}

/** La parte numérica de una cifra escrita: "$5.100.000 COP" → "5.100.000". */
export function parteNumerica(cifra: string): string | null {
  return /\d(?:[\d.,]*\d)?/.exec(cifra)?.[0] ?? null
}

export type Precio = { el: HTMLElement; indice: number }

/**
 * Envuelve en `span.asesor-precio` la parte numérica de las palabras que
 * coinciden con una cifra calculada. Devuelve cada precio con el índice de su
 * palabra, para que la versión animada lo haga rodar cuando esa palabra
 * aparece.
 */
export function marcarPrecios(palabras: HTMLElement[], cifras: readonly string[]): Precio[] {
  const numeros = new Set(cifras.map(parteNumerica).filter((n): n is string => !!n))
  const precios: Precio[] = []
  if (!numeros.size) return precios
  palabras.forEach((w, indice) => {
    const texto = w.textContent ?? ''
    const num = parteNumerica(texto)
    if (!num || !numeros.has(num)) return
    const i = texto.indexOf(num)
    const precio = document.createElement('span')
    precio.className = 'asesor-precio'
    precio.textContent = num
    w.textContent = ''
    w.append(texto.slice(0, i), precio, texto.slice(i + num.length))
    precios.push({ el: precio, indice })
  })
  return precios
}

/** Pinta una respuesta quieta, con sus precios calculados resaltados. */
export function pintarRespuesta(el: HTMLElement, texto: string, cifras: readonly string[]): Precio[] {
  return marcarPrecios(partirEnPalabras(el, texto), cifras)
}
