import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../../lib/security/events'
import { guardarCampana } from '../../../../../lib/marketing/db'
import { leerContenido, json } from './_comun'

// Campañas de marketing: crear borrador. La sesión de admin la impone el
// middleware (todo /api/admin pasa por el matcher isAdmin).

export const POST: APIRoute = async ({ request }) => {
  const contenido = await leerContenido(request)
  if (!contenido) return json(400, { error: 'JSON inválido' })
  const r = await guardarCampana(null, contenido)
  if (!r.ok) return json(422, { error: 'Campaña incompleta', errores: r.errores })
  await recordAdminEvent(request, 'marketing.campana_creada')
  return json(201, { ok: true, id: r.id })
}
