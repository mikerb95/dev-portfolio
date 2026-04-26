import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { clients } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  const row = await db.select().from(clients).where(eq(clients.id, id)).get()
  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  return new Response(JSON.stringify(row), { status: 200 })
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const body = await request.json()
  const { name, email, company, notes } = body

  await db.update(clients).set({
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email }),
    ...(company !== undefined && { company }),
    ...(notes !== undefined && { notes }),
  }).where(eq(clients.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  await db.delete(clients).where(eq(clients.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
