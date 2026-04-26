import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { clients, projects } from '../../../../db/schema'
import { desc, eq, count } from 'drizzle-orm'

export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      company: clients.company,
      notes: clients.notes,
      createdAt: clients.createdAt,
    })
    .from(clients)
    .orderBy(desc(clients.createdAt))

  return new Response(JSON.stringify(rows), { status: 200 })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const { name, email, company, notes } = body

  if (!name) {
    return new Response(JSON.stringify({ error: 'name es requerido' }), { status: 400 })
  }

  const [row] = await db.insert(clients).values({
    name,
    email: email ?? null,
    company: company ?? null,
    notes: notes ?? null,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}
