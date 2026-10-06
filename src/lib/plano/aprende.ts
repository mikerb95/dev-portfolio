// Aprende: compara las horas estimadas con las reales y sugiere ajustar la
// tabla.
//
// Hoy no hay historial (0 briefings con horas reales en la base), así que esto
// arranca vacío y se llena con cada propuesta convertida en la que Mike anote
// cuánto le tomó cada componente. Nunca cambia la tabla solo: sugiere, y Mike
// decide si edita src/data/tarifario.ts.
//
// Módulo PURO e isomorfo.

import { COMPONENTES, REGLAS } from '../../data/tarifario'

export type Medicion = {
  componenteId: string
  /** Horas estimadas en la propuesta (techo del rango, sin colchón). */
  estimadas: number
  reales: number
}

export type Calibracion = {
  componenteId: string
  nombre: string
  muestras: number
  /** Real / estimado, promedio. 1 = la tabla acierta. */
  factor: number
  /** Qué hacer, en una frase. */
  sugerencia: string
  confiable: boolean
}

/** Con menos de esto, cualquier sugerencia sería ruido. */
export const MUESTRAS_MINIMAS = 3

export function calibrar(mediciones: readonly Medicion[]): Calibracion[] {
  const grupos = new Map<string, Medicion[]>()
  for (const m of mediciones) {
    if (!(m.estimadas > 0) || !(m.reales >= 0)) continue
    const g = grupos.get(m.componenteId) ?? []
    g.push(m)
    grupos.set(m.componenteId, g)
  }
  const out: Calibracion[] = []
  for (const [id, ms] of grupos) {
    const def = COMPONENTES.find((c) => c.id === id)
    if (!def) continue
    const factor = Math.round((ms.reduce((t, m) => t + m.reales / m.estimadas, 0) / ms.length) * 100) / 100
    const confiable = ms.length >= MUESTRAS_MINIMAS
    // El colchón ya cubre un desvío de hasta su tamaño: solo vale la pena
    // tocar la tabla cuando lo real se sale de él.
    const holgura = REGLAS.colchon
    let sugerencia: string
    if (!confiable) sugerencia = `Faltan ${MUESTRAS_MINIMAS - ms.length} mediciones para sugerir algo.`
    else if (factor > 1 + holgura) {
      const nuevo: [number, number] = [Math.ceil(def.horas[0] * factor), Math.ceil(def.horas[1] * factor)]
      sugerencia = `Te toma un ${Math.round((factor - 1) * 100)} % más de lo estimado, más que el colchón. Considera subir la tabla a ${nuevo[0]}-${nuevo[1]} h.`
    } else if (factor < 1 - holgura) {
      sugerencia = `Te toma un ${Math.round((1 - factor) * 100)} % menos. Podrías bajar la tabla y ser más competitivo.`
    } else sugerencia = 'La tabla acierta dentro del colchón. No hay que tocar nada.'
    out.push({ componenteId: id, nombre: def.nombre, muestras: ms.length, factor, sugerencia, confiable })
  }
  return out.sort((a, b) => b.muestras - a.muestras)
}
