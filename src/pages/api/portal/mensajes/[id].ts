import type { APIRoute } from 'astro'
import { addMessage, MAX_BODY_LEN } from '../../../../lib/portal/threads'
import { requireRole } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'
import { sendPush } from '../../../../lib/notify'
import { SITE_URL } from '../../../../lib/email'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Responde en un hilo existente. */
export const POST: APIRoute = async (context) => {
  const auth = await requireRole(context, ['owner', 'member'])
  if (auth.response) return auth.response
  const { session } = auth

  const { allowed } = await enforceLimit(`portal-msg:${session.user.id}`, { limit: 60, windowMs: 60 * 60_000 })
  if (!allowed) return json(429, { error: 'Has enviado muchos mensajes seguidos. Espera un momento.' })

  const threadId = Number(context.params.id)
  if (!Number.isInteger(threadId)) return json(400, { error: 'Conversación inválida.' })

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const body = typeof data.body === 'string' ? data.body.trim() : ''
  if (!body) return json(400, { error: 'Escribe un mensaje.' })
  if (body.length > MAX_BODY_LEN) return json(400, { error: 'El mensaje es demasiado largo.' })

  // addMessage verifica que el hilo sea de este cliente y devuelve null si no:
  // escribir dentro de la conversación de otro es imposible desde aquí.
  const message = await addMessage({
    clientId: session.client.id,
    threadId,
    authorType: 'client',
    authorUserId: session.user.id,
    authorName: session.user.name,
    body,
  })
  if (!message) return json(404, { error: 'Conversación no encontrada.' })

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'message.sent',
    entity: 'thread',
    entityId: threadId,
    ip: clientIp(context.request.headers),
  })

  sendPush(
    `Respuesta de ${session.client.company ?? session.client.name}`,
    body.slice(0, 140),
    { priority: 4, tags: 'speech_balloon', click: `${SITE_URL}/admin/portal/mensajes/${threadId}` }
  ).catch(() => {})

  return json(201, { ok: true, id: message.id })
}
