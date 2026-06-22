import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { presentations, presentationSlides } from '../../../../db/schema'
import { eq, count } from 'drizzle-orm'
import { put } from '@vercel/blob'

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!id) return new Response('Bad request', { status: 400 })

  const [pres] = await db.select({ id: presentations.id })
    .from(presentations)
    .where(eq(presentations.id, id))
    .limit(1)

  if (!pres) return new Response('Not found', { status: 404 })

  const form = await request.formData()
  const files = form.getAll('files') as File[]

  if (!files.length) return new Response('No files', { status: 400 })

  const [{ total }] = await db
    .select({ total: count() })
    .from(presentationSlides)
    .where(eq(presentationSlides.presentationId, id))

  const inserted = await Promise.all(
    files.map(async (file, i) => {
      const blob = await put(`slides/${id}/${Date.now()}-${i}.png`, file, {
        access: 'public',
        contentType: 'image/png',
      })
      return db.insert(presentationSlides).values({
        presentationId: id,
        order: total + i,
        url: blob.url,
        createdAt: new Date(),
      }).returning()
    })
  )

  return new Response(JSON.stringify(inserted.flat()), {
    headers: { 'Content-Type': 'application/json' },
  })
}
