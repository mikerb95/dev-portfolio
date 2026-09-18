import type { APIRoute } from 'astro'
import {
  createPaymentIdempotent,
  isValidIdempotencyKey,
  wompiIntegritySignature,
} from '../../../lib/payments'
import { clientIp } from '../../../lib/ratelimit'
import { PAY_MAX_COP, PAY_MIN_COP, formatCop, parsePayForm } from '../../../lib/pay-form'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

// Crea una intención de pago de /pay (servicio o apoyo). Público: es el checkout.
// La clave de idempotencia la genera el cliente (UUID) y es obligatoria:
// reintentos y dobles clics devuelven el MISMO pago (HTTP 200 en vez de 201).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const MIN_CENTS = PAY_MIN_COP * 100
const MAX_CENTS = PAY_MAX_COP * 100

export const POST: APIRoute = async ({ request, url }) => {
  const { allowed } = await enforceLimit(`checkout:${clientIp(request)}`, { limit: 10, windowMs: 60_000 })
  if (!allowed) {
    return json(429, { error: 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.' })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const amountCents = Number(body.amountCents)
  if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return json(400, { error: `El monto debe estar entre $${formatCop(PAY_MIN_COP)} y $${formatCop(PAY_MAX_COP)}.` })
  }
  if (!isValidIdempotencyKey(body.idempotencyKey)) {
    return json(400, { error: 'idempotencyKey requerida (8-128 chars: letras, números, ._-)' })
  }
  const form = parsePayForm(body)
  if (!form.ok) return json(400, { error: form.error })

  const wompiPublicKey = process.env.WOMPI_PUBLIC_KEY
  const wompiIntegrity = process.env.WOMPI_INTEGRITY_SECRET
  const provider: 'wompi' | 'mock' = wompiPublicKey && wompiIntegrity ? 'wompi' : 'mock'

  const { payment, replayed, conflict } = await createPaymentIdempotent({
    amountCents,
    currency: 'COP',
    description: form.data.description,
    payerEmail: form.data.email,
    payerName: form.data.name,
    payerMessage: form.data.message,
    idempotencyKey: body.idempotencyKey,
    provider,
  })

  // Misma clave con otro monto/moneda: conflicto explícito, jamás un cobro
  // silencioso por el valor de un intento anterior.
  if (conflict) return json(409, { error: conflict, reference: payment.reference })

  // El monto autoritativo es SIEMPRE el de la fila (en un replay puede diferir
  // del body: nunca dejamos que un retry cambie el monto de un pago existente).
  const checkout =
    payment.provider === 'wompi' && wompiPublicKey && wompiIntegrity
      ? {
          provider: 'wompi' as const,
          url: 'https://checkout.wompi.co/p/',
          params: {
            'public-key': wompiPublicKey,
            currency: payment.currency,
            'amount-in-cents': String(payment.amountCents),
            reference: payment.reference,
            'signature:integrity': wompiIntegritySignature(
              payment.reference,
              payment.amountCents,
              payment.currency,
              wompiIntegrity,
            ),
            'redirect-url': new URL('/pay/gracias', url.origin).toString(),
            // Prellena el checkout de Wompi: la persona ya escribió estos datos.
            // No entran en la firma de integridad (solo referencia, monto y moneda).
            'customer-data:email': form.data.email,
            'customer-data:full-name': form.data.name,
          },
        }
      : { provider: 'mock' as const, confirmUrl: '/api/payments/mock/pay' }

  return json(replayed ? 200 : 201, {
    replayed,
    payment: {
      reference: payment.reference,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      provider: payment.provider,
    },
    checkout,
  })
}
