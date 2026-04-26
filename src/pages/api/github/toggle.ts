import type { APIRoute } from 'astro'
import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ request }) => {
  const { slug, visible, title, description, repoUrl, previewUrl } = await request.json()

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 })
  }

  const existing = await db.select().from(projects).where(eq(projects.slug, slug)).get()

  if (existing) {
    await db.update(projects).set({ visible }).where(eq(projects.slug, slug))
  } else {
    await db.insert(projects).values({
      slug,
      title: title ?? slug,
      description: description ?? null,
      repoUrl: repoUrl ?? null,
      previewUrl: previewUrl ?? null,
      visible,
      createdAt: new Date(),
    })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
