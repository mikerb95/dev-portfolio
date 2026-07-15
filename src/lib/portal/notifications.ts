// Centro de notificaciones del portal: in-app siempre, email según preferencia.
//
// Un único emisor (`notifyClient`) para que los módulos de facturas, mensajes,
// hitos y documentos no repitan la lógica de "a quién le llega esto y por qué
// canal". Añadir un canal nuevo (push, WhatsApp) es tocar solo este archivo.
//
// El envío de email es best-effort y NO bloquea: si Resend está caído, la
// notificación in-app ya está escrita y el cliente la ve al entrar. Perder un
// correo es aceptable; perder el aviso entero no.

import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { clientUsers, portalNotificationPrefs, portalNotifications } from '../../db/schema'
import { sendNotificationEmail, SITE_URL } from '../email'

export type NotificationType = 'invoice' | 'message' | 'milestone' | 'incident' | 'document' | 'system'

export type PortalRole = 'owner' | 'member' | 'billing'

// Los avisos de factura no son opt-out: son comunicación contractual, no
// marketing. El resto sí (la preferencia vive en portal_notification_prefs).
const MANDATORY_EMAIL: ReadonlySet<NotificationType> = new Set(['invoice'])

// Qué roles reciben cada tipo por defecto. Espeja el menú del layout: mandarle
// a `billing` el aviso de un mensaje técnico que ni siquiera puede abrir sería
// ruido con un enlace a un 403.
const AUDIENCE: Record<NotificationType, readonly PortalRole[]> = {
  invoice: ['owner', 'billing'],
  message: ['owner', 'member'],
  milestone: ['owner', 'member'],
  incident: ['owner', 'member'],
  document: ['owner', 'member'],
  system: ['owner', 'member', 'billing'],
}

export type NotifyInput = {
  clientId: number
  type: NotificationType
  title: string
  body?: string | null
  href?: string | null
  /** Destinatarios explícitos; por defecto, los roles de AUDIENCE del tipo. */
  userIds?: number[]
  /** No mandar email aunque la preferencia lo permita (avisos de bajo valor). */
  skipEmail?: boolean
  /** Texto del botón del email. */
  emailCta?: string
}

/**
 * Emite una notificación a los usuarios de un cliente. Nunca lanza: un fallo
 * notificando no puede tumbar la acción que la originó (emitir la factura es
 * más importante que avisar de que se emitió).
 */
export async function notifyClient(input: NotifyInput): Promise<void> {
  try {
    const recipients = await resolveRecipients(input)
    if (!recipients.length) return

    const now = new Date()
    const rows = await db
      .insert(portalNotifications)
      .values(
        recipients.map((r) => ({
          clientUserId: r.id,
          type: input.type,
          title: input.title.slice(0, 200),
          body: input.body?.slice(0, 500) ?? null,
          href: input.href ?? null,
          createdAt: now,
        }))
      )
      .returning({ id: portalNotifications.id, clientUserId: portalNotifications.clientUserId })

    if (input.skipEmail) return

    const byUser = new Map(rows.map((r) => [r.clientUserId, r.id]))
    const emailed: number[] = []

    await Promise.all(
      recipients
        .filter((r) => r.emailEnabled)
        .map(async (r) => {
          const res = await sendNotificationEmail({
            to: r.email,
            subject: input.title,
            heading: input.title,
            blocks: input.body ? [escapeForEmail(input.body)] : [],
            button: input.href ? { label: input.emailCta ?? 'Ver en el portal', url: `${SITE_URL}${input.href}` } : undefined,
          })
          const id = byUser.get(r.id)
          if (res.ok && id != null) emailed.push(id)
        })
    )

    if (emailed.length) {
      await db
        .update(portalNotifications)
        .set({ emailedAt: new Date() })
        .where(inArray(portalNotifications.id, emailed))
    }
  } catch {
    // Fail-open, a conciencia: ver el comentario de cabecera.
  }
}

const escapeForEmail = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Resuelve a quién le llega esto y si además le toca email. */
async function resolveRecipients(input: NotifyInput) {
  const users = await db
    .select({ id: clientUsers.id, email: clientUsers.email, role: clientUsers.role })
    .from(clientUsers)
    .where(and(eq(clientUsers.clientId, input.clientId), eq(clientUsers.status, 'active')))

  const audience = input.userIds
    ? users.filter((u) => input.userIds!.includes(u.id))
    : users.filter((u) => AUDIENCE[input.type].includes(u.role as PortalRole))

  if (!audience.length) return []

  const prefs = await db
    .select()
    .from(portalNotificationPrefs)
    .where(
      and(
        inArray(portalNotificationPrefs.clientUserId, audience.map((u) => u.id)),
        eq(portalNotificationPrefs.type, input.type)
      )
    )

  const disabled = new Set(prefs.filter((p) => !p.emailEnabled).map((p) => p.clientUserId))

  return audience.map((u) => ({
    ...u,
    // Ausencia de fila = activado (opt-out, no opt-in): un cliente que nunca
    // tocó sus preferencias espera recibir los avisos, no silencio.
    emailEnabled: MANDATORY_EMAIL.has(input.type) || !disabled.has(u.id),
  }))
}

/** Número de notificaciones sin leer (badge de la campana). */
export async function unreadCount(clientUserId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(portalNotifications)
    .where(and(eq(portalNotifications.clientUserId, clientUserId), isNull(portalNotifications.readAt)))
  return row?.n ?? 0
}

export async function listNotifications(clientUserId: number, limit = 50) {
  return db
    .select()
    .from(portalNotifications)
    .where(eq(portalNotifications.clientUserId, clientUserId))
    .orderBy(desc(portalNotifications.createdAt))
    .limit(limit)
}

export async function markAllRead(clientUserId: number, now = new Date()): Promise<void> {
  await db
    .update(portalNotifications)
    .set({ readAt: now })
    .where(and(eq(portalNotifications.clientUserId, clientUserId), isNull(portalNotifications.readAt)))
}

/**
 * Marca una notificación como leída. El filtro por usuario no es decorativo:
 * sin él, cualquiera podría marcar (y por tanto tocar) las filas de otro
 * pasando un id ajeno.
 */
export async function markRead(id: number, clientUserId: number, now = new Date()): Promise<void> {
  await db
    .update(portalNotifications)
    .set({ readAt: now })
    .where(and(eq(portalNotifications.id, id), eq(portalNotifications.clientUserId, clientUserId)))
}

/** Preferencias de email del usuario, con los valores por defecto aplicados. */
export async function getPrefs(clientUserId: number): Promise<Record<string, boolean>> {
  const rows = await db.select().from(portalNotificationPrefs).where(eq(portalNotificationPrefs.clientUserId, clientUserId))
  const map: Record<string, boolean> = {}
  for (const t of Object.keys(AUDIENCE)) map[t] = true
  for (const r of rows) map[r.type] = r.emailEnabled
  for (const t of MANDATORY_EMAIL) map[t] = true
  return map
}

export async function setPref(clientUserId: number, type: string, emailEnabled: boolean): Promise<void> {
  if (MANDATORY_EMAIL.has(type as NotificationType)) return
  const [existing] = await db
    .select({ id: portalNotificationPrefs.id })
    .from(portalNotificationPrefs)
    .where(and(eq(portalNotificationPrefs.clientUserId, clientUserId), eq(portalNotificationPrefs.type, type)))
    .limit(1)

  if (existing) {
    await db.update(portalNotificationPrefs).set({ emailEnabled }).where(eq(portalNotificationPrefs.id, existing.id))
  } else {
    await db.insert(portalNotificationPrefs).values({ clientUserId, type, emailEnabled })
  }
}

export const NOTIFICATION_LABELS: Record<string, string> = {
  invoice: 'Facturas y pagos',
  message: 'Mensajes nuevos',
  milestone: 'Avances del proyecto',
  incident: 'Incidentes del servicio',
  document: 'Documentos nuevos',
  system: 'Avisos de la cuenta',
}

export const MANDATORY_TYPES = MANDATORY_EMAIL
