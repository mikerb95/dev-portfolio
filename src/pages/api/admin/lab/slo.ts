import type { APIRoute } from 'astro'
import { desc, gte } from 'drizzle-orm'
import { db } from '../../../../db'
import { monitors, monitorChecks } from '../../../../db/schema'
import { computeSlo, budgetHealth } from '../../../../lib/slo'

// SLO / Error budget por monitor sobre monitor_checks (protegido por middleware admin).
// Query params: ?objective=99.5&days=30

const DAY = 86_400_000

export const GET: APIRoute = async ({ url }) => {
  const objective = Math.min(Math.max(Number(url.searchParams.get('objective')) || 99.5, 1), 100)
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 90)

  const mons = await db
    .select({ id: monitors.id, name: monitors.name, url: monitors.url })
    .from(monitors)
    .orderBy(desc(monitors.createdAt))

  const since = new Date(Date.now() - days * DAY)
  const checks = await db
    .select({ monitorId: monitorChecks.monitorId, at: monitorChecks.at, ok: monitorChecks.ok })
    .from(monitorChecks)
    .where(gte(monitorChecks.at, since))

  const byMonitor = new Map<number, { at: Date; ok: boolean }[]>()
  for (const c of checks) {
    if (!c.at) continue
    const list = byMonitor.get(c.monitorId) ?? []
    list.push({ at: c.at, ok: c.ok })
    byMonitor.set(c.monitorId, list)
  }

  const results = mons.map((m) => {
    const slo = computeSlo(byMonitor.get(m.id) ?? [], objective, days)
    return { monitor: m, slo, health: budgetHealth(slo) }
  })

  return new Response(JSON.stringify({ objective, days, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
