import type { APIRoute } from 'astro'
import { addMessage, createThread, MAX_BODY_LEN } from '../../../../lib/portal/threads'
import { requireRole } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'
import { sendPush, sendEmail } from '../../../../lib/notify'
import { SITE_URL, escapeHtml } from '../../../../lib/email'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Abre una conversación nueva con su primer mensaje. */
export const POST: APIRoute = async (context) => {
  const auth = await requireRole(context, ['owner', 'member'])
  if (auth.response) return auth.response
  const { session } = auth

  // Límite por usuario, no por IP: el del middleware ya cubre el abuso desde
  // fuera; este evita que una cuenta legítima me inunde la bandeja.
  const { allowed } = await enforceLimit(`portal-thread:${session.user.id}`, { limit: 20, windowMs: 60 * 60_000 })
  if (!allowed) return json(429, { error: 'Has abierto muchas consultas seguidas. Espera un momento.' })

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const subject = typeof data.subject === 'string' ? data.subject.trim() : ''
  const body = typeof data.body === 'string' ? data.body.trim() : ''
  if (!subject) return json(400, { error: 'Escribe un asunto.' })
  if (!body) return json(400, { error: 'Escribe un mensaje.' })
  if (body.length > MAX_BODY_LEN) return json(400, { error: 'El mensaje es demasiado largo.' })

  // Un projectId ajeno no se cuela: createThread lo valida contra el cliente y,
  // si no es suyo, el hilo nace sin proyecto en vez de con el de otro.
  const projectId = Number(data.projectId)
  const thread = await createThread({
    clientId: session.client.id,
    projectId: Number.isInteger(projectId) ? projectId : null,
    subject,
  })

  await addMessage({
    clientId: session.client.id,
    threadId: thread.id,
    authorType: 'client',
    authorUserId: session.user.id,
    authorName: session.user.name,
    body,
  })

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'message.sent',
    entity: 'thread',
    entityId: thread.id,
    ip: clientIp(context.request.headers),
  })

  // Push al teléfono + email de respaldo: un cliente escribiendo merece
  // respuesta rápida, y el push solo no basta si falla ntfy o no lo veo.
  const clientName = session.client.company ?? session.client.name
  const panelUrl = `${SITE_URL}/admin/portal/mensajes/${thread.id}`
  Promise.all([
    sendPush(`Mensaje de ${clientName}`, `${subject} - ${body.slice(0, 120)}`, {
      priority: 4,
      tags: 'speech_balloon',
      click: panelUrl,
    }),
    sendEmail(
      `Mensaje de ${clientName}: ${subject}`,
      `${body}\n\nAbrir conversación: ${panelUrl}`,
      `<p style="font-family:system-ui;font-size:14px">${escapeHtml(body).replace(/\n/g, '<br>')}</p><p><a href="${panelUrl}">Abrir conversación →</a></p>`
    ),
  ]).catch(() => {})

  return json(201, { ok: true, redirect: `/portal/mensajes/${thread.id}` })
}
