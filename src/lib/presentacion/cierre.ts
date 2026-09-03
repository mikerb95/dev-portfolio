// Cuándo se acabó la charla, y qué hacer entonces.
//
// Al llegar a la última diapositiva del mazo, `/present-admin` espera unos
// segundos y se va a `/presentacion-end`, que es la página que se comparte
// cuando la sustentación ya terminó (documentación, cifras del kanban y
// contacto). El mazo termina en "¿Preguntas?", así que lo que queda en pantalla
// durante el turno de preguntas es el cierre con los enlaces, no una lámina
// muerta.
//
// LA REGLA QUE HACE QUE ESTO NO SEA PELIGROSO ES LA CANCELACIÓN. Un salto al
// final por equivocación (la tecla `End`, un dígito de más en la rejilla) no
// puede secuestrar la ventana que conduce: mientras la cuenta corre, cualquier
// movimiento que salga de la última diapositiva la desarma. Y no se rearma sola
// por estar quieta ahí: solo al volver a entrar.
//
// Módulo puro: la decisión se prueba sin temporizadores ni navegación.

/** A dónde se va cuando la charla termina. */
export const RUTA_CIERRE = '/presentacion-end'

/**
 * Lo que se espera en la última diapositiva antes de irse. Cinco segundos: lo
 * bastante para que un paso de más se pueda deshacer, lo bastante poco para que
 * no parezca que la ventana se quedó colgada.
 */
export const ESPERA_MS = 5_000

/** Si hay una cuenta corriendo o no. */
export type Vigilancia = 'ocioso' | 'armado'

/** Qué hacer con la cuenta, mirando dónde está la pantalla. */
export type Orden = 'armar' | 'cancelar' | 'nada'

/**
 * La decisión, con la pantalla en `pos` de `total`.
 *
 * `aplicando` (el mazo moviéndose) cuenta como "no está en la última" aunque el
 * número ya coincida: si se está reconciliando es que alguien pidió otra cosa, y
 * armar la cuenta en mitad de un viaje sería irse justo cuando se acaba de
 * decidir volver.
 */
export function ordenDeCierre(
  v: Vigilancia,
  s: { pos: number; total: number; aplicando: boolean }
): Orden {
  const { pos, total, aplicando } = s
  const enLaUltima =
    Number.isInteger(pos) && Number.isInteger(total) && total >= 1 && pos >= total
  if (enLaUltima && !aplicando) return v === 'armado' ? 'nada' : 'armar'
  return v === 'armado' ? 'cancelar' : 'nada'
}

/** Los segundos que quedan para irse, para poder decirlo. */
export function segundosParaCierre(vence: number, ahora: number): number {
  if (!Number.isFinite(vence) || !Number.isFinite(ahora)) return 0
  return Math.max(0, Math.ceil((vence - ahora) / 1000))
}
