import type { APIRoute } from 'astro'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { monitors } from '../../../db/schema'
import { recentLatency } from '../../../lib/latency'

// Feed público que alimenta las mini-gráficas de latencia (EKG) y el estado en
// vivo de cada card del /status. Lo consume un poll del cliente cada ~30s.
// Expone SOLO ms/ok/estado agregado por monitor activo; nunca URLs internas,
// errores crudos ni configuración.
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
