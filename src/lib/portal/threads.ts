// Mensajería del portal: hilos por cliente (opcionalmente por proyecto).
//
// No reutiliza la tabla `messages` (el formulario de contacto público) a
// propósito: aquello son mensajes anónimos de desconocidos, esto es una
// conversación entre partes identificadas atada a un contrato. Mezclarlas
// obligaría a que cada consulta distinguiera ambos mundos con un `where` que
// tarde o temprano alguien olvidaría.
//
// El "leído" vive en portal_message_reads y no en el mensaje: con varios
// usuarios por empresa, que Ana lo lea no significa que Beto lo haya leído.

import { and, count, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { clientUsers, portalMessageReads, portalMessages, portalThreads, projects } from '../../db/schema'

export type Thread = typeof portalThreads.$inferSelect
export type Message = typeof portalMessages.$inferSelect

// Markdown deliberadamente pobre. El cuerpo se escapa entero y solo después se
// reintroduce un puñado de etiquetas: así, por construcción, no existe forma de
// que un `<script>` sobreviva. Una librería de markdown completa sería más
// bonita y bastante más superficie de ataque para lo poco que aporta aquí.
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Renderiza el cuerpo de un mensaje a HTML seguro.
 * Soporta: **negrita**, *cursiva*, `código`, enlaces y saltos de línea.
 */
export function renderBody(body: string): string {
  let html = escapeHtml(body)

  html = html.replace(/`([^`\n]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/[.06] font-mono text-[.9em]">$1</code>')
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')

  // Solo http/https: sin esto, `javascript:` o `data:` en un enlace serían XSS.
  // La URL ya viene escapada, así que no puede romper el atributo.
  html = html.replace(
    /\bhttps?:\/\/[^\s<>"]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow" class="text-cyan hover:underline break-all">${url}</a>`
  )

  return html.replace(/\n/g, '<br>')
}

export const MAX_BODY_LEN = 5_000

/** Hilos del cliente con su contador de no leídos para ESTE usuario. */
export async function clientThreads(clientId: number, clientUserId?: number) {
  const rows = await db
    .select({
      id: portalThreads.id,
      subject: portalThreads.subject,
      status: portalThreads.status,
      lastMessageAt: portalThreads.lastMessageAt,
      createdAt: portalThreads.createdAt,
      projectTitle: projects.title,
      messageCount: sql<number>`(select count(*) from ${portalMessages} where ${portalMessages.threadId} = ${portalThreads.id})`,
      lastBody: sql<string | null>`(select ${portalMessages.body} from ${portalMessages} where ${portalMessages.threadId} = ${portalThreads.id} order by ${portalMessages.createdAt} desc limit 1)`,
      lastAuthor: sql<string | null>`(select ${portalMessages.authorType} from ${portalMessages} where ${portalMessages.threadId} = ${portalThreads.id} order by ${portalMessages.createdAt} desc limit 1)`,
    })
    .from(portalThreads)
    .leftJoin(projects, eq(portalThreads.projectId, projects.id))
    .where(eq(portalThreads.clientId, clientId))
    .orderBy(desc(portalThreads.lastMessageAt))

  if (!clientUserId || !rows.length) return rows.map((r) => ({ ...r, unread: 0 }))

  const reads = await db
    .select()
    .from(portalMessageReads)
    .where(
      and(
        eq(portalMessageReads.clientUserId, clientUserId),
        inArray(portalMessageReads.threadId, rows.map((r) => r.id))
      )
    )
  const readAt = new Map(reads.map((r) => [r.threadId, r.lastReadAt]))

  const unreadRows = await db
    .select({ threadId: portalMessages.threadId, n: count(), at: sql<number>`max(${portalMessages.createdAt})` })
    .from(portalMessages)
    .where(
      and(
        inArray(portalMessages.threadId, rows.map((r) => r.id)),
        // Los propios mensajes del cliente nunca cuentan como no leídos.
        eq(portalMessages.authorType, 'admin')
      )
    )
    .groupBy(portalMessages.threadId)

  // El conteo fino se hace en memoria: son pocos hilos por cliente y expresar
  // "posteriores a la marca de lectura de ESTE usuario" en un solo SQL portable
  // complicaría la query mucho más de lo que ahorra.
  const unreadByThread = new Map<number, number>()
  for (const r of rows) {
    const mark = readAt.get(r.id)
    if (!unreadRows.find((u) => u.threadId === r.id)) continue
    const [{ n }] = await db
      .select({ n: count() })
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.threadId, r.id),
          eq(portalMessages.authorType, 'admin'),
          mark ? gt(portalMessages.createdAt, mark) : sql`1=1`
        )
      )
    unreadByThread.set(r.id, n)
  }

  return rows.map((r) => ({ ...r, unread: unreadByThread.get(r.id) ?? 0 }))
}

/** Nº de hilos con algo sin leer (badge del dashboard). */
export async function unreadThreadCount(clientId: number, clientUserId: number): Promise<number> {
  const threads = await clientThreads(clientId, clientUserId)
  return threads.filter((t) => t.unread > 0).length
}

/**
 * Un hilo con sus mensajes. Devuelve null si el hilo no es del cliente — nunca
 * un 403, que confirmaría que ese id existe.
 */
export async function threadWithMessages(clientId: number, threadId: number) {
  const [thread] = await db
    .select({
      id: portalThreads.id,
      subject: portalThreads.subject,
      status: portalThreads.status,
      createdAt: portalThreads.createdAt,
      projectId: portalThreads.projectId,
      projectTitle: projects.title,
    })
    .from(portalThreads)
    .leftJoin(projects, eq(portalThreads.projectId, projects.id))
    .where(and(eq(portalThreads.id, threadId), eq(portalThreads.clientId, clientId)))
    .limit(1)

  if (!thread) return null

  const messages = await db
    .select({
      id: portalMessages.id,
      authorType: portalMessages.authorType,
      authorName: portalMessages.authorName,
      body: portalMessages.body,
      createdAt: portalMessages.createdAt,
      userName: clientUsers.name,
    })
    .from(portalMessages)
    .leftJoin(clientUsers, eq(portalMessages.authorUserId, clientUsers.id))
    .where(eq(portalMessages.threadId, threadId))
    .orderBy(portalMessages.createdAt, portalMessages.id)

  return { thread, messages }
}

/** Marca el hilo como leído hasta ahora para este usuario. */
export async function markThreadRead(threadId: number, clientUserId: number, now = new Date()): Promise<void> {
  const [existing] = await db
    .select({ id: portalMessageReads.id })
    .from(portalMessageReads)
    .where(and(eq(portalMessageReads.threadId, threadId), eq(portalMessageReads.clientUserId, clientUserId)))
    .limit(1)

  if (existing) {
    await db.update(portalMessageReads).set({ lastReadAt: now }).where(eq(portalMessageReads.id, existing.id))
  } else {
    await db.insert(portalMessageReads).values({ threadId, clientUserId, lastReadAt: now })
  }
}

/** Crea un hilo. `projectId` se valida contra el cliente antes de atarlo. */
export async function createThread(params: {
  clientId: number
  projectId?: number | null
  subject: string
  now?: Date
}): Promise<Thread> {
  const now = params.now ?? new Date()

  // Un projectId ajeno no puede colarse en el hilo: se comprueba que sea del
  // cliente y, si no, el hilo nace sin proyecto en vez de con el de otro.
  let projectId: number | null = null
  if (params.projectId != null) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, params.projectId), eq(projects.clientId, params.clientId)))
      .limit(1)
    projectId = p?.id ?? null
  }

  const [thread] = await db
    .insert(portalThreads)
    .values({
      clientId: params.clientId,
      projectId,
      subject: params.subject.slice(0, 200),
      status: 'open',
      lastMessageAt: now,
      createdAt: now,
    })
    .returning()
  return thread
}

/**
 * Añade un mensaje a un hilo. El `clientId` se verifica contra el hilo: sin
 * eso, un cliente podría escribir dentro de la conversación de otro.
 */
export async function addMessage(params: {
  clientId: number
  threadId: number
  authorType: 'admin' | 'client'
  authorUserId?: number | null
  authorName?: string | null
  body: string
  now?: Date
}): Promise<Message | null> {
  const now = params.now ?? new Date()

  const [thread] = await db
    .select({ id: portalThreads.id })
    .from(portalThreads)
    .where(and(eq(portalThreads.id, params.threadId), eq(portalThreads.clientId, params.clientId)))
    .limit(1)
  if (!thread) return null

  const [message] = await db
    .insert(portalMessages)
    .values({
      threadId: params.threadId,
      authorType: params.authorType,
      authorUserId: params.authorUserId ?? null,
      authorName: params.authorName ?? null,
      body: params.body.slice(0, MAX_BODY_LEN),
      createdAt: now,
    })
    .returning()

  // Escribir reabre el hilo: si el cliente responde a algo cerrado, es que no
  // estaba resuelto.
  await db
    .update(portalThreads)
    .set({ lastMessageAt: now, status: 'open' })
    .where(eq(portalThreads.id, params.threadId))

  // Quien escribe ya lo ha leído, por definición.
  if (params.authorUserId) await markThreadRead(params.threadId, params.authorUserId, now)

  return message
}

/** Hilos para la bandeja del admin, con lo pendiente de responder primero. */
export async function adminThreads() {
  return db
    .select({
      id: portalThreads.id,
      subject: portalThreads.subject,
      status: portalThreads.status,
      lastMessageAt: portalThreads.lastMessageAt,
      clientId: portalThreads.clientId,
      projectTitle: projects.title,
      messageCount: sql<number>`(select count(*) from ${portalMessages} where ${portalMessages.threadId} = ${portalThreads.id})`,
      // ¿El último mensaje es del cliente? Entonces la pelota está en mi tejado.
      lastAuthor: sql<string | null>`(select ${portalMessages.authorType} from ${portalMessages} where ${portalMessages.threadId} = ${portalThreads.id} order by ${portalMessages.createdAt} desc limit 1)`,
    })
    .from(portalThreads)
    .leftJoin(projects, eq(portalThreads.projectId, projects.id))
    .orderBy(desc(portalThreads.lastMessageAt))
}
