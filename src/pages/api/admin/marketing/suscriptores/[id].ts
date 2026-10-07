import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../../lib/security/events'
import { darDeBaja } from '../../../../../lib/marketing/db'
import { json } from '../campanas/_comun'

// Baja a mano, para quien responde un correo pidiendo que lo saquen.

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id inválido' })
  await darDeBaja(id)
  await recordAdminEvent(request, 'marketing.baja_manual')
  return json(200, { ok: true })
}
