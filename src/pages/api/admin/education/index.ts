import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { educationMilestones, projects } from '../../../../db/schema'
import { eq, desc } from 'drizzle-orm'

export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      id: educationMilestones.id,
      title: educationMilestones.title,
      institution: educationMilestones.institution,
      description: educationMilestones.description,
      skills: educationMilestones.skills,
      status: educationMilestones.status,
      startDate: educationMilestones.startDate,
      completedDate: educationMilestones.completedDate,
      certificateUrl: educationMilestones.certificateUrl,
      isPublic: educationMilestones.isPublic,
      createdAt: educationMilestones.createdAt,
      projectId: educationMilestones.projectId,
      projectTitle: projects.title,
      projectSlug: projects.slug,
    })
    .from(educationMilestones)
    .leftJoin(projects, eq(educationMilestones.projectId, projects.id))
    .orderBy(desc(educationMilestones.startDate))

  return new Response(JSON.stringify(rows), { status: 200 })
}

export const POST: APIRoute = async ({ request }) => {
  const { title, institution, description, skills, status, startDate, completedDate, certificateUrl, projectId, isPublic } =
    await request.json()

  if (!title) {
    return new Response(JSON.stringify({ error: 'title es requerido' }), { status: 400 })
  }

  const [row] = await db
    .insert(educationMilestones)
    .values({
      title,
      institution: institution ?? null,
      description: description ?? null,
      skills: skills ? JSON.stringify(skills) : null,
      status: status ?? 'en_curso',
      startDate: startDate ? new Date(startDate) : null,
      completedDate: completedDate ? new Date(completedDate) : null,
      certificateUrl: certificateUrl ?? null,
      projectId: projectId ? Number(projectId) : null,
      isPublic: isPublic ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return new Response(JSON.stringify(row), { status: 201 })
}
