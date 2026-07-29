import { sql } from 'drizzle-orm'
import { db } from '../db'

// Serie de latencia reciente por monitor, para la mini-gráfica tipo EKG del /status.
// Devuelve SOLO puntos operativos agregados (ms + ok), nunca URLs, errores ni códigos.
// Sigue siendo UN solo round-trip (evita el N+1), pero como UNION ALL en vez de
// window function: `row_number() ... where rn <= N` no se puede podar, SQLite
// obliga a escanear y ordenar la tabla entera antes de descartar. Con el poll de
// 30s del /status eso significaba leer 62k filas por visitante cada medio minuto.
// Un LIMIT por rama sí usa el índice (monitor_id, at) y lee exactamente N filas.

export type LatencyPoint = { t: number; ms: number; ok: boolean }

/** Últimos `points` checks (con latencia medida) de cada monitor, del más antiguo al más reciente. */
export async function recentLatency(
  monitorIds: number[],
  points = 40,
): Promise<Map<number, LatencyPoint[]>> {
  const out = new Map<number, LatencyPoint[]>()
  if (monitorIds.length === 0) return out

  // Cada rama se envuelve en un subselect porque SQLite no admite ORDER BY/LIMIT
  // en los operandos de un UNION ALL sin paréntesis.
  const branches = monitorIds.map(
    (id) => sql`select * from (
      select monitor_id, at, response_ms, ok
      from monitor_checks
      where monitor_id = ${id} and response_ms is not null
      order by at desc
      limit ${points}
    )`,
  )

  const rows = await db.all<{ monitor_id: number; at: number; response_ms: number; ok: number }>(sql`
    ${sql.join(branches, sql` union all `)}
    order by monitor_id asc, at asc
  `)

  for (const r of rows) {
    const arr = out.get(r.monitor_id) ?? []
    arr.push({ t: r.at, ms: r.response_ms, ok: !!r.ok })
    out.set(r.monitor_id, arr)
  }
  return out
}
