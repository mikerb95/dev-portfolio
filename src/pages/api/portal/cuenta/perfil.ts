import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { clientUsers } from '../../../../db/schema'
import { requirePortalSession } from '../../../../lib/portal/session'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Actualiza el perfil. Solo el nombre: el correo es la identidad de login y
 * cambiarlo por autoservicio permitiría apropiarse de una cuenta ajena tras
 * robar una sesión. Ese cambio pasa por mí a propósito.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requirePortalSession(context)
  if (auth.response) return auth.response
  const { session } = auth

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const name = typeof data.name === 'string' ? data.name.trim().slice(0, 120) : ''
  if (!name) return json(400, { error: 'Escribe tu nombre.' })

  await db.update(clientUsers).set({ name }).where(eq(clientUsers.id, session.user.id))
  return json(200, { ok: true })
}
