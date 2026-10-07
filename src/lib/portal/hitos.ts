// Actualizar un hito del proyecto: lo comparten el formulario del panel
// (PATCH /api/admin/portal/hitos) y el asistente del dashboard
// (actualizar_hito). Vive aquí y no en el endpoint porque completar un hito
// visible avisa al cliente, y dos copias de esa regla terminarían avisando
// distinto según por dónde se hizo el cambio.
//
// Importa `src/db`: solo servidor.

import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { projectMilestones, projects } from '../../db/schema'
import { recordActivity } from './activity'
import { notifyClient } from './notifications'

export const ESTADOS_HITO = ['pendiente', 'en_curso', 'completado'] as const
export type EstadoHito = (typeof ESTADOS_HITO)[number]

export type CambiosHito = {
  title?: string
  description?: string | null
  visibleToClient?: boolean
  /** null quita la fecha. */
  dueAt?: Date | null
  status?: EstadoHito
}

export type Hito = typeof projectMilestones.$inferSelect

/** Lo que se va a guardar, sin escribir: `completedAt` lo pone el servidor, no el formulario. */
export function parcheHito(actual: Pick<Hito, 'status' | 'completedAt'>, cambios: CambiosHito): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (cambios.title !== undefined) patch.title = cambios.title
  if (cambios.description !== undefined) patch.description = cambios.description
  if (cambios.visibleToClient !== undefined) patch.visibleToClient = cambios.visibleToClient
  if (cambios.dueAt !== undefined) patch.dueAt = cambios.dueAt
  if (cambios.status !== undefined) {
    patch.status = cambios.status
    // Es un hecho, no una opinión editable: se conserva la fecha original si ya estaba completado.
    patch.completedAt = cambios.status === 'completado' ? (actual.completedAt ?? new Date()) : null
  }
  return patch
}

/**
 * ¿Este cambio le avisa al cliente? Solo en la transición a completado y solo
 * si el hito queda visible: un segundo guardado sobre un hito ya completado no
 * debe mandar otro correo.
 */
export function avisaAlCliente(actual: Pick<Hito, 'status' | 'visibleToClient'>, cambios: CambiosHito): boolean {
  const completa = cambios.status === 'completado' && actual.status !== 'completado'
  const visible = cambios.visibleToClient ?? actual.visibleToClient
  return completa && visible
}

/** Aplica los cambios y, si corresponde, avisa al cliente. Devuelve si avisó. */
export async function actualizarHito(actual: Hito, cambios: CambiosHito): Promise<{ avisado: boolean }> {
  const patch = parcheHito(actual, cambios)
  if (Object.keys(patch).length === 0) return { avisado: false }
  await db.update(projectMilestones).set(patch).where(eq(projectMilestones.id, actual.id))

  if (!avisaAlCliente(actual, cambios)) return { avisado: false }
  const [project] = await db
    .select({ clientId: projects.clientId, title: projects.title })
    .from(projects)
    .where(eq(projects.id, actual.projectId))
    .limit(1)
  if (!project?.clientId) return { avisado: false }

  const titulo = cambios.title ?? actual.title
  await notifyClient({
    clientId: project.clientId,
    type: 'milestone',
    title: `Hito completado · ${titulo}`,
    body: `Avanzamos en ${project.title}. Puedes ver el detalle en tu portal.`,
    href: '/portal',
    emailCta: 'Ver el avance',
  })
  // Feed: la notificación es por persona y se marca leída; esto es el
  // registro compartido que queda en la línea de tiempo del proyecto.
  await recordActivity({
    clientId: project.clientId,
    projectId: actual.projectId,
    type: 'milestone',
    title: `Hito completado · ${titulo}`,
    href: '/portal',
  })
  return { avisado: true }
}
