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

// Turso rechaza compound SELECTs de más de 50 términos ("too many terms in
// compound SELECT"): es un límite MUCHO más bajo que el default de SQLite (500),
// verificado por bisección contra la base real. Con un monitor por rama, eso
// pone un techo duro al número de monitores, así que las ramas van en lotes.
// 40 deja margen sin multiplicar los round-trips (hoy hay ~10 monitores: 1 lote).
const MAX_BRANCHES = 40

/** Últimos `points` checks (con latencia medida) de cada monitor, del más antiguo al más reciente. */
export async function recentLatency(
  monitorIds: number[],
  points = 40,
): Promise<Map<number, LatencyPoint[]>> {
  const out = new Map<number, LatencyPoint[]>()
  // Deduplicar no es defensivo de más: el `where monitor_id in (…)` anterior
  // ignoraba repetidos, pero una rama por id los convertiría en serie duplicada.
  const ids = [...new Set(monitorIds)]
  if (ids.length === 0) return out

  const lotes: number[][] = []
  for (let i = 0; i < ids.length; i += MAX_BRANCHES) lotes.push(ids.slice(i, i + MAX_BRANCHES))

  const resultados = await Promise.all(
    lotes.map((lote) => {
      // Cada rama se envuelve en un subselect porque SQLite no admite ORDER BY/
      // LIMIT en los operandos de un UNION ALL sin paréntesis.
      const branches = lote.map(
        (id) => sql`select * from (
          select monitor_id, at, response_ms, ok
          from monitor_checks
          where monitor_id = ${id} and response_ms is not null
          order by at desc
          limit ${points}
        )`,
      )
      return db.all<{ monitor_id: number; at: number; response_ms: number; ok: number }>(sql`
        ${sql.join(branches, sql` union all `)}
        order by monitor_id asc, at asc
      `)
    }),
  )

  for (const rows of resultados) {
    for (const r of rows) {
      const arr = out.get(r.monitor_id) ?? []
      arr.push({ t: r.at, ms: r.response_ms, ok: !!r.ok })
      out.set(r.monitor_id, arr)
    }
  }
  return out
}
