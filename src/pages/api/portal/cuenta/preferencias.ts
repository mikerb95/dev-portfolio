import type { APIRoute } from 'astro'
import { NOTIFICATION_LABELS, setPref } from '../../../../lib/portal/notifications'
import { requirePortalSession } from '../../../../lib/portal/session'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Activa o desactiva el email de un tipo de aviso.
 *
 * `setPref` ignora en silencio los tipos obligatorios (facturas): la UI ya los
 * muestra deshabilitados, y esto es la red que impide saltárselos con un fetch
 * a mano.
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

  const type = typeof data.type === 'string' ? data.type : ''
  // Allowlist: sin ella, la tabla de preferencias se llenaría de tipos
  // inventados por quien quisiera.
  if (!(type in NOTIFICATION_LABELS)) return json(400, { error: 'Tipo de aviso desconocido.' })
  if (typeof data.emailEnabled !== 'boolean') return json(400, { error: 'Valor inválido.' })

  await setPref(session.user.id, type, data.emailEnabled)
  return json(200, { ok: true })
}
