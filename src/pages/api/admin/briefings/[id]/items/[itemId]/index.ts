import type { APIRoute } from 'astro'
import { db } from '../../../../../../../db'
import { briefingItems } from '../../../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const PUT: APIRoute = async ({ params, request }) => {
  const itemId = Number(params.itemId)
  const body = await request.json()
  const { content, done } = body

  await db.update(briefingItems).set({
    ...(content !== undefined && { content: String(content).trim() }),
    ...(done !== undefined && { done: !!done }),
  }).where(eq(briefingItems.id, itemId))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ params }) => {
  const itemId = Number(params.itemId)
  await db.delete(briefingItems).where(eq(briefingItems.id, itemId))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
