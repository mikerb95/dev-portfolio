import type { APIRoute } from 'astro'
import { db } from '../../db'
import { messages } from '../../db/schema'

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json()
  const { name, email, subject, body } = data

  if (!name || !email || !body) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  await db.insert(messages).values({
    name,
    email,
    subject: subject ?? null,
    body,
    createdAt: new Date(),
  })

  return new Response(JSON.stringify({ ok: true }), { status: 201 })
}
