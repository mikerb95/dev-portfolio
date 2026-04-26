import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { briefings, clients, projects } from '../../../../db/schema'
import { desc, eq } from 'drizzle-orm'

export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      id: briefings.id,
      title: briefings.title,
      status: briefings.status,
      estimatedBudget: briefings.estimatedBudget,
      agreedBudget: briefings.agreedBudget,
      estimatedHours: briefings.estimatedHours,
      deadline: briefings.deadline,
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
    .orderBy(desc(briefings.createdAt))

  return new Response(JSON.stringify(rows), { status: 200 })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const {
    title, clientId, projectId, status, objective, scope,
    requirements, deliverables, estimatedBudget, agreedBudget,
    estimatedHours, deadline, notes,
  } = body

  if (!title) {
    return new Response(JSON.stringify({ error: 'title es requerido' }), { status: 400 })
  }

  const [row] = await db.insert(briefings).values({
    title,
    clientId: clientId ?? null,
    projectId: projectId ?? null,
    status: status ?? 'borrador',
    objective: objective ?? null,
    scope: scope ?? null,
    requirements: requirements ?? null,
    deliverables: deliverables ?? null,
    estimatedBudget: estimatedBudget ?? null,
    agreedBudget: agreedBudget ?? null,
    estimatedHours: estimatedHours ?? null,
    deadline: deadline ? new Date(deadline) : null,
    notes: notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}
