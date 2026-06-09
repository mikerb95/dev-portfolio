import type { APIRoute } from 'astro'
import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ request }) => {
  const { slug, visible, title, description, repoUrl, previewUrl, language, topics } = await request.json()

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 })
  }

  // Stack auto: lenguaje primario + topics, deduplicado
  const stackArr = [...new Set([language, ...(Array.isArray(topics) ? topics : [])].filter(Boolean))]
  const techStack = stackArr.length ? JSON.stringify(stackArr) : null

  const existing = await db.select().from(projects).where(eq(projects.slug, slug)).get()

  if (existing) {
    // Solo rellena techStack si está vacío (no clobberea ediciones manuales)
    await db.update(projects)
      .set({ visible, ...(!existing.techStack && techStack ? { techStack } : {}) })
      .where(eq(projects.slug, slug))
  } else {
    await db.insert(projects).values({
      slug,
      title: title ?? slug,
      description: description ?? null,
      techStack,
      repoUrl: repoUrl ?? null,
      previewUrl: previewUrl ?? null,
      visible,
      createdAt: new Date(),
    })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
