import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { briefings, clients, projects } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)

  const row = await db
    .select({
      id: briefings.id,
      title: briefings.title,
      status: briefings.status,
      objective: briefings.objective,
      scope: briefings.scope,
      requirements: briefings.requirements,
      deliverables: briefings.deliverables,
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
    .where(eq(briefings.id, id))
    .get()

  if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  return new Response(JSON.stringify(row), { status: 200 })
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const body = await request.json()
  const {
    title, clientId, projectId, status, objective, scope,
    requirements, deliverables, estimatedBudget, agreedBudget,
    estimatedHours, deadline, notes,
  } = body

  await db.update(briefings).set({
    ...(title !== undefined && { title }),
    ...(clientId !== undefined && { clientId }),
    ...(projectId !== undefined && { projectId }),
    ...(status !== undefined && { status }),
    ...(objective !== undefined && { objective }),
    ...(scope !== undefined && { scope }),
    ...(requirements !== undefined && { requirements }),
    ...(deliverables !== undefined && { deliverables }),
    ...(estimatedBudget !== undefined && { estimatedBudget }),
    ...(agreedBudget !== undefined && { agreedBudget }),
    ...(estimatedHours !== undefined && { estimatedHours }),
    ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
    ...(notes !== undefined && { notes }),
    updatedAt: new Date(),
  }).where(eq(briefings.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  await db.delete(briefings).where(eq(briefings.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
