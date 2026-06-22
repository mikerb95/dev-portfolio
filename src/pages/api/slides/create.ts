import type { APIRoute } from 'astro'
import { db } from '../../../db'
import { presentations } from '../../../db/schema'
import { randomBytes } from 'crypto'

export const POST: APIRoute = async ({ request }) => {
  const { projectId, title } = await request.json()
  if (!projectId || !title) return new Response('Bad request', { status: 400 })

  const shareToken = randomBytes(12).toString('hex')

  const [pres] = await db.insert(presentations).values({
    projectId: Number(projectId),
    title,
    shareToken,
    currentSlide: 0,
    isActive: false,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(pres), {
    headers: { 'Content-Type': 'application/json' },
  })
}
