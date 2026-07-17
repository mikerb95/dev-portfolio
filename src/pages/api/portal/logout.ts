import type { APIRoute } from 'astro'
import { clearSessionCookie, getPortalSession, revokeSession } from '../../../lib/portal/session'
import { audit } from '../../../lib/portal/audit'
import { clientIp } from '../../../lib/device-info'

/**
 * Cerrar sesión revoca la fila, no solo borra la cookie: si alguien copió el
 * token antes (un equipo compartido, una extensión), deja de servir ahora mismo.
 */
export const POST: APIRoute = async (context) => {
  const session = await getPortalSession(context)
  if (session) {
    await revokeSession(session.sessionId)
    audit({
      clientId: session.client.id,
      clientUserId: session.user.id,
      action: session.impersonatedBy ? 'impersonate.end' : 'logout',
      detail: session.impersonatedBy ? `admin: ${session.impersonatedBy}` : null,
      ip: clientIp(context.request.headers),
    })
    // Saliendo de "ver como cliente" se vuelve al panel de admin, no al login
    // del portal: quien cierra esto es un administrador, no ese cliente. El
    // destino sale de la sesión (nunca de un parámetro), así que no hay forma
    // de convertir esto en un redirector abierto.
    if (session.impersonatedBy) {
      clearSessionCookie(context.cookies)
      return context.redirect('/admin/clients')
    }
  }
  clearSessionCookie(context.cookies)
  return context.redirect('/portal/login?m=session-closed')
}

// Un <a href="/api/portal/logout"> es lo natural en un menú, pero GET lo hace
// vulnerable a que cualquier <img> del sitio cierre la sesión del visitante. El
// menú usa un form POST; este GET solo existe para que un enlace pegado a mano
// no acabe en un 405 confuso.
export const GET: APIRoute = ({ redirect }) => redirect('/portal')
