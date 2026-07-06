import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { briefings, clients, projects } from '../../../../../db/schema'
import { and, eq, isNull } from 'drizzle-orm'

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)

  const row = await db
    .select({
      id: briefings.id,
      title: briefings.title,
      status: briefings.status,
      objective: briefings.objective,
      scope: briefings.scope,
      estimatedBudget: briefings.estimatedBudget,
      agreedBudget: briefings.agreedBudget,
      estimatedHours: briefings.estimatedHours,
      deadline: briefings.deadline,
      notes: briefings.notes,
      clientId: briefings.clientId,
      projectId: briefings.projectId,
      clientName: clients.name,
      projectTitle: projects.title,
      createdAt: briefings.createdAt,
      updatedAt: briefings.updatedAt,
    })
    .from(briefings)
    .leftJoin(clients, eq(briefings.clientId, clients.id))
    .leftJoin(projects, eq(briefings.projectId, projects.id))
    .where(and(eq(briefings.id, id), isNull(briefings.deletedAt)))
    .get()

  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  return new Response(JSON.stringify(row), { status: 200 })
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const body = await request.json()
  const {
    title, clientId, projectId, status, objective, scope,
    estimatedBudget, agreedBudget, estimatedHours, deadline, notes,
  } = body

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    return new Response(JSON.stringify({ error: 'title no puede estar vacío' }), { status: 400 })
  }

  await db.update(briefings).set({
    ...(title !== undefined && { title: title.trim() }),
    ...(clientId !== undefined && { clientId: clientId ? Number(clientId) : null }),
    ...(projectId !== undefined && { projectId: projectId ? Number(projectId) : null }),
    ...(status !== undefined && { status }),
    ...(objective !== undefined && { objective: objective || null }),
    ...(scope !== undefined && { scope: scope || null }),
    ...(estimatedBudget !== undefined && { estimatedBudget: estimatedBudget != null ? Number(estimatedBudget) : null }),
    ...(agreedBudget !== undefined && { agreedBudget: agreedBudget != null ? Number(agreedBudget) : null }),
    ...(estimatedHours !== undefined && { estimatedHours: estimatedHours != null ? Number(estimatedHours) : null }),
    ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
    ...(notes !== undefined && { notes: notes || null }),
    updatedAt: new Date(),
  }).where(eq(briefings.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  await db.update(briefings).set({ deletedAt: new Date() }).where(eq(briefings.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
