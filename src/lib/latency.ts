import { sql } from 'drizzle-orm'
import { db } from '../db'

// Serie de latencia reciente por monitor, para la mini-gráfica tipo EKG del /status.
// Devuelve SOLO puntos operativos agregados (ms + ok), nunca URLs, errores ni códigos.
// Un único query con window function evita el N+1 (una consulta por monitor).

export type LatencyPoint = { t: number; ms: number; ok: boolean }

/** Últimos `points` checks (con latencia medida) de cada monitor, del más antiguo al más reciente. */
export async function recentLatency(
  monitorIds: number[],
  points = 40,
): Promise<Map<number, LatencyPoint[]>> {
  const out = new Map<number, LatencyPoint[]>()
  if (monitorIds.length === 0) return out

  const rows = await db.all<{ monitor_id: number; at: number; response_ms: number; ok: number }>(sql`
    select monitor_id, at, response_ms, ok from (
      select
        monitor_id,
        at,
        response_ms,
        ok,
        row_number() over (partition by monitor_id order by at desc) as rn
      from monitor_checks
      where monitor_id in (${sql.join(monitorIds, sql`, `)})
        and response_ms is not null
    )
    where rn <= ${points}
    order by monitor_id asc, at asc
  `)

  for (const r of rows) {
    const arr = out.get(r.monitor_id) ?? []
    arr.push({ t: r.at, ms: r.response_ms, ok: !!r.ok })
    out.set(r.monitor_id, arr)
  }
  return out
}
