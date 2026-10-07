import type { APIRoute } from 'astro'
import { darDeBaja } from '../../../lib/marketing/db'
import { secretoMarketing, verificarTokenBaja } from '../../../lib/marketing/tokens'
import { recordSecurityEvent } from '../../../lib/security/events'
import { clientIp } from '../../../lib/ratelimit'

// Baja de las novedades: el botón de /novedades/baja. Solo POST: un GET haría
// que el escáner de enlaces del correo diera de baja a la gente sin que lo
// pidiera. (Por qué no hay "baja con un clic" de Gmail: ver lib/marketing/envio.ts.)

export const POST: APIRoute = async ({ request, url, redirect }) => {
  const secreto = secretoMarketing()
  const id = Number(url.searchParams.get('s'))
  const token = url.searchParams.get('t')
  const campana = Number(url.searchParams.get('c')) || null

  if (!secreto || !verificarTokenBaja(id, token, secreto)) return redirect('/novedades/baja?estado=invalido', 303)
  try {
    if (await darDeBaja(id, campana)) {
      void recordSecurityEvent({
        ip: clientIp(request),
        classification: { category: 'marketing', severity: 'low', ruleId: 'marketing.baja' },
        method: 'POST',
        path: '/api/marketing/baja',
        userAgent: request.headers.get('user-agent'),
        statusCode: 303,
      })
    }
  } catch (e) {
    console.error('[marketing/baja]', e)
    return redirect('/novedades/baja?estado=error', 303)
  }
  return redirect('/novedades/baja?estado=hecho', 303)
}
