// El mazo COMPLETO, no solo los beats.
//
// `final.html` es un bundle exportado que se reemplaza entero cada vez que se
// itera la presentación, así que aquí no puede haber ni un número suyo
// cableado: ni cuántos beats trae, ni cuántas capas, ni qué z-index usan. Lo
// único que se asume es su forma, que es la de cualquier mazo:
//
//   capas de entrada  →  beats numerados  →  capas de cierre
//   (cita, portada)      (los que pinten     (¿preguntas?, y lo que venga
//                         "NN / MM")          detrás)
//
// El bundle solo sabe contar beats: su contador dice "01 / 19" tanto en la
// cita como en la portada, y "19 / 19" en el cierre. Derivar la posición de
// ese contador -que es lo que se hacía- deja cuatro diapositivas reales
// colapsadas en dos números: el mando gastaba tres flechas en un toque al
// arrancar y el cierre era sencillamente inalcanzable, porque el servidor
// acota el destino contra un total que no lo incluía.
//
// Aquí la posición es un índice GLOBAL sobre las tres zonas. El módulo es
// puro a propósito: es la única parte del sistema que puede equivocarse en
// silencio delante del público, y se prueba sin DOM ni bundle.

/** Cuántas piezas tiene el mazo en cada zona. Lo descubre `/presentacion`. */
export type Mazo = { intro: number; beats: number; outro: number }

/**
 * Una posición, en los términos de quien la tiene que ejecutar.
 *
 * En las capas, `idx` va SIEMPRE en orden de aparición, no de z-index: la
 * capa de entrada 0 es la que se ve primero (la más alta, porque tapa a las
 * demás) y la de cierre 0 es la primera que sale (la más baja, porque las
 * siguientes se apilan encima).
 */
export type Punto =
  | { zona: 'intro'; idx: number }
  | { zona: 'beat'; beat: number }
  | { zona: 'outro'; idx: number }

/** Lo que hay que hacerle a la pantalla para dar UN paso. */
export type Accion =
  | { tipo: 'tecla'; tecla: 'ArrowRight' | 'ArrowLeft' }
  | { tipo: 'capa'; zona: 'intro' | 'outro'; idx: number; visible: boolean }

const acotar = (n: number, min: number, max: number) =>
  Math.min(Math.max(Math.trunc(n), min), Math.max(min, max))

export const totalGlobal = (m: Mazo): number => Math.max(m.intro + m.beats + m.outro, 1)

export function aGlobal(m: Mazo, p: Punto): number {
  if (p.zona === 'intro') return p.idx + 1
  if (p.zona === 'beat') return m.intro + p.beat
  return m.intro + m.beats + p.idx + 1
}

export function aPunto(m: Mazo, g: number): Punto {
  const n = acotar(g, 1, totalGlobal(m))
  if (n <= m.intro) return { zona: 'intro', idx: n - 1 }
  if (n <= m.intro + m.beats) return { zona: 'beat', beat: n - m.intro }
  return { zona: 'outro', idx: n - m.intro - m.beats - 1 }
}

/**
 * Dónde está la pantalla, a partir de lo que se ve: qué capas están puestas y
 * qué beat pinta el contador. Una capa de entrada tapa todo lo que hay debajo,
 * así que manda la más alta de las que siguen puestas; en el cierre las capas
 * se apilan, así que manda la última.
 */
export function puntoDesdeCapas(
  m: Mazo,
  visto: { intro: boolean[]; outro: boolean[]; beat: number }
): Punto {
  const entrada = visto.intro.findIndex(Boolean)
  if (entrada !== -1) return { zona: 'intro', idx: entrada }
  const cierre = visto.outro.lastIndexOf(true)
  if (cierre !== -1) return { zona: 'outro', idx: cierre }
  return { zona: 'beat', beat: acotar(visto.beat, 1, m.beats) }
}

/** Qué capas deben estar puestas en un punto dado. */
export function capasDe(m: Mazo, p: Punto): { intro: boolean[]; outro: boolean[] } {
  return {
    intro: Array.from({ length: m.intro }, (_, k) => p.zona === 'intro' && k >= p.idx),
    outro: Array.from({ length: m.outro }, (_, k) => p.zona === 'outro' && k <= p.idx),
  }
}

/**
 * El siguiente paso hacia el destino, o `null` si ya se llegó.
 *
 * UN paso, no el camino entero: quien lo aplica vuelve a leer la pantalla
 * después de cada uno. Así un beat que no se movió (el bundle también consume
 * teclas sin avanzar) o una tecla que se perdió no descuadran el sistema, solo
 * gastan una vuelta más.
 *
 * Las teclas son SOLO para los beats. Las capas se ponen y se quitan por
 * fuera, que es justamente lo que hace la navegación reversible: el bundle no
 * sabe volver a su portada, pero la portada no es más que un div tapado.
 */
export function paso(m: Mazo, actual: Punto, destino: Punto): Accion | null {
  const aqui = aGlobal(m, actual)
  const alli = aGlobal(m, destino)
  if (aqui === alli) return null

  if (alli > aqui) {
    if (actual.zona === 'intro')
      return { tipo: 'capa', zona: 'intro', idx: actual.idx, visible: false }
    if (actual.zona === 'beat')
      return actual.beat < m.beats
        ? { tipo: 'tecla', tecla: 'ArrowRight' }
        : { tipo: 'capa', zona: 'outro', idx: 0, visible: true }
    return { tipo: 'capa', zona: 'outro', idx: actual.idx + 1, visible: true }
  }

  if (actual.zona === 'outro')
    return { tipo: 'capa', zona: 'outro', idx: actual.idx, visible: false }
  if (actual.zona === 'beat')
    return actual.beat > 1
      ? { tipo: 'tecla', tecla: 'ArrowLeft' }
      : { tipo: 'capa', zona: 'intro', idx: m.intro - 1, visible: true }
  return { tipo: 'capa', zona: 'intro', idx: actual.idx - 1, visible: true }
}

/**
 * Si al descubrir una capa de entrada el bundle todavía la cree suya.
 *
 * Al cargar, el bundle tiene sus capas de entrada "abiertas" y se traga una
 * flecha por cada una antes de mover un beat. Esa cuenta se consume una sola
 * vez y en orden, así que la primera vez que se retira una capa hay que
 * gastarle la tecla; a partir de ahí las capas son solo estilo y la tecla iría
 * a parar a un beat que nadie pidió.
 */
export const bundleAunLaTiene = (idx: number, consumidas: number): boolean => idx >= consumidas
