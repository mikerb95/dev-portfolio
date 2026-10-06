import type { APIRoute } from 'astro'
import { darDeBaja } from '../../../lib/marketing/db'
import { secretoMarketing, verificarTokenBaja } from '../../../lib/marketing/tokens'
import { recordSecurityEvent } from '../../../lib/security/events'
import { clientIp } from '../../../lib/ratelimit'

// Baja de las novedades. Dos llamadores:
//  · El botón de /novedades/baja (formulario), que vuelve a la página.
//  · Gmail/Yahoo con "baja con un clic" (RFC 8058): POST con el cuerpo
//    `List-Unsubscribe=One-Click` a la URL de la cabecera. Espera un 200.
// Solo POST: un GET haría que el escáner de enlaces del correo diera de baja
// a la gente sin que lo pidiera.

export const POST: APIRoute = async ({ request, url, redirect }) => {
  const secreto = secretoMarketing()
  const id = Number(url.searchParams.get('s'))
  const token = url.searchParams.get('t')
  const campana = Number(url.searchParams.get('c')) || null
  const desdePagina = url.searchParams.get('desde') === 'pagina'

  if (!secreto || !verificarTokenBaja(id, token, secreto)) {
    return desdePagina ? redirect('/novedades/baja?estado=invalido', 303) : new Response('enlace inválido', { status: 400 })
  }
  try {
    const cambio = await darDeBaja(id, campana)
    if (cambio) {
      void recordSecurityEvent({
        ip: clientIp(request),
        classification: { category: 'marketing', severity: 'low', ruleId: desdePagina ? 'marketing.baja' : 'marketing.baja_un_clic' },
        method: 'POST',
        path: '/api/marketing/baja',
        userAgent: request.headers.get('user-agent'),
        statusCode: 200,
      })
    }
  } catch (e) {
    console.error('[marketing/baja]', e)
    return desdePagina ? redirect('/novedades/baja?estado=error', 303) : new Response('error', { status: 500 })
  }
  return desdePagina ? redirect('/novedades/baja?estado=hecho', 303) : new Response('ok', { status: 200 })
}
