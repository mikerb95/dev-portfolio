import type { APIRoute } from 'astro'
import {
  applyGatewayEvent,
  normalizeGatewayStatus,
  verifyWompiEventSignature,
} from '../../../lib/payments'

// Receptor de eventos de Wompi (transaction.updated). Verifica el checksum
// firmado con WOMPI_EVENTS_SECRET antes de tocar nada.
//
// Diseño de resiliencia: SIEMPRE respondemos 200 a eventos válidos aunque no
// apliquen (duplicados, fuera de orden, referencia ajena) — la pasarela solo
// necesita saber que lo recibimos; los flags quedan en payment_events.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.WOMPI_EVENTS_SECRET
  if (!secret) return json(503, { error: 'webhook no configurado (WOMPI_EVENTS_SECRET)' })

  let event: Record<string, any>
  try {
    event = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  if (!verifyWompiEventSignature(event, secret)) {
    return json(403, { error: 'firma inválida' })
  }

  // Anti-replay: eventos firmados hace demasiado tiempo no se procesan.
  // Ventana generosa (6h) para tolerar reintentos legítimos de la pasarela
  // tras una caída nuestra; la dedup + máquina de estados cubren el resto.
  const MAX_AGE_S = 6 * 60 * 60
  const ts = Number(event.timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_AGE_S) {
    return json(200, { ok: true, ignored: 'timestamp fuera de la ventana aceptada' })
  }

  const tx = event?.data?.transaction
  const status = normalizeGatewayStatus(tx?.status)
  if (!tx?.reference || !status) return json(200, { ok: true, ignored: 'evento sin transacción o estado no mapeable' })

  const result = await applyGatewayEvent({
    provider: 'wompi',
    type: String(event.event ?? 'transaction.updated'),
    reference: String(tx.reference),
    gatewayTxId: tx.id ? String(tx.id) : null,
    status,
    // Verificación de valor: si el monto/moneda del evento no coincide con el
    // pago, applyGatewayEvent NO aplica la transición y dispara la alerta.
    amountCents: Number.isFinite(Number(tx.amount_in_cents)) ? Number(tx.amount_in_cents) : null,
    currency: typeof tx.currency === 'string' ? tx.currency : null,
    payload: { event: event.event, transaction: { id: tx.id, status: tx.status, amount_in_cents: tx.amount_in_cents } },
  })

  // Referencia desconocida: 200 igualmente (puede ser de otro entorno/proyecto).
  return json(200, { ok: true, ...result })
}
