// Reglas del control remoto de `/final.html`, sin Redis y sin `fetch`, para
// poder probarlas de verdad. Lo que vive aquí es lo único del sistema que
// puede equivocarse en silencio delante del público: acotar contra el final
// del mazo, decidir cuándo la pantalla adopta al mando y cuándo el mando manda
// sobre la pantalla.
//
// LA VERDAD ES EL BUNDLE. `final.html` es lo único que sabe cuántas
// diapositivas hay y en cuál está de verdad; el servidor no lo sabe ni le hace
// falta. Por eso el estado se parte en dos piezas con papeles distintos:
//
//   · `destino` - lo que pidió el teléfono. Una intención, no un hecho.
//   · `actual`  - { pos, total } que publica la pantalla cada vez que se mueve.
//
// Cuando las dos coinciden, el sistema está en reposo. Mientras difieren, la
// pantalla cierra la diferencia a flechazos. Que el estado sea una POSICIÓN
// ABSOLUTA y no una cola de comandos es lo que hace que un sondeo perdido no
// pierda nada: el siguiente trae el destino entero.

/** Diapositiva en la que está el bundle, tal como él mismo la reporta. */
export type Actual = { pos: number; total: number; ts: number }

/** Quién movió la presentación, que es lo que decide si se adopta o no. */
export type Origen = 'inicial' | 'latido' | 'mando' | 'ajena'

export const POS_INICIAL = 1
/** Tope de cordura mientras la pantalla no ha dicho cuántas hay. */
export const POS_MAX = 999

/**
 * Cuánto vale un `actual` antes de dejar de creerlo. La pantalla publica en
 * cada cambio, no en cada sondeo, así que un tramo largo de charla sobre la
 * misma diapositiva es normal y no debe leerse como "pantalla caída". Quince
 * segundos separan eso de una pestaña que se cerró.
 */
export const FRESCURA_MS = 15_000

export const esEntero = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n)

export function acotar(n: number, techo: number = POS_MAX): number {
  return Math.min(Math.max(n, POS_INICIAL), Math.max(techo, POS_INICIAL))
}

/**
 * El `actual` guardado, o `null` si no hay o está corrupto. Nunca lanza: un
 * JSON roto en Redis no puede tumbar el mando a mitad de la charla, solo
 * significa "todavía no sé dónde está la pantalla".
 */
export function parsearActual(crudo: string | null): Actual | null {
  if (!crudo) return null
  try {
    const v = JSON.parse(crudo) as Partial<Actual>
    if (!esEntero(v.pos) || !esEntero(v.total) || !esEntero(v.ts)) return null
    if (v.pos < POS_INICIAL || v.total < POS_INICIAL || v.pos > v.total) return null
    return { pos: v.pos, total: v.total, ts: v.ts }
  } catch {
    return null
  }
}

export function esFresco(actual: Actual | null, ahora: number): actual is Actual {
  return actual !== null && ahora - actual.ts < FRESCURA_MS
}

/**
 * Hasta dónde se puede pedir. Con la pantalla viva es su total real; sin ella,
 * el tope de cordura. Esto es lo que quita el desvío del final del mazo: antes
 * el mando podía pedir la 15 de un mazo de 14 y la corrección llegaba después,
 * con el botón ya pulsado y sin efecto visible.
 */
export function techo(actual: Actual | null, ahora: number): number {
  return esFresco(actual, ahora) ? actual.total : POS_MAX
}

/**
 * Un toque del mando. Se acumula sobre el DESTINO, no sobre la posición real:
 * tres toques seguidos mientras la pantalla anima valen tres, no uno.
 */
export function mover(destino: number, delta: number, tope: number): number {
  return acotar(destino + delta, tope)
}

/**
 * Qué destino queda cuando la pantalla publica su posición.
 *
 *  · `inicial` - acaba de cargar (o recargar). No adopta: si la charla iba por
 *    la 7 y la pestaña se recarga, el destino sigue siendo 7 y la pantalla se
 *    reconstruye sola hasta allí. Adoptar aquí sería perder la charla entera.
 *  · `latido`  - nadie se ha movido en un rato. Solo refresca la marca de
 *    tiempo, para que un tramo largo sobre la misma diapositiva no se lea como
 *    una pantalla caída y el mando no pierda el techo real del mazo.
 *  · `mando`   - se movió obedeciendo. El destino ya era ese; solo se acota.
 *  · `ajena`   - se movió sin que nadie lo pidiera (alguien tocó el teclado del
 *    portátil). Manda la realidad: el destino la adopta. Sin esto, el sondeo
 *    siguiente arrastraría la presentación de vuelta y pelearía con la persona
 *    que está delante del teclado.
 */
export function destinoTrasReporte(destino: number, actual: Actual, origen: Origen): number {
  return origen === 'ajena' ? acotar(actual.pos, actual.total) : acotar(destino, actual.total)
}
