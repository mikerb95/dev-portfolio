import type { APIRoute } from 'astro'
import { buildPrimaryAuthenticationOptions } from '../../../../lib/webauthn'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'
import { clientIp } from '../../../../lib/device-info'

// Paso 1 del login passwordless: genera el challenge SIN requerir sesión
// previa (a diferencia del antiguo step-up). Público, así que va con su
// propio rate limit.
export const POST: APIRoute = async ({ request, cookies }) => {
  const ip = clientIp(request.headers) ?? 'unknown'
  const { allowed } = await enforceLimit(`passkey-login-opts:${ip}`, { limit: 20, windowMs: 60_000 })
  if (!allowed) return new Response(JSON.stringify({ error: 'demasiados intentos' }), { status: 429 })

  const options = await buildPrimaryAuthenticationOptions(cookies, request.url)
  return new Response(JSON.stringify(options), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
