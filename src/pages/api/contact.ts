import type { APIRoute } from 'astro'
import { db } from '../../db'
import { messages } from '../../db/schema'
import { rateLimit, clientIp } from '../../lib/ratelimit'
import { sendPush } from '../../lib/notify'

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

  // Notificación push al teléfono vía ntfy. No bloquea la respuesta ni la rompe
  // si falla (sendPush ya captura errores y es no-op sin NTFY_TOPIC).
  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body
  await sendPush(
    `Nuevo mensaje de ${name}`,
    `${typeof subject === 'string' && subject ? `${subject}\n` : ''}${preview}\n— ${email}`,
    { priority: 4, tags: 'envelope', click: 'https://codebymike.tech/admin/messages' },
  ).catch(() => {})

  return json(201, { ok: true })
}
