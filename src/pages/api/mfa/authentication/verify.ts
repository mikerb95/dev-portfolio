import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../../lib/auth'
import { clientIp, resolveDeviceSessionId } from '../../../../lib/device-info'
import { finishAuthentication, issueMfaCookie } from '../../../../lib/webauthn'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'

// Paso 2 del step-up: verifica la respuesta de la llave y, si es válida, emite
// la cookie de MFA atada al sid de esta sesión. A partir de aquí el middleware
// deja pasar a /admin sin volver a pedir la llave hasta que expire (12h).
export const POST: APIRoute = async ({ request, cookies }) => {
  const ip = clientIp(request.headers)
  // Límite extra y estricto sobre el ya existente para /api/mfa/ en el
  // middleware: cada intento fallido aquí es, por definición, sospechoso
  // (requiere ya haber pasado por GitHub OAuth).
  const { allowed } = await enforceLimit(`mfa-verify:${ip}`, { limit: 8, windowMs: 60_000 })
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'demasiados intentos, espera un minuto' }), { status: 429 })
  }

  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || !isAllowedLogin(login)) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 })

  const result = await finishAuthentication(login!, body, cookies, request.url)
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), { status: 400 })
  }

  const sid = (session as { sid?: string } | undefined)?.sid
  const sessionId = resolveDeviceSessionId(sid, cookies)
  issueMfaCookie(cookies, sessionId)
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
