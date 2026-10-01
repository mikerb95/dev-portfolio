// Temporadas del sitio: hoy solo Halloween (todo octubre).
//
// Módulo puro: lo usa el layout en el servidor para marcar el <html> y la
// portada para decidir cuántos espectros cruzan el terreno. Sin fecha fija en
// el código ni interruptor manual: se enciende el 1 de octubre y se apaga el
// 1 de noviembre solo, sin que haya que desplegar nada.

export type Temporada = 'halloween' | null

const ZONA = 'America/Bogota'

/** Mes (1..12) de una fecha en hora de Bogotá, que es donde vive el sitio. */
function mesEnBogota(fecha: Date): number {
  const mes = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, month: 'numeric' }).format(fecha)
  return Number(mes)
}

export function temporadaActual(fecha: Date = new Date()): Temporada {
  return mesEnBogota(fecha) === 10 ? 'halloween' : null
}

export const MAX_ESPECTROS = 7
export const MAX_ESPECTROS_MOVIL = 3

/**
 * Cuántos espectros cruzan el terreno según el tráfico hostil clasificado en
 * la ventana del pulso. Escala logarítmica: el clasificador cuenta miles de
 * peticiones en un mes normal y una escala lineal saturaría siempre en el
 * máximo, con lo que la cifra dejaría de decir nada.
 * Sin tráfico (o sin dato, que llega como 0) no hay espectros: un fantasma
 * inventado sería justo lo que la cinta del pulso se niega a hacer.
 */
export function espectrosPara(eventos: number, maximo: number = MAX_ESPECTROS): number {
  if (!Number.isFinite(eventos) || eventos <= 0 || maximo <= 0) return 0
  const n = Math.round(Math.log10(eventos + 1) * 2)
  return Math.min(maximo, Math.max(Math.min(3, maximo), n))
}
