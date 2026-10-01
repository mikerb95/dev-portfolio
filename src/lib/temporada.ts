// Temporadas del sitio: hoy solo Halloween (todo octubre).
//
// Módulo puro: lo usa el layout en el servidor para marcar el <html> y decidir
// si la portada lleva sus fantasmas. Sin fecha fija en
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
