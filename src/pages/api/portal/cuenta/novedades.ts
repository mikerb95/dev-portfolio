import type { APIRoute } from 'astro'
import { requirePortalSession } from '../../../../lib/portal/session'
import { preferenciaPortal } from '../../../../lib/marketing/db'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Casilla "Novedades y promociones" de la cuenta. El correo sale de la sesión,
 * nunca del body: si no, cualquiera con portal podría suscribir (o dar de
 * baja) un correo ajeno.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requirePortalSession(context)
  if (auth.response) return auth.response
  const { user } = auth.session

  let data: Record<string, unknown>
  try {
    data = await context.request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }
  if (typeof data.activo !== 'boolean') return json(400, { error: 'Valor inválido.' })

  await preferenciaPortal({ clientUserId: user.id, email: user.email, nombre: user.name, activo: data.activo })
  return json(200, { ok: true })
}
