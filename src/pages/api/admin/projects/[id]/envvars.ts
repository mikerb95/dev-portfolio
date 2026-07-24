import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projectEnvVars } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'
import { encrypt, decrypt } from '../../../../../lib/crypto'
import { sinValorCifrado } from '../../../../../lib/vault'

export const GET: APIRoute = async ({ params, url }) => {
  const envId = Number(url.searchParams.get('id'))
  if (!envId) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })

  const row = await db.select().from(projectEnvVars).where(eq(projectEnvVars.id, envId)).get()
  if (!row) return new Response(JSON.stringify({ error: 'no encontrado' }), { status: 404 })

  if (row.projectId !== Number(params.id)) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })
  }

  return new Response(JSON.stringify({ value: decrypt(row.value) }), { status: 200 })
}

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = Number(params.id)
  const { key, value, environment, notes } = await request.json()

  if (!key || !value) {
    return new Response(JSON.stringify({ error: 'key y value son requeridos' }), { status: 400 })
  }

  const [row] = await db.insert(projectEnvVars).values({
    projectId,
    key,
    value: encrypt(value),
    environment: environment ?? 'all',
    notes: notes ?? null,
    createdAt: new Date(),
  }).returning()

  return new Response(JSON.stringify(sinValorCifrado(row)), { status: 201 })
}

export const PUT: APIRoute = async ({ request }) => {
  const { id, key, value, environment, notes } = await request.json()

  await db.update(projectEnvVars).set({
    ...(key !== undefined && { key }),
    ...(value !== undefined && { value: encrypt(value) }),
    ...(environment !== undefined && { environment }),
    ...(notes !== undefined && { notes }),
  }).where(eq(projectEnvVars.id, id))

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await request.json()
  await db.delete(projectEnvVars).where(eq(projectEnvVars.id, id))
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
