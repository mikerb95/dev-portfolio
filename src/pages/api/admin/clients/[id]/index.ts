import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { clients, projects, briefings, finances, messages, projectServices } from '../../../../../db/schema'
import { eq, count } from 'drizzle-orm'
import { validateClient, json } from '../_shared'

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return json({ error: 'id inválido' }, 400)
  const row = await db.select().from(clients).where(eq(clients.id, id)).get()
  if (!row) return json({ error: 'Cliente no encontrado' }, 404)
  return json(row)
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return json({ error: 'id inválido' }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const result = validateClient(body)
  if ('error' in result) return json({ error: result.error }, 400)

  const existing = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).get()
  if (!existing) return json({ error: 'Cliente no encontrado' }, 404)

  await db.update(clients).set(result.data).where(eq(clients.id, id))
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return json({ error: 'id inválido' }, 400)

  // Bloquear el borrado si hay registros que referencian al cliente: evita
  // huérfanos (o fallos de FK) en proyectos, briefings, finanzas, mensajes y servicios.
  const linked: string[] = []
  const check = async (table: any, col: any, label: string) => {
    const [r] = await db.select({ n: count() }).from(table).where(eq(col, id))
    if (r.n > 0) linked.push(`${r.n} ${label}`)
  }
  await check(projects, projects.clientId, 'proyecto(s)')
  await check(briefings, briefings.clientId, 'briefing(s)')
  await check(finances, finances.clientId, 'movimiento(s) financiero(s)')
  await check(messages, messages.clientId, 'mensaje(s)')
  await check(projectServices, projectServices.clientId, 'servicio(s)')

  if (linked.length > 0) {
    return json(
      { error: `No se puede eliminar: el cliente tiene ${linked.join(', ')} vinculados. Reasigna o elimina esos registros primero.` },
      409,
    )
  }

  await db.delete(clients).where(eq(clients.id, id))
  return json({ ok: true })
}
