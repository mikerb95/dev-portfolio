// Qué nota le toca a la posición en la que está la pantalla.
//
// El mando recibe del servidor un índice global y la forma del mazo; con eso y
// `aPunto` sabe si está en una capa de entrada, en un beat o en el cierre, y de
// ahí sale la nota. Es la razón de que la pantalla publique `intro` y `outro`
// junto a la posición: sin la forma, un índice global no dice de qué zona es.

import { GUION_BEATS, GUION_INTRO, GUION_OUTRO, type NotaGuion } from '../../data/guion-final'
import { aPunto, type Mazo, type Punto } from './mapa'

export type { NotaGuion }

/** La nota de un punto, o `null` si esa diapositiva todavía no tiene guion. */
export function notaDePunto(p: Punto): NotaGuion | null {
  const lista = p.zona === 'intro' ? GUION_INTRO : p.zona === 'outro' ? GUION_OUTRO : GUION_BEATS
  const idx = p.zona === 'beat' ? p.beat - 1 : p.idx
  return lista[idx] ?? null
}

/** La nota de una posición global. */
export const notaDeGlobal = (m: Mazo, g: number): NotaGuion | null => notaDePunto(aPunto(m, g))

/**
 * La forma del mazo tal como la publicó la pantalla. Devuelve `null` si no la
 * publicó: sin ella no se puede saber la zona, y enseñar la nota equivocada es
 * peor que no enseñar ninguna - en el mando, delante del público, se leería
 * como el guion de otra diapositiva.
 */
export function mazoPublicado(actual: {
  total: number
  intro?: number
  outro?: number
}): Mazo | null {
  const { total, intro, outro } = actual
  if (intro === undefined || outro === undefined) return null
  const beats = total - intro - outro
  return beats >= 1 ? { intro, beats, outro } : null
}
