import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projects, clients, projectEnvVars, projectServices, projectContacts, finances } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'
import { sinSecretosLista, sinValorCifradoLista } from '../../../../../lib/vault'

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)

  const project = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      description: projects.description,
      techStack: projects.techStack,
      repoUrl: projects.repoUrl,
      previewUrl: projects.previewUrl,
      screenshotUrl: projects.screenshotUrl,
      visible: projects.visible,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      internalNotes: projects.internalNotes,
      clientId: projects.clientId,
      clientName: clients.name,
      clientEmail: clients.email,
      clientCompany: clients.company,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(projects.id, id))
    .get()

  if (!project) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

  const [envVars, services, contacts, financeRows] = await Promise.all([
    db.select().from(projectEnvVars).where(eq(projectEnvVars.projectId, id)),
    db.select().from(projectServices).where(eq(projectServices.projectId, id)),
    db.select().from(projectContacts).where(eq(projectContacts.projectId, id)),
    db.select().from(finances).where(eq(finances.projectId, id)),
  ])

  // `db.select()` sin proyección trae también el contenido de la bóveda: hay que
  // redactarlo antes de serializar. Los reveladores viven en sus propios
  // endpoints (services/[id]/secrets, projects/[id]/envvars?id=), no acá.
  return new Response(
    JSON.stringify({
      project,
      envVars: sinValorCifradoLista(envVars),
      services: sinSecretosLista(services),
      contacts,
      finances: financeRows,
    }),
    { status: 200 },
  )
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const body = await request.json()

  const { title, description, techStack, repoUrl, previewUrl, screenshotUrl, status, startDate, endDate, internalNotes, clientId, visible, slug } = body

  await db.update(projects).set({
    ...(title !== undefined && { title }),
    ...(slug !== undefined && { slug }),
    ...(description !== undefined && { description }),
    ...(techStack !== undefined && { techStack }),
    ...(repoUrl !== undefined && { repoUrl }),
    ...(previewUrl !== undefined && { previewUrl }),
    ...(screenshotUrl !== undefined && { screenshotUrl }),
    ...(status !== undefined && { status }),
    ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
    ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
    ...(internalNotes !== undefined && { internalNotes }),
    ...(clientId !== undefined && { clientId }),
    ...(visible !== undefined && { visible }),
  }).where(eq(projects.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  await db.delete(projects).where(eq(projects.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
