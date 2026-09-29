// Texto del aviso al celular (ntfy) tras el análisis automático de cada
// mañana (src/pages/api/cron/analista-matutino.ts). Módulo puro.
//
// El aviso va a un tema de ntfy, un servicio de terceros: lleva alias
// (origen-04) y el veredicto, nunca una IP. Si el agente propone un bloqueo,
// el aviso es para decidirlo: el análisis queda pausado en la base hasta que
// entre a /admin/analista.

import type { Ejecucion } from './bucle'

export type Aviso = { titulo: string; cuerpo: string; prioridad: 3 | 4 }

const MAX_CUERPO = 400

/** Primera línea con texto de la respuesta: el veredicto, por formato del prompt. */
export function veredicto(respuesta: string | null): string | null {
  const linea = (respuesta ?? '').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('## '))
  return linea ? linea.replace(/^veredicto:\s*/i, '') : null
}

const recortar = (s: string) => (s.length > MAX_CUERPO ? `${s.slice(0, MAX_CUERPO - 1)}…` : s)

export function avisoMatutino(e: Ejecucion): Aviso {
  if (e.estado === 'esperando_aprobacion' && e.propuesta) {
    return {
      titulo: `Analista: propone bloquear a ${e.propuesta.origen}`,
      cuerpo: recortar(`${e.propuesta.motivo}\n\nEl análisis quedó esperando tu decisión en el panel.`),
      prioridad: 4,
    }
  }
  if (e.estado === 'terminada') {
    return {
      titulo: 'Analista: resumen de las últimas 24 horas',
      cuerpo: recortar(veredicto(e.respuesta) ?? 'El análisis terminó sin respuesta escrita.'),
      prioridad: 3,
    }
  }
  return {
    titulo: 'Analista: el análisis de la mañana falló',
    cuerpo: recortar(e.error ?? 'Sin detalle del error.'),
    prioridad: 3,
  }
}
