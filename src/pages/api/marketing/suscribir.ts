import type { APIRoute } from 'astro'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'
import { recordSecurityEvent } from '../../../lib/security/events'
import { normalizarEmail } from '../../../lib/marketing/reglas'
import { TEXTO_CONSENTIMIENTO, TEXTO_CONSENTIMIENTO_EN } from '../../../lib/marketing/contenido'
import { suscribirPublico } from '../../../lib/marketing/db'

// Alta pública a las novedades (doble opt-in). La respuesta es siempre la
// misma, esté o no el correo en la lista: si no, este endpoint serviría para
// averiguar quién está suscrito.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request)
  const { allowed } = await enforceLimit(`novedades:${ip}`, { limit: 5, windowMs: 10 * 60_000 })
  if (!allowed) return json(429, { error: 'Demasiados intentos, prueba en unos minutos.' })

  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }
  const email = normalizarEmail(data.email)
  if (!email) return json(400, { error: 'Correo inválido' })
  // Casilla obligatoria: sin el sí explícito no hay consentimiento que guardar.
  if (data.acepto !== true) return json(400, { error: 'Falta aceptar el envío de novedades' })
  const origen = data.origen === 'contacto' ? 'contacto' : 'formulario'
  const texto = data.locale === 'en' ? TEXTO_CONSENTIMIENTO_EN : TEXTO_CONSENTIMIENTO

  try {
    const r = await suscribirPublico({ email, nombre: typeof data.nombre === 'string' ? data.nombre : null, origen, texto })
    void recordSecurityEvent({
      ip,
      classification: { category: 'marketing', severity: 'low', ruleId: r.enviado ? 'marketing.suscripcion_pedida' : `marketing.suscripcion_${r.motivo}` },
      method: 'POST',
      path: '/api/marketing/suscribir',
      userAgent: request.headers.get('user-agent'),
      statusCode: 200,
    })
  } catch (e) {
    console.error('[marketing/suscribir]', e)
    return json(500, { error: 'No se pudo registrar, intenta más tarde.' })
  }
  return json(200, { ok: true })
}
