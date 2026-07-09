import type { APIRoute } from 'astro'
import {
  createPaymentIdempotent,
  isValidIdempotencyKey,
  wompiIntegritySignature,
} from '../../../lib/payments'
import { clientIp } from '../../../lib/ratelimit'
import { enforceLimit } from '../../../lib/security/ratelimit-durable'

// Crea una intención de pago (donación/pago dev). Público: es el checkout.
// La clave de idempotencia la genera el cliente (UUID) y es obligatoria:
// reintentos y dobles clics devuelven el MISMO pago (HTTP 200 en vez de 201).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const MIN_CENTS = 1_000_00 // $1.000 COP
const MAX_CENTS = 5_000_000_00 // $5.000.000 COP

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const POST: APIRoute = async ({ request, url }) => {
  if (!rateLimit(`checkout:${clientIp(request)}`, 10, 60_000)) {
    return json(429, { error: 'demasiados intentos, espera un minuto' })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const amountCents = Number(body.amountCents)
  if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return json(400, { error: `amountCents debe ser un entero entre ${MIN_CENTS} y ${MAX_CENTS} (centavos de COP)` })
  }
  if (!isValidIdempotencyKey(body.idempotencyKey)) {
    return json(400, { error: 'idempotencyKey requerida (8-128 chars: letras, números, ._-)' })
  }
  const email =
    typeof body.payerEmail === 'string' && EMAIL_RE.test(body.payerEmail) && body.payerEmail.length <= 200
      ? body.payerEmail
      : null
  const description = typeof body.description === 'string'
    ? body.description.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 300)
    : null

  const wompiPublicKey = process.env.WOMPI_PUBLIC_KEY
  const wompiIntegrity = process.env.WOMPI_INTEGRITY_SECRET
  const provider: 'wompi' | 'mock' = wompiPublicKey && wompiIntegrity ? 'wompi' : 'mock'

  const { payment, replayed, conflict } = await createPaymentIdempotent({
    amountCents,
    currency: 'COP',
    description,
    payerEmail: email,
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
