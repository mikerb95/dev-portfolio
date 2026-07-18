import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { presentations, presentationSlides } from '../../../../../db/schema'
import { eq, asc } from 'drizzle-orm'

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!id) return new Response('Bad request', { status: 400 })

  const [pres] = await db.select({
    currentSlide: presentations.currentSlide,
  })
    .from(presentations)
    .where(eq(presentations.id, id))
    .limit(1)

  if (!pres) return new Response('Not found', { status: 404 })

  const slides = await db.select({ url: presentationSlides.url })
    .from(presentationSlides)
    .where(eq(presentationSlides.presentationId, id))
    .orderBy(asc(presentationSlides.order))

  return new Response(
    JSON.stringify({
      slide: pres.currentSlide ?? 0,
      total: slides.length,
      urls: slides.map((s) => s.url),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  )
}
