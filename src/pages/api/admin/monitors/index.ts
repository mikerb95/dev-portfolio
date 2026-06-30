import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { monitors, monitorChecks, monitorIncidents, projects } from '../../../../db/schema'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'

const DAY = 86_400_000

/** Lista monitores con su uptime (24h/7d/30d) e incidente abierto. */
export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      id: monitors.id,
      projectId: monitors.projectId,
      projectTitle: projects.title,
      name: monitors.name,
      url: monitors.url,
      active: monitors.active,
      paused: monitors.paused,
      expectedStatus: monitors.expectedStatus,
      expectedText: monitors.expectedText,
      latencyThresholdMs: monitors.latencyThresholdMs,
      lastStatus: monitors.lastStatus,
      lastCheckedAt: monitors.lastCheckedAt,
      lastResponseMs: monitors.lastResponseMs,
      sslExpiresAt: monitors.sslExpiresAt,
    })
    .from(monitors)
    .leftJoin(projects, eq(monitors.projectId, projects.id))
    .orderBy(desc(monitors.createdAt))

  const since = new Date(Date.now() - 30 * DAY)
  const checks = await db
    .select({ monitorId: monitorChecks.monitorId, at: monitorChecks.at, ok: monitorChecks.ok })
    .from(monitorChecks)
    .where(gte(monitorChecks.at, since))

  const openIncidents = await db
    .select({ monitorId: monitorIncidents.monitorId, startedAt: monitorIncidents.startedAt, lastError: monitorIncidents.lastError })
    .from(monitorIncidents)
    .where(isNull(monitorIncidents.resolvedAt))

  const openByMonitor = new Map(openIncidents.map((i) => [i.monitorId, i]))

  const uptimePct = (mid: number, windowMs: number) => {
    const from = Date.now() - windowMs
    let ok = 0
    let total = 0
    for (const c of checks) {
      if (c.monitorId !== mid || !c.at || c.at.getTime() < from) continue
      total++
      if (c.ok) ok++
    }
    return total === 0 ? null : Math.round((ok / total) * 1000) / 10
  }

  const result = rows.map((m) => ({
    ...m,
    uptime24h: uptimePct(m.id, DAY),
    uptime7d: uptimePct(m.id, 7 * DAY),
    uptime30d: uptimePct(m.id, 30 * DAY),
    openIncident: openByMonitor.get(m.id) ?? null,
  }))

  return new Response(JSON.stringify(result), { status: 200 })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const { name, url, projectId, method, expectedStatus, expectedText, latencyThresholdMs, intervalMin } = body

  if (!name || !url) {
    return new Response(JSON.stringify({ error: 'name y url son requeridos' }), { status: 400 })
  }
  try {
    new URL(url)
  } catch {
    return new Response(JSON.stringify({ error: 'url inválida' }), { status: 400 })
  }

  const [row] = await db
    .insert(monitors)
    .values({
      name,
      url,
      projectId: projectId ?? null,
      method: method ?? 'GET',
      expectedStatus: expectedStatus ?? 200,
      expectedText: expectedText || null,
      latencyThresholdMs: latencyThresholdMs ?? 2000,
      intervalMin: intervalMin ?? 5,
      active: true,
      paused: false,
      lastStatus: 'unknown',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return new Response(JSON.stringify(row), { status: 201 })
}
