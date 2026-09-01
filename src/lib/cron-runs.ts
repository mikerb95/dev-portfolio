import type { APIRoute } from 'astro'
import { db } from '../db'
import { cronRuns } from '../db/schema'

// Bitácora de ejecuciones de los crons.
//
// POR QUÉ EXISTE: hasta ahora una tarea programada solo dejaba su efecto (un
// backup nuevo, un sondeo escrito), nunca la ejecución. Un cron que deja de
// dispararse no produce ningún error: produce silencio, y el silencio no se
// nota. Los sondeos de monitores se cortaron tres semanas de 2026 y el hueco
// apareció mirando el historial, no por una alerta.
//
// FAIL-OPEN, como el resto de la observabilidad del repo: si el registro falla,
// el cron sigue su curso y devuelve lo que iba a devolver. Un registro que
// puede tumbar la tarea que observa es peor que no tener registro.
//
// Se AWAITA en vez de dispararse y olvidarse (el patrón de `recordSecurityEvent`)
// porque aquí no hay un usuario esperando la respuesta: un cron puede permitirse
// los milisegundos del insert, y a cambio la fila queda escrita seguro, sin
// depender de que la función serverless siga viva después del `return`.

/** Recorta a algo que quepa en una tarjeta y no arrastre un volcado entero. */
const LIMITE_DETALLE = 300

const resumir = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = typeof v === 'string' ? v : String(v)
  const limpio = s.replace(/\s+/g, ' ').trim()
  if (!limpio) return null
  return limpio.length > LIMITE_DETALLE ? `${limpio.slice(0, LIMITE_DETALLE - 1)}…` : limpio
}

export async function registrarCronRun(
  job: string,
  ok: boolean,
  durationMs: number,
  detail?: unknown
): Promise<void> {
  try {
    await db.insert(cronRuns).values({
      job,
      ok,
      durationMs,
      detail: resumir(detail),
      createdAt: new Date(),
    })
  } catch {
    // Base caída o con la cuota agotada. El cron ya hizo (o intentó hacer) su
    // trabajo; perder la anotación no puede convertirse en un fallo del cron.
  }
}

/**
 * Envuelve el handler de un cron para dejar constancia de que corrió.
 *
 * Los 401 y 403 NO se registran a propósito: `/api/cron/*` es público y recibe
 * escaneo constante, así que anotar los rechazos llenaría la tabla de ruido y
 * enterraría justo lo que se quiere ver, que es el calendario real. Solo cuenta
 * lo que pasó la puerta.
 */
export function conRegistro(job: string, handler: APIRoute): APIRoute {
  return async (context) => {
    const inicio = Date.now()
    try {
      const res = await handler(context)
      if (res.status !== 401 && res.status !== 403) {
        await registrarCronRun(job, res.ok, Date.now() - inicio, `HTTP ${res.status}`)
      }
      return res
    } catch (e) {
      // Se anota y se vuelve a lanzar: la excepción sigue su camino normal
      // hacia el log de la plataforma, pero deja rastro visible en el panel.
      await registrarCronRun(job, false, Date.now() - inicio, e instanceof Error ? e.message : e)
      throw e
    }
  }
}
