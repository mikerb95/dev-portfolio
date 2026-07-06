import type { APIRoute } from 'astro'
import { db } from '../../db'
import { messages } from '../../db/schema'
import { rateLimit, clientIp } from '../../lib/ratelimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LEN = { name: 200, email: 200, subject: 200, body: 5000 }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status })

export const POST: APIRoute = async ({ request }) => {
  if (!rateLimit(`contact:${clientIp(request)}`, 5, 60_000)) {
    return json(429, { error: 'Demasiados intentos, intenta de nuevo en un minuto' })
  }

  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const { name, email, subject, body } = data

  if (typeof name !== 'string' || typeof email !== 'string' || typeof body !== 'string' || !name || !email || !body) {
    return json(400, { error: 'Missing required fields' })
  }
  if (!EMAIL_RE.test(email)) {
    return json(400, { error: 'Email inválido' })
  }
  if (name.length > MAX_LEN.name || email.length > MAX_LEN.email || body.length > MAX_LEN.body ||
    (typeof subject === 'string' && subject.length > MAX_LEN.subject)) {
    return json(400, { error: 'Campo demasiado largo' })
  }

  await db.insert(messages).values({
    name,
    email,
    subject: typeof subject === 'string' ? subject : null,
    body,
    createdAt: new Date(),
  })

  return json(201, { ok: true })
}
