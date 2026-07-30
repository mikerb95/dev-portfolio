import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { portalActivity } from '../../../../db/schema'

// Válvula del feed de actividad: apagar una entrada que se emitió y no debía
// verse. Sesión de admin impuesta por el middleware de /api/admin.
//
// Se apaga, no se borra: el registro de que aquello ocurrió sigue siendo útil
// para mí aunque el cliente no deba verlo. Borrar perdería las dos cosas.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const PATCH: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const id = Number(data.id)
  if (!Number.isInteger(id)) return json(400, { error: 'id inválido' })
  if (typeof data.visibleToClient !== 'boolean') {
    return json(400, { error: 'visibleToClient debe ser booleano' })
  }

  const [row] = await db
    .update(portalActivity)
    .set({ visibleToClient: data.visibleToClient })
    .where(eq(portalActivity.id, id))
    .returning({ id: portalActivity.id, visibleToClient: portalActivity.visibleToClient })

  if (!row) return json(404, { error: 'entrada no encontrada' })
  return json(200, { ok: true, visibleToClient: row.visibleToClient })
}
