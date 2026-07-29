import type { APIRoute } from 'astro'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { monitors } from '../../../db/schema'
import { recentLatency } from '../../../lib/latency'

// Feed público que alimenta las mini-gráficas de latencia (EKG) y el estado en
// vivo de cada card del /status. Lo consume un poll del cliente cada ~30s.
// Expone SOLO ms/ok/estado agregado por monitor activo; nunca URLs internas,
// errores crudos ni configuración.
//
// Se cachea en el CDN pese a ser un feed "en vivo": el cron de sondeo escribe
// como mucho cada ~5 min, así que dos polls seguidos del mismo cliente devolvían
// datos idénticos. Sin caché, N pestañas abiertas = N queries cada 30s contra
// Turso. Con s-maxage todas colapsan en un hit de origen por ventana.
export const GET: APIRoute = async () => {
  const mons = await db
    .select({
      id: monitors.id,
      lastStatus: monitors.lastStatus,
      lastCheckedAt: monitors.lastCheckedAt,
      lastResponseMs: monitors.lastResponseMs,
    })
    .from(monitors)
    .where(and(eq(monitors.active, true), eq(monitors.paused, false)))

  const byId = await recentLatency(mons.map((m) => m.id))

  const series: Record<number, { ms: number; ok: boolean }[]> = {}
  const status: Record<number, { status: string; checkedAt: number | null; ms: number | null }> = {}
  for (const m of mons) {
    series[m.id] = (byId.get(m.id) ?? []).map((p) => ({ ms: p.ms, ok: p.ok }))
    status[m.id] = {
      status: m.lastStatus ?? 'unknown',
      checkedAt: m.lastCheckedAt ? m.lastCheckedAt.getTime() : null,
      ms: m.lastResponseMs,
    }
  }

  return new Response(JSON.stringify({ series, status, ts: Date.now() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  })
}
