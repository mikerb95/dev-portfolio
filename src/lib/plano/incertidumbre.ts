// El cono de incertidumbre de Plano: cada componente parte del rango entero de
// horas que Mike aprobó, y cada pregunta respondida lo cierra hacia una franja.
//
// La franja de un componente es el promedio de las franjas de sus preguntas,
// contando [0, 1] por cada pregunta sin responder. Así el rango se estrecha de
// a poco con cada respuesta y nunca sale de la tabla: el peor caso es el
// rango entero, el mejor una franja estrecha dentro de él.
//
// Módulo PURO e isomorfo.

import { PREGUNTAS, type Pregunta } from '../../data/plano'
import type { Ajuste } from '../asistente/calculo-cotizacion'

export function preguntasDe(componenteId: string): Pregunta[] {
  return PREGUNTAS[componenteId] ?? []
}

/** Respuestas válidas de un componente: solo preguntas suyas y opciones que existen. */
export function respuestasValidas(componenteId: string, respuestas: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!respuestas || typeof respuestas !== 'object') return out
  for (const p of preguntasDe(componenteId)) {
    const v = Number((respuestas as Record<string, unknown>)[p.id])
    if (Number.isInteger(v) && v >= 0 && v < p.opciones.length) out[p.id] = v
  }
  return out
}

export function franjaDe(componenteId: string, respuestas: Record<string, number>): Ajuste {
  const ps = preguntasDe(componenteId)
  if (!ps.length) return [0, 1]
  let a = 0
  let b = 0
  for (const p of ps) {
    const idx = respuestas[p.id]
    const f = idx !== undefined ? p.opciones[idx]?.franja : undefined
    a += f ? f[0] : 0
    b += f ? f[1] : 1
  }
  // Redondeo a milésimas: evita que 0,1 + 0,2 deje basura de coma flotante en
  // el snapshot congelado y cambie su huella entre el navegador y el servidor.
  const r = (x: number) => Math.round((x / ps.length) * 1000) / 1000
  return [r(a), r(b)]
}

export function respondidas(componenteId: string, respuestas: Record<string, number>): number {
  return preguntasDe(componenteId).filter((p) => respuestas[p.id] !== undefined).length
}
