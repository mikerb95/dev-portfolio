import type { APIRoute } from 'astro'
import { db } from '../db'
import { appSettings, cronRuns } from '../db/schema'
import { eq, gt, max } from 'drizzle-orm'
import { CRONS } from '../data/automatizaciones'
import {
  decidirAvisos,
  jobsEnSilencio,
  parseEstado,
  tocaChequear,
  ventanaMin,
  type CronVigilado,
  type Silencio,
} from './cron-silencio'

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


// ---------------------------------------------------------------------------
// Detector de silencio (dead man's switch)
//
// La bitácora sola no avisa: hace falta alguien que la mire. Esto es esa parte,
// y vive aquí, junto a la tabla que consulta. La decisión de qué cuenta como
// silencio es pura y está en `cron-silencio.ts`, con sus pruebas.
// ---------------------------------------------------------------------------

/** Clave única en `app_settings` para el estado anti-repetición de los avisos. */
const CLAVE_ESTADO = 'cron_silencio'

const VIGILADOS: CronVigilado[] = CRONS.map((c) => ({
  job: c.job,
  cadaMin: c.cadaMin,
  origen: c.origen,
}))

/**
 * Última ejecución de cada job dentro de una ventana de tiempo.
 *
 * El `where` sobre la fecha no es un filtro cosmético: convierte la consulta en
 * un rango sobre `cron_runs_created_idx` en vez de un escaneo de la tabla, que
 * es lo que se factura en Turso. Un job que no aparezca en el resultado lleva
 * callado, como mínimo, toda la ventana.
 */
export async function ultimasCorridas(desde: Date): Promise<Map<string, Date>> {
  const filas = await db
    .select({ job: cronRuns.job, ultima: max(cronRuns.createdAt) })
    .from(cronRuns)
    .where(gt(cronRuns.createdAt, desde))
    .groupBy(cronRuns.job)

  const m = new Map<string, Date>()
  for (const f of filas) {
    if (f.ultima) m.set(f.job, f.ultima instanceof Date ? f.ultima : new Date(Number(f.ultima) * 1000))
  }
  return m
}

/**
 * Revisa la bitácora y devuelve los silencios que toca avisar ahora mismo.
 *
 * Devuelve lista vacía (nunca lanza) si algo falla: es observabilidad, y el
 * fail-open del repo manda. Que el vigilante no pueda opinar no puede tumbar al
 * cron que lo hospeda.
 */
export async function silenciosPorAvisar(ahora: Date): Promise<Silencio[]> {
  try {
    // El estado se lee ANTES que la bitácora, y no al revés: es una fila por
    // clave primaria, y si dice que la revisión anterior es reciente se evita
    // la consulta cara. `uptime-check` entra aquí cada 5 min; esta guarda es lo
    // que hace que eso cueste una lectura trivial casi siempre.
    const [fila] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, CLAVE_ESTADO))
      .limit(1)

    const previo = parseEstado(fila?.value)
    if (!tocaChequear(previo, ahora)) return []

    const desde = new Date(ahora.getTime() - ventanaMin(VIGILADOS) * 60_000)
    const silencios = jobsEnSilencio(VIGILADOS, await ultimasCorridas(desde), ahora)

    const { avisos, estado } = decidirAvisos(silencios, previo, ahora)

    // Se escribe siempre: el estado también sirve para OLVIDAR a los que se
    // recuperaron, y ese olvido es lo que hace que una recaída avise enseguida.
    const valor = JSON.stringify(estado)
    await db
      .insert(appSettings)
      .values({ key: CLAVE_ESTADO, value: valor, updatedAt: ahora })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: valor, updatedAt: ahora } })

    return avisos
  } catch (e) {
    console.error('[cron-silencio]', e)
    return []
  }
}
