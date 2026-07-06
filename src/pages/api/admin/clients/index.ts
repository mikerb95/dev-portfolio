import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { clients } from '../../../../db/schema'
import { desc } from 'drizzle-orm'
import { validateClient, json } from './_shared'

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

  return json(rows)
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const result = validateClient(body)
  if ('error' in result) return json({ error: result.error }, 400)

  const [row] = await db.insert(clients).values({
    ...result.data,
    createdAt: new Date(),
  }).returning()

  return json(row, 201)
}
