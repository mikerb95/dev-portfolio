import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projectAdrs } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = Number(params.id)
  const { title, status, context, decision, rationale, alternatives, consequences, isPublic } = await request.json()

  if (!title || !context || !decision || !rationale) {
    return new Response(JSON.stringify({ error: 'title, context, decision y rationale son requeridos' }), { status: 400 })
  }

  const [row] = await db.insert(projectAdrs).values({
    projectId,
    title,
    status: status ?? 'aceptado',
    context,
    decision,
    rationale,
    alternatives: alternatives ?? null,
    consequences: consequences ?? null,
    isPublic: isPublic ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}

export const PUT: APIRoute = async ({ request }) => {
  const { id, title, status, context, decision, rationale, alternatives, consequences, isPublic } = await request.json()

  await db.update(projectAdrs).set({
    ...(title !== undefined && { title }),
    ...(status !== undefined && { status }),
    ...(context !== undefined && { context }),
    ...(decision !== undefined && { decision }),
    ...(rationale !== undefined && { rationale }),
    ...(alternatives !== undefined && { alternatives }),
    ...(consequences !== undefined && { consequences }),
    ...(isPublic !== undefined && { isPublic }),
    updatedAt: new Date(),
  }).where(eq(projectAdrs.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await request.json()
  await db.delete(projectAdrs).where(eq(projectAdrs.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
