import type { APIRoute } from 'astro'
import { requirePortalSession } from '../../../lib/portal/session'
import { portalLiveDigest } from '../../../lib/portal/live'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

// Digest de la capa viva del portal. Lo sondea el ciclo de PortalLayout cada
// 20 s; todo lo demás del portal sigue siendo SSR.
//
// No está en PUBLIC_EXACT (lib/portal/paths.ts), así que nace protegido por el
// gate del middleware. Aun así resuelve la sesión por su cuenta: la doctrina del
// repo es que un endpoint no confía en que alguien de más arriba ya validó.

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // Datos de un cliente concreto: jamás en caché compartida ni de navegador.
  'Cache-Control': 'no-store',
}

export const GET: APIRoute = async (context) => {
  const auth = await requirePortalSession(context)
  if (auth.response) return auth.response
  const { user, client } = auth.session

  // Techo propio: una ruta diseñada para 3 llamadas/min por pestaña necesita
  // límite explícito, porque el paraguas global (600/min por IP) la dejaría
  // martillear. La clave es la SESIÓN, no la IP: varias personas del mismo
  // cliente detrás de una NAT corporativa no deben gastarse el cupo entre
  // ellas. 10/min deja margen para 2-3 pestañas abiertas del mismo usuario.
  const rate = await enforceLimit(`portal-live:${auth.session.sessionId}`, {
    limit: 10,
    windowMs: 60_000,
    deferUntil: 0.5,
  })
  if (!rate.allowed) {
    // 429 con Retry-After: el cliente JS lo traduce a backoff, no a error
    // visible. No se registra en el micro-SIEM — pasarse de cupo aquí es una
    // pestaña entusiasta, no un ataque, y ensuciaría la señal de seguridad.
    return new Response(JSON.stringify({ error: 'demasiadas solicitudes' }), {
      status: 429,
      headers: { ...JSON_HEADERS, 'Retry-After': '60' },
    })
  }

  const requested = Number(context.url.searchParams.get('p'))

  try {
    const digest = await portalLiveDigest({
      clientId: client.id,
      userId: user.id,
      role: user.role,
      requestedProjectId: Number.isInteger(requested) && requested > 0 ? requested : null,
    })
    return new Response(JSON.stringify(digest), { status: 200, headers: JSON_HEADERS })
  } catch (err) {
    // Fail-open del lado del servidor: un digest que falla no puede convertirse
    // en un error visible en el portal. El cliente ya trata cualquier no-200
    // como "reintenta con backoff" y se queda con los datos del SSR.
    console.error('[portal/live]', err)
    return new Response(JSON.stringify({ error: 'digest no disponible' }), {
      status: 503,
      headers: JSON_HEADERS,
    })
  }
}
