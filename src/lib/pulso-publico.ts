import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db'
import { cronRuns, monitorDaily, monitors, securityEvents, webVitals } from '../db/schema'
import { dayKeyUTC } from './monitor-rollup'
import { safeQuery } from './safe-query'

// Cifras agregadas del propio sitio para la cinta del hero.
//
// Sustituye a la lista de tecnologías que había ahí: un portafolio que se
// presenta como ingeniería de sistemas puede enseñar el sistema en vez de
// enumerar herramientas. Cada cifra tiene una página pública que la sostiene,
// y por eso viaja con su `href`: la cinta es un índice de lo verificable, no
// una decoración.
//
// Reparto con la card "Ahora" del bento (`/api/now`), que está a media pantalla
// de distancia: esa card cuenta lo ÚLTIMO que pasó (este deploy, este sondeo),
// esto cuenta la MAGNITUD acumulada. Ninguna cifra se repite entre las dos.
//
// Coste: Turso factura filas ESCANEADAS. Ninguna consulta de aquí toca
// `monitor_checks` (el uptime sale del resumen diario ya calculado por el cron)
// y las dos que barren por tiempo van acotadas a 24 h con LIMIT sobre su
// índice de fecha. La cinta está en la portada: es la ruta más visitada del
// sitio y la que menos puede permitirse una consulta cara.

const DAY_MS = 86_400_000
const VENTANA_DIAS = 30
// Muestras de LCP que se traen para el percentil. Con 24 h de tráfico normal
// no se llega a este techo; existe para que una punta de visitas no convierta
// la portada en un scan de miles de filas.
const MUESTRAS_LCP = 500

export type Pulso = {
  /** Fracción 0..1 de sondeos correctos en la ventana, o null si no hay datos. */
  uptime: number | null
  /** Sondeos ejecutados en la ventana. */
  sondeos: number
  /** Ventana en días de `uptime` y `sondeos`. */
  ventanaDias: number
  /** Peticiones hostiles clasificadas por el micro-SIEM en la ventana. */
  eventos: number
  /** Ejecuciones de cron en las últimas 24 h. */
  crons: { ok: number; total: number }
  /** p75 de LCP en milisegundos sobre las últimas 24 h, o null sin muestras. */
  lcpP75: number | null
}

/**
 * Percentil por el método del más cercano por rango (el mismo criterio que usa
 * Web Vitals para reportar p75). Puro y exportado para poder probarlo sin base:
 * un percentil mal calculado en la portada es una cifra falsa sobre el propio
 * sitio, que es justo lo que esta cinta existe para no ser.
 */
export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null
  const orden = [...valores].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * orden.length) - 1
  return orden[Math.min(Math.max(idx, 0), orden.length - 1)]
}

/**
 * Trunca hacia abajo, NO redondea.
 *
 * 20.303 sondeos buenos de 20.304 son un 99,9951% que `toFixed(2)` convierte en
 * "100,00%": la cinta acabaría afirmando que no ha fallado nada cuando sí falló
 * algo. Un indicador de disponibilidad que redondea a su favor no es un
 * indicador. Mismo criterio para el LCP: se enseña el peor valor del intervalo.
 */
export function truncar(valor: number, decimales: number): number {
  const factor = 10 ** decimales
  return Math.floor(valor * factor) / factor
}

export async function leerPulso(ahora = Date.now()): Promise<Pulso> {
  const desdeDia = dayKeyUTC(ahora - VENTANA_DIAS * DAY_MS)
  const desdeVentana = new Date(ahora - VENTANA_DIAS * DAY_MS)
  const desde24h = new Date(ahora - DAY_MS)

  // Fail-open por consulta y no por bloque: si el micro-SIEM no contesta, la
  // cinta pierde esa cifra y conserva las demás. Un dato ausente se omite; la
  // cinta nunca inventa un cero para rellenar el hueco (ver `senales()` en la
  // portada, que descarta las señales sin dato).
  const [uptimeRow, eventosRow, cronsRow, lcpRows] = await Promise.all([
    safeQuery(
      () =>
        db
          .select({
            total: sql<number>`coalesce(sum(${monitorDaily.total}), 0)`,
            ok: sql<number>`coalesce(sum(${monitorDaily.ok}), 0)`,
          })
          .from(monitorDaily)
          .innerJoin(monitors, eq(monitors.id, monitorDaily.monitorId))
          .where(
            and(
              eq(monitors.active, true),
              eq(monitors.paused, false),
              gte(monitorDaily.day, desdeDia),
            ),
          ),
      [] as { total: number; ok: number }[],
      'pulso/uptime',
    ),
    safeQuery(
      () =>
        db
          .select({ hits: sql<number>`coalesce(sum(${securityEvents.hits}), 0)` })
          .from(securityEvents)
          .where(gte(securityEvents.at, desdeVentana)),
      [] as { hits: number }[],
      'pulso/siem',
    ),
    safeQuery(
      () =>
        db
          .select({
            total: sql<number>`count(*)`,
            ok: sql<number>`coalesce(sum(case when ${cronRuns.ok} then 1 else 0 end), 0)`,
          })
          .from(cronRuns)
          .where(gte(cronRuns.createdAt, desde24h)),
      [] as { total: number; ok: number }[],
      'pulso/crons',
    ),
    safeQuery(
      () =>
        db
          .select({ value: webVitals.value })
          .from(webVitals)
          .where(and(eq(webVitals.metric, 'LCP'), gte(webVitals.createdAt, desde24h)))
          .orderBy(desc(webVitals.createdAt))
          .limit(MUESTRAS_LCP),
      [] as { value: number }[],
      'pulso/lcp',
    ),
  ])

  const total = Number(uptimeRow[0]?.total ?? 0)
  const ok = Number(uptimeRow[0]?.ok ?? 0)

  return {
    uptime: total > 0 ? ok / total : null,
    sondeos: total,
    ventanaDias: VENTANA_DIAS,
    eventos: Number(eventosRow[0]?.hits ?? 0),
    crons: { ok: Number(cronsRow[0]?.ok ?? 0), total: Number(cronsRow[0]?.total ?? 0) },
    lcpP75: percentil(lcpRows.map((r) => r.value), 75),
  }
}
