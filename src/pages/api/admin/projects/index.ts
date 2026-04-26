import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { projects, clients } from '../../../../db/schema'
import { desc, eq } from 'drizzle-orm'

export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      status: projects.status,
      techStack: projects.techStack,
      startDate: projects.startDate,
      endDate: projects.endDate,
      visible: projects.visible,
      clientName: clients.name,
      clientId: projects.clientId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .orderBy(desc(projects.createdAt))

  return new Response(JSON.stringify(rows), { status: 200 })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const { slug, title, description, techStack, repoUrl, previewUrl, screenshotUrl, status, startDate, endDate, internalNotes, clientId } = body

  if (!slug || !title) {
    return new Response(JSON.stringify({ error: 'slug y title son requeridos' }), { status: 400 })
  }

  const [row] = await db.insert(projects).values({
    slug,
    title,
    description: description ?? null,
    techStack: techStack ?? null,
    repoUrl: repoUrl ?? null,
    previewUrl: previewUrl ?? null,
    screenshotUrl: screenshotUrl ?? null,
    status: status ?? 'activo',
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    internalNotes: internalNotes ?? null,
    clientId: clientId ?? null,
    visible: false,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}
