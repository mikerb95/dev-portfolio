// Catálogo de herramientas del asistente del panel (docs/plan-asistente.md).
//
// Fase 2: SOLO LECTURA. No hay ninguna herramienta que escriba en la base, y
// una prueba lo comprueba (tests/asistente-herramientas.test.ts): las
// escrituras llegan en las fases 3 a 5, cada una con su aprobación humana. La
// seguridad no está aquí: la responde el analista del micro-SIEM como
// subagente, con sus propias herramientas (agents/asistente/motor.ts).
//
// Importa `src/db`: solo servidor.

import { HERRAMIENTAS_BANDEJA } from './bandeja'
import { HERRAMIENTAS_DOCUMENTACION } from './documentacion'
import { HERRAMIENTAS_NEGOCIO } from './negocio'
import { HERRAMIENTAS_OPERACION } from './operacion'
import { fallo, type Herramienta, type Resultado } from './tipos'

export type { Herramienta, Resultado }

export const HERRAMIENTAS: Herramienta[] = [
  ...HERRAMIENTAS_NEGOCIO,
  ...HERRAMIENTAS_BANDEJA,
  ...HERRAMIENTAS_OPERACION,
  ...HERRAMIENTAS_DOCUMENTACION,
]

export const herramienta = (nombre: string) => HERRAMIENTAS.find((h) => h.nombre === nombre)

/**
 * Valida la entrada con el esquema y ejecuta. Nunca lanza: un error de la base
 * o una entrada inválida vuelven como resultado fallido, para que el modelo
 * pueda reaccionar en vez de tumbar la conversación.
 */
export async function ejecutar(nombre: string, entrada: unknown): Promise<Resultado> {
  const h = herramienta(nombre)
  if (!h) return fallo(`Herramienta desconocida: ${nombre}`)
  const parsed = h.esquema.safeParse(entrada ?? {})
  if (!parsed.success) return fallo(`Entrada inválida para ${nombre}: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
  try {
    return await h.ejecutar(parsed.data)
  } catch (err) {
    return fallo(`La consulta falló: ${err instanceof Error ? err.message : String(err)}`)
  }
}
