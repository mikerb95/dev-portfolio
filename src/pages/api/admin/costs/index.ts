import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { projectServices } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { normalizeServiceInput, SERVICE_CATEGORIES } from '../../../../lib/services'

const isValidCategory = (c: unknown) => SERVICE_CATEGORIES.includes(c as any)

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  if (!body?.name || !isValidCategory(body?.category)) {
    return new Response(JSON.stringify({ error: 'name y category (válida) son requeridos' }), { status: 400 })
  }
  try {
    const values = normalizeServiceInput(body)
    const [row] = await db
      .insert(projectServices)
      .values({ ...(values as any), createdAt: new Date(), updatedAt: new Date() })
      .returning()
    return new Response(JSON.stringify({ ...row, secrets: undefined }), { status: 201 })
  } catch (e) {
    return new Response(JSON.stringify({ error: errMsg(e) }), { status: 500 })
  }
}

export const PUT: APIRoute = async ({ request }) => {
  const body = await request.json()
  const id = Number(body?.id)
  if (!id) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })
  if (body.category !== undefined && !isValidCategory(body.category)) {
    return new Response(JSON.stringify({ error: 'category inválida' }), { status: 400 })
  }
  try {
    const values = normalizeServiceInput(body)
    await db
      .update(projectServices)
      .set({ ...(values as any), updatedAt: new Date() })
      .where(eq(projectServices.id, id))
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: errMsg(e) }), { status: 500 })
  }
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await request.json()
  if (!id) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })
  await db.delete(projectServices).where(eq(projectServices.id, Number(id)))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

function errMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : 'Error desconocido'
  if (msg.includes('ENCRYPTION_KEY')) {
    return 'Falta configurar ENCRYPTION_KEY (hex de 32 bytes) para guardar credenciales.'
  }
  return msg
}
