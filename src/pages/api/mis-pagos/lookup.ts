import type { APIRoute } from 'astro'
import { historyForPhone } from '../../../lib/cobros-db'
import { maskAmount } from '../../../lib/cobros'
import { normalizePhone } from '../../../lib/phone'
import { STATUS_LABELS, type PaymentStatus } from '../../../lib/payments-state'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'
import { recordSecurityEvent } from '../../../lib/security/events'

// Consulta del histórico SOLO por número, sin el link firmado.
//
// Un teléfono no es una credencial: cualquiera conoce números ajenos. Por eso
// esta vista devuelve datos enmascarados (fecha, estado y los últimos 3 dígitos
// del monto) y nada más — lo justo para que el dueño se reconozca, inútil para
// un tercero que quiera perfilar a quién le cobro y cuánto.
//
// El límite de 5/hora por IP es la otra mitad: hace que enumerar teléfonos
// cueste más de lo que rinde.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request)
  const { allowed } = await enforceLimit(`mispagos:${ip}`, { limit: 5, windowMs: 3_600_000 })
  if (!allowed) {
    void recordSecurityEvent({
      classification: { category: 'enumeration', severity: 'medium', ruleId: 'mispagos.lookup_flood' },
      ip,
      method: 'POST',
      path: '/api/mis-pagos/lookup',
      query: null,
      userAgent: request.headers.get('user-agent'),
      country: request.headers.get('x-vercel-ip-country'),
      asn: request.headers.get('x-vercel-ip-as-number'),
      statusCode: 429,
      action: 'rate_limited',
    })
    return json(429, { error: 'demasiadas consultas. Pide tu link por WhatsApp para ver el historial completo.' })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : null)
  if (!phone) return json(400, { error: 'número inválido' })

  void recordSecurityEvent({
    classification: { category: 'cobro', severity: 'low', ruleId: 'mispagos.lookup' },
    ip,
    method: 'POST',
    path: '/api/mis-pagos/lookup',
    query: null,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode: 200,
    action: 'logged',
  })

  const pagos = await historyForPhone(phone, 5)

  // Respuesta idéntica en forma para un número con cobros y uno sin ellos: la
  // lista vacía no confirma ni desmiente que ese teléfono sea cliente mío.
  return json(200, {
    masked: true,
    pagos: pagos.map((p) => ({
      fecha: p.createdAt?.toISOString() ?? null,
      estado: STATUS_LABELS[p.status as PaymentStatus],
      monto: maskAmount(p.amountCents),
    })),
  })
}
