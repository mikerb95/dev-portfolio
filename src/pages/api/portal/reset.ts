import type { APIRoute } from 'astro'
import { startPasswordReset } from '../../../lib/portal/invitations'
import { clientIp } from '../../../lib/device-info'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Arranca un restablecimiento de contraseña.
 *
 * Responde SIEMPRE 200 con el mismo cuerpo: exista la cuenta, no exista, o esté
 * deshabilitada. Cualquier diferencia (código, texto, incluso latencia notable)
 * convertiría esto en un oráculo para enumerar clientes.
 *
 * El límite por correo es aparte del límite por IP del middleware: sin él, un
 * atacante con IPs rotativas podría inundar el buzón de un cliente concreto de
 * enlaces de restablecimiento — molesto para él y perfecto para colar un
 * phishing entre correos legítimos.
 */
export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'Petición inválida.' })
  }

  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const ok = json(200, { ok: true })
  if (!email) return ok

  const perEmail = await enforceLimit(`portal-reset:${email}`, { limit: 3, windowMs: 60 * 60_000 })
  const perIp = await enforceLimit(`portal-reset-ip:${clientIp(request.headers)}`, { limit: 10, windowMs: 60 * 60_000 })
  // Silencioso a propósito: al que abusa se le responde lo mismo que al resto.
  if (!perEmail.allowed || !perIp.allowed) return ok

  await startPasswordReset({ email }).catch(() => {})
  return ok
}
