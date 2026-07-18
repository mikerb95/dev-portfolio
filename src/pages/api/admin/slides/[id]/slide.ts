import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { presentations } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!id) return new Response('Bad request', { status: 400 })

  const { slide } = await request.json()
  if (typeof slide !== 'number') return new Response('Bad request', { status: 400 })

  await db.update(presentations)
    .set({ currentSlide: slide })
    .where(eq(presentations.id, id))

  return new Response(JSON.stringify({ ok: true, slide }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
