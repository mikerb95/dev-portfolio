import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projectServices } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = Number(params.id)
  const { name, category, url, username, notes } = await request.json()

  if (!name || !category) {
    return new Response(JSON.stringify({ error: 'name y category son requeridos' }), { status: 400 })
  }

  const [row] = await db.insert(projectServices).values({
    projectId,
    name,
    category,
    url: url ?? null,
    username: username ?? null,
    notes: notes ?? null,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}

export const PUT: APIRoute = async ({ request }) => {
  const { id, name, category, url, username, notes } = await request.json()

  await db.update(projectServices).set({
    ...(name !== undefined && { name }),
    ...(category !== undefined && { category }),
    ...(url !== undefined && { url }),
    ...(username !== undefined && { username }),
    ...(notes !== undefined && { notes }),
  }).where(eq(projectServices.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await request.json()
  await db.delete(projectServices).where(eq(projectServices.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
