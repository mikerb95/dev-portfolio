import type { APIRoute } from 'astro'
import { db } from '../../db'
import { messages } from '../../db/schema'
import { clientIp } from '../../lib/ratelimit'
import { enforceLimit } from '../../lib/security/ratelimit-durable'
import { sendPush } from '../../lib/notify'
import { isLocale, type Locale } from '../../i18n'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LEN = { name: 200, email: 200, subject: 200, body: 5000 }

// Mensajes de error del endpoint en los dos idiomas del sitio. Viven aquí (no
// en el diccionario de páginas) porque son contrato de API, no copy de una
// página concreta - /contact y /paginas-web comparten este mismo endpoint.
const ERRORS = {
  es: {
    rateLimited: 'Demasiados intentos, intenta de nuevo en un minuto',
    badJson: 'JSON inválido',
    missing: 'Faltan campos obligatorios',
    badEmail: 'Email inválido',
    tooLong: 'Campo demasiado largo',
  },
  en: {
    rateLimited: 'Too many attempts, try again in a minute',
    badJson: 'Invalid JSON',
    missing: 'Missing required fields',
    badEmail: 'Invalid email',
    tooLong: 'Field too long',
  },
} satisfies Record<Locale, Record<string, string>>

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status })

export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  let parseFailed = false
  try {
    data = await request.json()
  } catch {
    data = {}
    parseFailed = true
  }
  // Nunca se confía en `Referer`: el locale es un campo explícito del body,
  // validado contra la lista cerrada de locales soportados. Si el JSON ni
  // siquiera parseó, no hay locale que leer: el error sale en español.
  const rawLocale = data.locale
  const locale: Locale = typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : 'es'
  const E = ERRORS[locale]

  const { allowed } = await enforceLimit(`contact:${clientIp(request)}`, { limit: 5, windowMs: 60_000 })
  if (!allowed) {
    return json(429, { error: E.rateLimited })
  }

  if (parseFailed) {
    return json(400, { error: E.badJson })
  }

  const { name, email, subject, body } = data

  if (typeof name !== 'string' || typeof email !== 'string' || typeof body !== 'string' || !name || !email || !body) {
    return json(400, { error: E.missing })
  }
  if (!EMAIL_RE.test(email)) {
    return json(400, { error: E.badEmail })
  }
  if (name.length > MAX_LEN.name || email.length > MAX_LEN.email || body.length > MAX_LEN.body ||
    (typeof subject === 'string' && subject.length > MAX_LEN.subject)) {
    return json(400, { error: E.tooLong })
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
    `${typeof subject === 'string' && subject ? `${subject}\n` : ''}${preview}\n- ${email}`,
    { priority: 4, tags: 'envelope', click: 'https://codebymike.net/admin/messages' },
  ).catch(() => {})

  return json(201, { ok: true })
}
