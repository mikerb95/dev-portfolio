import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getSession } from 'auth-astro/server'
import { db } from '../../../../db'
import { payments } from '../../../../db/schema'
import { applyGatewayEvent } from '../../../../lib/payments'
import { isAllowedLogin } from '../../../../lib/auth'
import { clientIp } from '../../../../lib/ratelimit'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'

// "Pasarela" simulada para el modo demo (sin llaves Wompi configuradas).
// Emite la secuencia real de eventos (pending → approved/declined) por el
// MISMO camino que un webhook, así la máquina de estados se ejerce igual.
// Solo opera sobre pagos provider='mock': nunca toca pagos reales.
//
// Gating: para que un tercero no pueda fabricar pagos "aprobados" en el panel,
// simular requiere sesión admin O el flag explícito PAYMENTS_MOCK_ENABLED=true
// (p. ej. durante la sustentación).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const { allowed } = await enforceLimit(`mockpay:${clientIp(request)}`, { limit: 10, windowMs: 60_000 })
  if (!allowed) {
    return json(429, { error: 'demasiados intentos, espera un minuto' })
  }

  if (process.env.PAYMENTS_MOCK_ENABLED !== 'true') {
    const session = await getSession(request)
    const login = (session?.user as { login?: string } | undefined)?.login
    if (!session || (login && !isAllowedLogin(login))) {
      return json(403, { error: 'simulación deshabilitada (requiere sesión admin o PAYMENTS_MOCK_ENABLED=true)' })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const reference = typeof body.reference === 'string' ? body.reference : null
  if (!reference) return json(400, { error: 'reference requerida' })

  const [payment] = await db.select().from(payments).where(eq(payments.reference, reference))
  if (!payment) return json(404, { error: 'pago no encontrado' })
  if (payment.provider !== 'mock') return json(403, { error: 'solo pagos mock pueden simularse' })

  const outcome = body.outcome === 'declined' ? 'declined' : 'approved'
  const txId = `mock_tx_${randomBytes(6).toString('hex')}`

  const pending = await applyGatewayEvent({
    provider: 'mock',
    type: 'transaction.updated',
    reference,
    gatewayTxId: txId,
    status: 'pending',
    payload: { simulated: true },
  })
  const final = await applyGatewayEvent({
    provider: 'mock',
    type: 'transaction.updated',
    reference,
    gatewayTxId: txId,
    status: outcome,
    payload: { simulated: true },
  })

  return json(200, { ok: true, status: final.statusAfter, steps: [pending, final] })
}
