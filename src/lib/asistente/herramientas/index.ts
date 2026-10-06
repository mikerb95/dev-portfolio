// Catálogo de herramientas del asistente del panel (docs/plan-asistente.md).
//
// Este catálogo es SOLO LECTURA, y una prueba lo comprueba
// (tests/asistente-herramientas.test.ts): lo comparten la terminal y el panel.
// Las escrituras viven aparte (src/lib/asistente/escrituras/) y solo las
// expone el motor del panel, que se detiene a pedir aprobación antes de
// ejecutar cada una. La seguridad no está aquí: en la terminal la responde el
// analista del micro-SIEM como subagente (agents/asistente/motor.ts).
//
// Importa `src/db`: solo servidor.

import { HERRAMIENTAS_BANDEJA } from './bandeja'
import { HERRAMIENTAS_DOCUMENTACION } from './documentacion'
import { HERRAMIENTAS_NEGOCIO } from './negocio'
import { HERRAMIENTAS_OPERACION } from './operacion'
import { HERRAMIENTAS_PAGOS } from './pagos'
import { HERRAMIENTAS_PANEL } from './panel'
import { HERRAMIENTAS_VENCIMIENTOS } from './vencimientos'
import { fallo, type Herramienta, type Resultado } from './tipos'

export type { Herramienta, Resultado }

export const HERRAMIENTAS: Herramienta[] = [
  ...HERRAMIENTAS_NEGOCIO,
  ...HERRAMIENTAS_PAGOS,
  ...HERRAMIENTAS_VENCIMIENTOS,
  ...HERRAMIENTAS_BANDEJA,
  ...HERRAMIENTAS_OPERACION,
  ...HERRAMIENTAS_DOCUMENTACION,
  ...HERRAMIENTAS_PANEL,
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
