// Cuándo se acabó la charla, y qué hacer entonces.
//
// Al llegar a la última diapositiva del mazo, `/present-admin` espera unos
// segundos y se va a `/presentacion-end`, que es la página que se comparte
// cuando la sustentación ya terminó (documentación, cifras del kanban y
// contacto). El mazo termina en "¿Preguntas?", así que lo que queda en pantalla
// durante el turno de preguntas es el cierre con los enlaces, no una lámina
// muerta.
//
// TODA LA DIFICULTAD ESTÁ EN NO IRSE CUANDO NO TOCA, y son dos casos distintos:
//
//  1. El ponente llega al final por error (la tecla `End`, un dígito de más en
//     la rejilla). Lo resuelve la CANCELACIÓN: mientras la cuenta corre,
//     cualquier movimiento que salga de la última la desarma.
//
//  2. La ventana llega al final RECONSTRUYÉNDOSE, que es un escenario de
//     primera clase en este sistema (§11.1, origen `inicial`): el destino vive
//     en el servidor con TTL de seis horas, así que abrirla después de un
//     ensayo -o recargarla a mitad del turno de preguntas- la manda al final
//     sola. Sin defensa, sería una ventana que se va a la página de cierre en
//     cuanto se abre, y la única forma de recuperar el mazo sería pulsar
//     "anterior" antes de que corran cinco segundos.
//
// Lo segundo es lo que obliga a la fase `esperando`: la cuenta no se arma hasta
// que la ventana ha estado EN REPOSO fuera del final por lo menos una vez desde
// que cargó. Un viaje de reconstrucción nunca lo está (va persiguiendo un
// destino), y una charla de verdad lo está en cada diapositiva de la que se
// habla. Esa es la diferencia entre "llegué al final" y "aparecí en el final".
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

/**
 * · `esperando` - recién cargada. No se va a ninguna parte todavía.
 * · `listo`     - ha conducido de verdad; el final ya significa el final.
 * · `armado`    - la cuenta corre.
 */
export type Fase = 'esperando' | 'listo' | 'armado'

/** Qué hacer con el temporizador. */
export type Orden = 'armar' | 'cancelar' | 'nada'

/**
 * Una lectura de dónde está la pantalla.
 *
 * `moviendo` es cualquier cosa que signifique "esto no está quieto": el mazo
 * reconciliando, un destino que ya no es donde está, o -y esto es lo que hay
 * que recordar al cablearlo- **no saber todavía cuál es el destino**. Estar
 * quieto se afirma; deducirlo de no ver movimiento hace que el primer sondeo,
 * antes de haber preguntado nada, parezca reposo.
 */
export type Lectura = { pos: number; total: number; moviendo: boolean }

const creible = (l: Lectura): boolean =>
  Number.isInteger(l.pos) && Number.isInteger(l.total) && l.total >= 1

const enElFinal = (l: Lectura): boolean => creible(l) && l.pos >= l.total

/** Una posición creíble que no es la última: lo que hace falta para `listo`. */
const fueraDelFinal = (l: Lectura): boolean => creible(l) && l.pos < l.total

/**
 * La transición, con la fase que hay y lo que se acaba de leer.
 *
 * Cancelar devuelve a `listo` y no a `esperando`: quien se arrepintió ya estaba
 * conduciendo, y volver a entrar en la última tiene que volver a armar la
 * cuenta. Sin eso, cancelar una vez desactivaría el cierre para el resto de la
 * charla.
 */
export function siguienteFase(fase: Fase, l: Lectura): { fase: Fase; orden: Orden } {
  const quieto = !l.moviendo
  if (fase === 'armado') {
    if (enElFinal(l) && quieto) return { fase, orden: 'nada' }
    return { fase: 'listo', orden: 'cancelar' }
  }
  if (fase === 'listo' && enElFinal(l) && quieto) return { fase: 'armado', orden: 'armar' }
  if (fase === 'esperando' && fueraDelFinal(l) && quieto) return { fase: 'listo', orden: 'nada' }
  return { fase, orden: 'nada' }
}

/** Los segundos que quedan para irse, para poder decirlo. */
export function segundosParaCierre(vence: number, ahora: number): number {
  if (!Number.isFinite(vence) || !Number.isFinite(ahora)) return 0
  return Math.max(0, Math.ceil((vence - ahora) / 1000))
}
