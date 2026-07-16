import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { portalThreads } from '../../../../../db/schema'
import { addMessage, MAX_BODY_LEN } from '../../../../../lib/portal/threads'
import { notifyClient } from '../../../../../lib/portal/notifications'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Responde a un cliente desde el panel. La sesión de admin la impone el
 * middleware para todo /api/admin.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const threadId = Number(params.id)
  if (!Number.isInteger(threadId)) return json(400, { error: 'hilo inválido' })

  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const body = typeof data.body === 'string' ? data.body.trim() : ''
  if (!body) return json(400, { error: 'el mensaje está vacío' })
  if (body.length > MAX_BODY_LEN) return json(400, { error: 'el mensaje es demasiado largo' })

  const [thread] = await db.select().from(portalThreads).where(eq(portalThreads.id, threadId)).limit(1)
  if (!thread) return json(404, { error: 'hilo no encontrado' })

  const message = await addMessage({
    clientId: thread.clientId,
    threadId,
    authorType: 'admin',
    authorName: 'Mike',
    body,
  })
  if (!message) return json(404, { error: 'hilo no encontrado' })

  // Cerrar es una acción explícita mía y va DESPUÉS de escribir: addMessage
  // reabre el hilo al añadir un mensaje, así que el orden inverso lo dejaría
  // abierto.
  if (data.close === true) {
    await db.update(portalThreads).set({ status: 'closed' }).where(eq(portalThreads.id, threadId))
  }

  // notifyClient escribe la notificación in-app y manda el correo según la
  // preferencia de cada usuario del cliente.
  await notifyClient({
    clientId: thread.clientId,
    type: 'message',
    title: `Nueva respuesta · ${thread.subject}`,
    body: body.length > 200 ? `${body.slice(0, 200)}…` : body,
    href: `/portal/mensajes/${threadId}`,
    emailCta: 'Leer y responder',
  })

  return json(201, { ok: true, id: message.id })
}
