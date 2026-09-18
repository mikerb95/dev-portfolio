import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { livingCosts } from '../../../../db/schema'
import { normalizarFijo } from '../../../../lib/vida'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ error: 'JSON inválido' }, 400)
  const r = normalizarFijo(body)
  if (!r.ok) return json({ error: r.error }, 400)
  const now = new Date()
  const [row] = await db.insert(livingCosts).values({ ...r.value, createdAt: now, updatedAt: now }).returning()
  return json(row, 201)
}

export const PUT: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id requerido' }, 400)
  const r = normalizarFijo(body)
  if (!r.ok) return json({ error: r.error }, 400)
  await db.update(livingCosts).set({ ...r.value, updatedAt: new Date() }).where(eq(livingCosts.id, id))
  return json({ ok: true })
}

// Borrar un fijo no borra sus pagos: la FK los deja en null (o con un id
// huérfano si la conexión no aplica foreign keys) y el resumen los cuenta como
// gasto variable en ambos casos. El dinero de meses pasados salió igual.
export const DELETE: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id requerido' }, 400)
  await db.delete(livingCosts).where(eq(livingCosts.id, id))
  return json({ ok: true })
}
