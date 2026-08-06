import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { decks, presentationFeedback } from '../../db/schema'
import { enforceLimit } from '../../lib/security/ratelimit-durable'
import { clientIp } from '../../lib/device-info'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const MAX_COMMENT = 2_000
const MAX_CONTACT = 200

/**
 * Feedback del público. Anónimo de verdad: no se guarda IP, ni hash de IP, ni
 * identificador de sesión. Lo único que puede identificar a alguien es el campo
 * `contact`, que escribe quien quiere respuesta.
 *
 * El rate limit usa la IP, pero solo para contar — no se persiste en la fila.
 */
export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request.headers)
  if (ip) {
    // Un formulario que se envía una vez por presentación. 10/min por IP no
    // roza a nadie legítimo (ni a una sala entera tras un NAT, que enviaría
    // mucho menos) y le quita el sentido a un spam automatizado.
    const limited = await enforceLimit(`feedback:${ip}`, { limit: 10, windowMs: 60_000, deferUntil: 0.5 })
    if (!limited.allowed) {
      return json(429, { error: 'demasiados envíos, espera un minuto' })
    }
  }

  let body: { deckId?: unknown; rating?: unknown; comment?: unknown; contact?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'cuerpo inválido' })
  }

  const rating = Number(body.rating)
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : ''
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, MAX_CONTACT) : ''

  const hasRating = Number.isInteger(rating) && rating >= 1 && rating <= 5
  if (!hasRating && !comment) {
    return json(400, { error: 'deja al menos una valoración o un comentario' })
  }

  // El título se congela en la fila: si el deck se borra o se renombra, el
  // comentario sigue teniendo contexto (por eso la FK es `set null`).
  let deckId: number | null = null
  let deckTitle: string | null = null
  const rawDeckId = Number(body.deckId)
  if (Number.isInteger(rawDeckId) && rawDeckId > 0) {
    const [deck] = await db
      .select({ id: decks.id, title: decks.title })
      .from(decks)
      .where(eq(decks.id, rawDeckId))
      .limit(1)
    if (deck) {
      deckId = deck.id
      deckTitle = deck.title
    }
  }

  await db.insert(presentationFeedback).values({
    deckId,
    deckTitle,
    rating: hasRating ? rating : null,
    comment: comment || null,
    contact: contact || null,
    createdAt: new Date(),
  })

  return json(201, { ok: true })
}
