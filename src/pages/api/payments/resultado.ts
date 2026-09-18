import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { payments } from '../../../db/schema'
import { serverEnv } from '../../../lib/env'
import { isValidTxId, wompiApiBase, type PayResult } from '../../../lib/pay-result'
import { normalizeGatewayStatus } from '../../../lib/payments'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

// Estado de una transacción para la página /pay/gracias, a la que Wompi
// redirige con ?id=<transacción> tanto si se aprobó como si no.
//
// Solo lectura: se consulta a Wompi en vivo porque el webhook puede llegar
// después que la persona. Quien escribe el estado en payments sigue siendo
// únicamente el webhook firmado; esto nunca toca la fila.
//
// Solo responde por transacciones cuya referencia es nuestra: sin ese cruce el
// endpoint sería un consultor abierto de transacciones de cualquier comercio.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const UNKNOWN = { status: 'unknown' }

export const GET: APIRoute = async ({ request, url }) => {
  const { allowed } = await enforceLimit(`payresult:${clientIp(request)}`, { limit: 30, windowMs: 60_000 })
  if (!allowed) return json(429, UNKNOWN)

  const id = url.searchParams.get('id')
  if (!isValidTxId(id)) return json(400, UNKNOWN)

  const publicKey = serverEnv('WOMPI_PUBLIC_KEY')
  if (!publicKey) return json(503, UNKNOWN)

  // Fail-open hacia la página: cualquier fallo con Wompi termina en "unknown"
  // y la página se queda con el texto genérico, que es correcto en todo caso.
  let tx: Record<string, any> | undefined
  try {
    const res = await fetch(`${wompiApiBase(publicKey)}/transactions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${publicKey}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return json(res.status === 404 ? 404 : 502, UNKNOWN)
    tx = (await res.json())?.data
  } catch {
    return json(502, UNKNOWN)
  }

  const status = normalizeGatewayStatus(tx?.status)
  if (!tx?.reference || !status) return json(502, UNKNOWN)

  const [row] = await db
    .select({ reference: payments.reference, source: payments.source })
    .from(payments)
    .where(eq(payments.reference, String(tx.reference)))
    .limit(1)
  if (!row) return json(404, UNKNOWN)

  const amount = Number(tx.amount_in_cents)
  const body: PayResult = {
    status,
    amountCents: Number.isFinite(amount) ? amount : null,
    reference: row.reference,
    origin: row.source,
    method: typeof tx.payment_method_type === 'string' ? tx.payment_method_type : null,
  }
  return json(200, body)
}
