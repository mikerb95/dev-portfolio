// "Texto que se genera": palabras que pasan de borrosas a nítidas en orden de
// lectura. Es el gesto con el que el sitio dice "esto lo escribió una IA":
// lo usan el borrador de la mesa de trabajo (/capacitacion-ia) y las
// respuestas del asesor de la burbuja. Un solo lugar para sus valores, o los
// dos textos generados terminarían moviéndose distinto.
//
// Módulo solo de navegador.

import gsap from 'gsap'

/** Estado de partida de cada palabra y su animación hasta nítida. */
export const GENERADO = {
  desde: { opacity: 0, filter: 'blur(4px)' },
  hasta: { opacity: 1, filter: 'blur(0px)' },
  duracion: 0.25,
  /** Segundos entre una palabra y la siguiente. */
  paso: 0.032,
  ease: 'power1.out',
} as const

/**
 * Genera las palabras. `tope` limita la duración total: en una respuesta
 * larga, 0,032 s por palabra serían varios segundos esperando a leer lo que
 * ya llegó, así que el paso se acorta para que todo termine a tiempo.
 */
export function generar(palabras: HTMLElement[], opciones: { tope?: number; retraso?: number } = {}): gsap.core.Tween {
  const tope = opciones.tope ?? Infinity
  const paso = Math.min(GENERADO.paso, tope / Math.max(1, palabras.length))
  return gsap.fromTo(palabras, GENERADO.desde, {
    ...GENERADO.hasta,
    duration: GENERADO.duracion,
    ease: GENERADO.ease,
    stagger: paso,
    delay: opciones.retraso ?? 0,
    // Al terminar, las palabras vuelven a ser texto normal para el CSS (sin
    // filtro residual que el navegador tenga que componer).
    clearProps: 'filter,opacity',
  })
}
