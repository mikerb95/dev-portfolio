import type { APIRoute } from 'astro'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../../../db'
import { projectMilestones, projects } from '../../../../db/schema'
import { notifyClient } from '../../../../lib/portal/notifications'

// Hitos del proyecto: lo que el cliente ve como línea de tiempo en su portal.
// Sesión de admin impuesta por el middleware de /api/admin.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const STATUSES: readonly string[] = ['pendiente', 'en_curso', 'completado']

/** Crea un hito. */
export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const projectId = Number(data.projectId)
  if (!Number.isInteger(projectId)) return json(400, { error: 'projectId inválido' })

  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 200) : ''
  if (!title) return json(400, { error: 'el hito necesita un título' })

  const dueAt = typeof data.dueAt === 'string' && data.dueAt ? new Date(data.dueAt) : null
  if (dueAt && Number.isNaN(dueAt.getTime())) return json(400, { error: 'fecha inválida' })

  // Al final de la lista: el orden por defecto es el cronológico de creación.
  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${projectMilestones.sortOrder})` })
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId))

  const [milestone] = await db
    .insert(projectMilestones)
    .values({
      projectId,
      title,
      description: typeof data.description === 'string' ? data.description.slice(0, 1000) : null,
      status: 'pendiente',
      dueAt,
      visibleToClient: data.visibleToClient !== false,
      sortOrder: (max ?? -1) + 1,
      createdAt: new Date(),
    })
    .returning()

  return json(201, { ok: true, id: milestone.id })
}

/**
 * Actualiza un hito. Completar uno visible avisa al cliente: es la clase de
 * novedad por la que abrió el portal.
 */
export const PATCH: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const id = Number(data.id)
  if (!Number.isInteger(id)) return json(400, { error: 'id inválido' })

  const [current] = await db.select().from(projectMilestones).where(eq(projectMilestones.id, id)).limit(1)
  if (!current) return json(404, { error: 'hito no encontrado' })

  const patch: Record<string, unknown> = {}

  if (typeof data.title === 'string' && data.title.trim()) patch.title = data.title.trim().slice(0, 200)
  if (typeof data.description === 'string') patch.description = data.description.slice(0, 1000) || null
  if (typeof data.visibleToClient === 'boolean') patch.visibleToClient = data.visibleToClient

  if (typeof data.dueAt === 'string') {
    const dueAt = data.dueAt ? new Date(data.dueAt) : null
    if (dueAt && Number.isNaN(dueAt.getTime())) return json(400, { error: 'fecha inválida' })
    patch.dueAt = dueAt
  }

  let justCompleted = false
  if (typeof data.status === 'string') {
    if (!STATUSES.includes(data.status)) return json(400, { error: 'estado desconocido' })
    patch.status = data.status
    // `completedAt` lo pone el servidor, no el formulario: es un hecho, no una
    // opinión editable.
    patch.completedAt = data.status === 'completado' ? (current.completedAt ?? new Date()) : null
    justCompleted = data.status === 'completado' && current.status !== 'completado'
  }

  if (Object.keys(patch).length === 0) return json(400, { error: 'nada que actualizar' })

  await db.update(projectMilestones).set(patch).where(eq(projectMilestones.id, id))

  // Solo se avisa de lo que el cliente puede ver, y solo en la transición: un
  // segundo PATCH sobre un hito ya completado no debe mandar otro correo.
  const visible = (patch.visibleToClient as boolean | undefined) ?? current.visibleToClient
  if (justCompleted && visible) {
    const [project] = await db
      .select({ clientId: projects.clientId, title: projects.title })
      .from(projects)
      .where(eq(projects.id, current.projectId))
      .limit(1)

    if (project?.clientId) {
      await notifyClient({
        clientId: project.clientId,
        type: 'milestone',
        title: `Hito completado · ${(patch.title as string) ?? current.title}`,
        body: `Avanzamos en ${project.title}. Puedes ver el detalle en tu portal.`,
        href: '/portal',
        emailCta: 'Ver el avance',
      })
    }
  }

  return json(200, { ok: true })
}

/** Borra un hito. */
export const DELETE: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const id = Number(data.id)
  if (!Number.isInteger(id)) return json(400, { error: 'id inválido' })

  await db.delete(projectMilestones).where(eq(projectMilestones.id, id))
  return json(200, { ok: true })
}

/** Reordena los hitos de un proyecto. */
export const PUT: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const projectId = Number(data.projectId)
  const order = data.order
  if (!Number.isInteger(projectId) || !Array.isArray(order)) return json(400, { error: 'datos inválidos' })

  // El projectId se exige en cada UPDATE: sin él, un id de otro proyecto
  // colado en `order` reordenaría hitos ajenos.
  await Promise.all(
    order.map((rawId, i) => {
      const milestoneId = Number(rawId)
      if (!Number.isInteger(milestoneId)) return Promise.resolve()
      return db
        .update(projectMilestones)
        .set({ sortOrder: i })
        .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.projectId, projectId)))
    })
  )

  return json(200, { ok: true })
}
