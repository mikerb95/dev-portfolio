import type { APIRoute } from 'astro'
import { db } from '../../../../../../db'
import { briefingItems } from '../../../../../../db/schema'
import { asc, eq } from 'drizzle-orm'

const KINDS = ['requerimiento', 'entregable', 'exclusion'] as const

export const GET: APIRoute = async ({ params }) => {
  const briefingId = Number(params.id)
  const rows = await db
    .select()
    .from(briefingItems)
    .where(eq(briefingItems.briefingId, briefingId))
    .orderBy(asc(briefingItems.kind), asc(briefingItems.sortOrder))
  return new Response(JSON.stringify(rows), { status: 200 })
}

export const POST: APIRoute = async ({ params, request }) => {
  const briefingId = Number(params.id)
  const body = await request.json()
  const { kind, content } = body

  if (!KINDS.includes(kind)) {
    return new Response(JSON.stringify({ error: 'kind inválido' }), { status: 400 })
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return new Response(JSON.stringify({ error: 'content es requerido' }), { status: 400 })
  }

  const existing = await db
    .select({ sortOrder: briefingItems.sortOrder })
    .from(briefingItems)
    .where(eq(briefingItems.briefingId, briefingId))
  const nextOrder = existing.length

  const [row] = await db.insert(briefingItems).values({
    briefingId,
    kind,
    content: content.trim(),
    done: false,
    sortOrder: nextOrder,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(row), { status: 201 })
}
