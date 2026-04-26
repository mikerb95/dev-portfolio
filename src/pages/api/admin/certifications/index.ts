import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { educationMilestones } from '../../../../db/schema'
import { desc } from 'drizzle-orm'

export const GET: APIRoute = async () => {
  const rows = await db
    .select()
    .from(educationMilestones)
    .orderBy(desc(educationMilestones.completedDate), desc(educationMilestones.createdAt))

  return new Response(JSON.stringify(rows), { status: 200 })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const {
    title, institution, description, skills,
    status, startDate, completedDate,
    certificateUrl, projectId, isPublic,
  } = body

  if (!title) {
    return new Response(JSON.stringify({ error: 'title es requerido' }), { status: 400 })
  }

  const [row] = await db.insert(educationMilestones).values({
    title,
    institution: institution ?? null,
    description: description ?? null,
    skills: skills ? JSON.stringify(skills) : null,
    status: status ?? 'completado',
    startDate: startDate ? new Date(startDate) : null,
    completedDate: completedDate ? new Date(completedDate) : null,
    certificateUrl: certificateUrl ?? null,
    projectId: projectId ?? null,
    isPublic: isPublic ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}
