import type { APIRoute } from 'astro'
import { attemptLogin, loginErrorMessage } from '../../../lib/portal/login'
import { createSession, setSessionCookie } from '../../../lib/portal/session'
import { audit } from '../../../lib/portal/audit'
import { clientIp } from '../../../lib/device-info'
import { recordSecurityEvent } from '../../../lib/security/events'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Solo se acepta un destino interno del portal. Sin esto, `next` sería un
 * redirector abierto: un enlace a nuestro propio dominio que aterriza en el
 * sitio del atacante, con la credibilidad de haber pasado por el login real.
 */
const safeNext = (raw: unknown): string =>
  typeof raw === 'string' && /^\/portal(\/|$)/.test(raw) && !raw.startsWith('//') ? raw : '/portal'

export const POST: APIRoute = async ({ request, cookies }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const email = typeof data.email === 'string' ? data.email : ''
  const password = typeof data.password === 'string' ? data.password : ''
  if (!email || !password) return json(400, { error: 'Escribe tu correo y tu contraseña.' })

  const ip = clientIp(request.headers)
  const outcome = await attemptLogin({ email, password })

  if (!outcome.ok) {
    // Al micro-SIEM: los intentos fallidos contra el portal son señal de ataque
    // igual que los del admin, y así aparecen en /admin/security con el resto.
    recordSecurityEvent({
      classification: {
        category: 'auth_probing',
        severity: outcome.reason === 'locked' ? 'high' : 'medium',
        ruleId: `portal.login.${outcome.reason}`,
      },
      ip,
      method: 'POST',
      path: '/api/portal/login',
      userAgent: request.headers.get('user-agent'),
      statusCode: 401,
      action: outcome.reason === 'locked' ? 'rate_limited' : 'logged',
    })
    return json(outcome.reason === 'locked' ? 429 : 401, { error: loginErrorMessage(outcome) })
  }

  const token = await createSession({
    clientUserId: outcome.userId,
    ip,
    userAgent: request.headers.get('user-agent'),
  })
  setSessionCookie(cookies, token)

  audit({ clientId: outcome.clientId, clientUserId: outcome.userId, action: 'login', ip })

  return json(200, { ok: true, redirect: safeNext(data.next) })
}
