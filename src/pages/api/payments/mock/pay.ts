import type { APIContext, APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getSession } from 'auth-astro/server'
import { db } from '../../../../db'
import { payments } from '../../../../db/schema'
import { applyGatewayEvent } from '../../../../lib/payments'
import { isAllowedLogin } from '../../../../lib/auth'
import { clientIp } from '../../../../lib/ratelimit'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'
import { getPortalSession } from '../../../../lib/portal/session'
import { settlePaymentByReference } from '../../../../lib/portal/settlement'
import { invoices } from '../../../../db/schema'

// "Pasarela" simulada para el modo demo (sin llaves Wompi configuradas).
// Emite la secuencia real de eventos (pending → approved/declined) por el
// MISMO camino que un webhook, así la máquina de estados se ejerce igual.
// Solo opera sobre pagos provider='mock': nunca toca pagos reales.
//
// Gating: para que un tercero no pueda fabricar pagos "aprobados" en el panel,
// simular requiere sesión admin, O el flag explícito PAYMENTS_MOCK_ENABLED=true
// (p. ej. durante la sustentación), O una sesión del portal pagando una factura
// SUYA — sin esa tercera vía, un cliente no podría completar el flujo de pago
// mientras la pasarela no esté configurada. La cuarta vía es el cobro de campo:
// quien presenta el código corto del link demuestra que lo recibió por WhatsApp,
// igual que el cliente del portal demuestra ser dueño de su factura.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async (context) => {
  const { request } = context
  const { allowed } = await enforceLimit(`mockpay:${clientIp(request)}`, { limit: 10, windowMs: 60_000 })
  if (!allowed) {
    return json(429, { error: 'demasiados intentos, espera un minuto' })
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

  if (process.env.PAYMENTS_MOCK_ENABLED !== 'true') {
    const session = await getSession(request)
    const login = (session?.user as { login?: string } | undefined)?.login
    const isAdmin = !!session && (!login || isAllowedLogin(login))

    if (!isAdmin && !(await ownsInvoiceOfPayment(context, payment.invoiceId))) {
      return json(403, { error: 'simulación deshabilitada (requiere sesión admin o PAYMENTS_MOCK_ENABLED=true)' })
    }
  }

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

  // Mismo cierre que el webhook real: si el pago salda una factura del portal,
  // marcarla y avisar. Se pasa por aquí y no dentro de applyGatewayEvent para
  // que la pasarela siga sin saber que las facturas existen.
  if (final.applied && final.statusAfter === 'approved') await settlePaymentByReference(reference)

  return json(200, { ok: true, status: final.statusAfter, steps: [pending, final] })
}

/**
 * ¿La sesión del portal (si la hay) es dueña de la factura que este pago salda?
 *
 * Es la condición que deja a un cliente completar su propio pago simulado sin
 * abrir la simulación a cualquiera: sin factura detrás, o con una factura de
 * otro cliente, la respuesta es no.
 */
async function ownsInvoiceOfPayment(context: APIContext, invoiceId: number | null): Promise<boolean> {
  if (invoiceId == null) return false
  const portal = await getPortalSession(context)
  if (!portal) return false

  const [invoice] = await db
    .select({ clientId: invoices.clientId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  return invoice?.clientId === portal.client.id
}
