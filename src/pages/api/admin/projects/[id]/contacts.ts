import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projectContacts } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = Number(params.id)
  const { name, email, role, phone, notes } = await request.json()

  if (!name) {
    return new Response(JSON.stringify({ error: 'name es requerido' }), { status: 400 })
  }

  const [row] = await db.insert(projectContacts).values({
    projectId,
    name,
    email: email ?? null,
    role: role ?? 'otro',
    phone: phone ?? null,
    notes: notes ?? null,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}

export const PUT: APIRoute = async ({ request }) => {
  const { id, name, email, role, phone, notes } = await request.json()

  await db.update(projectContacts).set({
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email }),
    ...(role !== undefined && { role }),
    ...(phone !== undefined && { phone }),
    ...(notes !== undefined && { notes }),
  }).where(eq(projectContacts.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await request.json()
  await db.delete(projectContacts).where(eq(projectContacts.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
