import type { APIRoute } from 'astro'
import { finishPrimaryAuthentication, signPasskeyProof } from '../../../../lib/webauthn'
import { isAllowedLogin } from '../../../../lib/auth'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'
import { clientIp } from '../../../../lib/device-info'
import { recordSecurityEvent } from '../../../../lib/security/events'

/**
 * Intento fallido de entrar con llave. Es la puerta alternativa al panel, así
 * que cada fallo queda en el micro-SIEM como sondeo de autenticación.
 */
function registrarFallo(request: Request, statusCode: number): Promise<void> {
  return recordSecurityEvent({
    ip: clientIp(request.headers),
    classification: { category: 'auth_probing', severity: 'medium', ruleId: 'passkey.login_failed' },
    method: 'POST',
    path: '/api/auth/webauthn/verify',
    userAgent: request.headers.get('user-agent'),
    statusCode,
  })
}

// Paso 2: verifica la respuesta de la llave y, si el login resultante está en
// la allowlist, devuelve un proof firmado de vida corta (30s) para que el
// cliente lo entregue de inmediato al provider 'passkey' de Auth.js (signIn)
// y así obtener una sesión real - sin pasar por GitHub.
export const POST: APIRoute = async ({ request, cookies }) => {
  const ip = clientIp(request.headers) ?? 'unknown'
  const { allowed } = await enforceLimit(`passkey-login-verify:${ip}`, { limit: 10, windowMs: 60_000 })
  if (!allowed) return new Response(JSON.stringify({ error: 'demasiados intentos' }), { status: 429 })

  const body = await request.json().catch(() => null)
  if (!body) return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 })

  const result = await finishPrimaryAuthentication(body, cookies, request.url)
  if (!result.ok) {
    await registrarFallo(request, 400)
    return new Response(JSON.stringify({ error: result.error }), { status: 400 })
  }
  if (!isAllowedLogin(result.login)) {
    await registrarFallo(request, 403)
    return new Response(JSON.stringify({ error: 'llave válida pero login no autorizado' }), { status: 403 })
  }

  const proof = signPasskeyProof(result.login)
  return new Response(JSON.stringify({ ok: true, proof }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
