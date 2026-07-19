import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { educationLabProgress } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

export const POST: APIRoute = async ({ request }) => {
  const { labSlug, completed } = await request.json()

  if (!labSlug) {
    return new Response(JSON.stringify({ error: 'labSlug es requerido' }), { status: 400 })
  }

  const now = new Date()
  const existing = await db
    .select({ id: educationLabProgress.id })
    .from(educationLabProgress)
    .where(eq(educationLabProgress.labSlug, labSlug))
    .get()

  if (existing) {
    await db
      .update(educationLabProgress)
      .set({ completed: !!completed, completedAt: completed ? now : null, updatedAt: now })
      .where(eq(educationLabProgress.labSlug, labSlug))
  } else {
    await db.insert(educationLabProgress).values({
      labSlug,
      completed: !!completed,
      completedAt: completed ? now : null,
      createdAt: now,
      updatedAt: now,
    })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
