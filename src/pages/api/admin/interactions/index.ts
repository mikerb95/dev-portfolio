import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { interactions } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { normalizeInteractionInput } from '../../../../lib/interactions'

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
    return new Response(JSON.stringify({ error: 'El título es requerido' }), { status: 400 })
  }
  const values = normalizeInteractionInput(body, { forInsert: true })
  const [row] = await db.insert(interactions)
    .values({ ...(values as any), createdAt: new Date(), updatedAt: new Date() })
    .returning()
  return new Response(JSON.stringify(row), { status: 201 })
}

export const PUT: APIRoute = async ({ request }) => {
  const body = await request.json()
  const id = Number(body?.id)
  if (!id) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })
  const values = normalizeInteractionInput(body, { forInsert: false })
  await db.update(interactions)
    .set({ ...(values as any), updatedAt: new Date() })
    .where(eq(interactions.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await request.json()
  if (!id) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })
  await db.delete(interactions).where(eq(interactions.id, Number(id)))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
