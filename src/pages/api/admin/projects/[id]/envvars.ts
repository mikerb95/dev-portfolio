import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projectEnvVars } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = Number(params.id)
  const { key, value, environment, notes } = await request.json()

  if (!key || !value) {
    return new Response(JSON.stringify({ error: 'key y value son requeridos' }), { status: 400 })
  }

  const [row] = await db.insert(projectEnvVars).values({
    projectId,
    key,
    value,
    environment: environment ?? 'all',
    notes: notes ?? null,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}

export const PUT: APIRoute = async ({ request }) => {
  const { id, key, value, environment, notes } = await request.json()

  await db.update(projectEnvVars).set({
    ...(key !== undefined && { key }),
    ...(value !== undefined && { value }),
    ...(environment !== undefined && { environment }),
    ...(notes !== undefined && { notes }),
  }).where(eq(projectEnvVars.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await request.json()
  await db.delete(projectEnvVars).where(eq(projectEnvVars.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
