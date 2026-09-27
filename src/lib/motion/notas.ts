// Ritmo de la ficha de decisiones del hero de /notes. Módulo puro (sin DOM)
// para poder fijar con tests que ninguna ficha se va antes de poder leerse.

import type { Familia } from '../notes-meta'
import type { Paleta, Semilla } from './portadas'

/** Posición circular: `paso` puede ser negativo (ficha anterior). */
export function circular(i: number, total: number, paso = 1): number {
  if (total <= 0) return 0
  return (((i + paso) % total) + total) % total
}

export type Ritmo = {
  /** Segundos desde el inicio de la ficha en que empieza cada fase. */
  problema: number
  descartado: number
  tachon: number
  decidido: number
  /** Duración del tecleo de la decisión. */
  tecleo: number
  /** Cuándo la ficha queda completa y quieta. */
  completa: number
  /** Cuándo pasa a la siguiente. */
  total: number
}

/** Palabras por minuto con que se da por leída una ficha ya completa. */
const PPM_LECTURA = 230

/**
 * Tiempos de una ficha. El tecleo va a ritmo de escritura (no de lectura) y
 * se acorta en las decisiones largas para no pasar de ~2 s. Lo importante es
 * la estancia: la ficha se queda quieta, completa, el tiempo que tarda en
 * leerse entera a 230 palabras por minuto, con un mínimo de 4 s. Así una
 * ficha larga no se va a mitad de lectura y una corta no se eterniza.
 */
export function ritmoFicha(ficha: { problem: string; rejected: string; chosen: string }): Ritmo {
  const letras = [...ficha.chosen].length
  const porLetra = Math.min(0.045, Math.max(0.022, 2 / Math.max(1, letras)))
  const tecleo = +(letras * porLetra).toFixed(3)

  const problema = 0.35
  const descartado = 1.25
  const tachon = 1.75
  const decidido = 2.45
  const completa = +(decidido + tecleo).toFixed(3)

  const palabras = `${ficha.problem} ${ficha.rejected} ${ficha.chosen}`.split(/\s+/).filter(Boolean).length
  const estancia = Math.max(4, (palabras / PPM_LECTURA) * 60)
  return { problema, descartado, tachon, decidido, tecleo, completa, total: +(completa + estancia).toFixed(3) }
}

/** Lo que la ficha del hero necesita de cada nota (lo arma el servidor). */
export type FichaDato = {
  href: string
  titulo: string
  familia: Familia
  minutos: number
  claveMapa: string
  problem: string
  rejected: string
  chosen: string
  tema: string
  color: string
  semilla: Semilla
  paleta: Paleta
}

/**
 * Minutos que quedan de un artículo de `total` minutos con una fracción
 * `progreso` (0 a 1) ya leída. Redondea hacia arriba: "quedan ~0 min" con
 * media página por delante sería mentira; el 0 solo aparece al terminar.
 */
export function minutosRestantes(total: number, progreso: number): number {
  const p = Math.min(1, Math.max(0, progreso))
  if (p >= 0.98) return 0
  return Math.max(1, Math.ceil(total * (1 - p)))
}
