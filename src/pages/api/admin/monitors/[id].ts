import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { monitors, monitorChecks, monitorIncidents } from '../../../../db/schema'
import { desc, eq } from 'drizzle-orm'

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  const monitor = await db.select().from(monitors).where(eq(monitors.id, id)).get()
  if (!monitor) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

  const [incidents, recentChecks] = await Promise.all([
    db.select().from(monitorIncidents).where(eq(monitorIncidents.monitorId, id)).orderBy(desc(monitorIncidents.startedAt)).limit(50),
    db.select().from(monitorChecks).where(eq(monitorChecks.monitorId, id)).orderBy(desc(monitorChecks.at)).limit(100),
  ])

  return new Response(JSON.stringify({ monitor, incidents, recentChecks }), { status: 200 })
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const body = await request.json()
  const { name, url, projectId, method, expectedStatus, expectedText, latencyThresholdMs, intervalMin, active, paused } = body

  if (url !== undefined) {
    try {
      new URL(url)
    } catch {
      return new Response(JSON.stringify({ error: 'url inválida' }), { status: 400 })
    }
  }

  await db
    .update(monitors)
    .set({
      ...(name !== undefined && { name }),
      ...(url !== undefined && { url }),
      ...(projectId !== undefined && { projectId }),
      ...(method !== undefined && { method }),
      ...(expectedStatus !== undefined && { expectedStatus }),
      ...(expectedText !== undefined && { expectedText: expectedText || null }),
      ...(latencyThresholdMs !== undefined && { latencyThresholdMs }),
      ...(intervalMin !== undefined && { intervalMin }),
      ...(active !== undefined && { active }),
      ...(paused !== undefined && { paused }),
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  await db.delete(monitors).where(eq(monitors.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
