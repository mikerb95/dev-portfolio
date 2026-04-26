import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { educationMilestones } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const body = await request.json()
  const {
    title, institution, description, skills,
    status, startDate, completedDate,
    certificateUrl, projectId, isPublic,
  } = body

  await db.update(educationMilestones).set({
    ...(title !== undefined && { title }),
    ...(institution !== undefined && { institution }),
    ...(description !== undefined && { description }),
    ...(skills !== undefined && { skills: skills ? JSON.stringify(skills) : null }),
    ...(status !== undefined && { status }),
    ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
    ...(completedDate !== undefined && { completedDate: completedDate ? new Date(completedDate) : null }),
    ...(certificateUrl !== undefined && { certificateUrl }),
    ...(projectId !== undefined && { projectId }),
    ...(isPublic !== undefined && { isPublic }),
    updatedAt: new Date(),
  }).where(eq(educationMilestones.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  await db.delete(educationMilestones).where(eq(educationMilestones.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
