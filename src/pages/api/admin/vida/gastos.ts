import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { livingExpenses } from '../../../../db/schema'
import { normalizarGasto } from '../../../../lib/vida'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ error: 'JSON inválido' }, 400)
  const r = normalizarGasto(body)
  if (!r.ok) return json({ error: r.error }, 400)
  const [row] = await db.insert(livingExpenses).values({ ...r.value, createdAt: new Date() }).returning()
  return json(row, 201)
}

export const PUT: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id requerido' }, 400)
  const r = normalizarGasto(body)
  if (!r.ok) return json({ error: r.error }, 400)
  await db.update(livingExpenses).set(r.value).where(eq(livingExpenses.id, id))
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id requerido' }, 400)
  await db.delete(livingExpenses).where(eq(livingExpenses.id, id))
  return json({ ok: true })
}
