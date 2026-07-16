import type { APIRoute } from 'astro'
import { isValidShortCode, isExpired } from '../../../../lib/cobros'
import { findByShortCode } from '../../../../lib/cobros-db'
import { wompiIntegritySignature, isTerminal, type PaymentStatus } from '../../../../lib/payments'
import { clientIp } from '../../../../lib/ratelimit'
import { enforceLimit } from '../../../../lib/security/ratelimit-durable'

// Genera los parámetros firmados del checkout para un cobro existente.
//
// Clave del diseño: el monto NO viaja nunca desde el cliente. Se lee de la fila
// y se firma aquí, en el servidor, en el momento del clic. El link de WhatsApp
// solo lleva un código; aunque alguien lo manipule, no hay monto que tocar.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const POST: APIRoute = async ({ params, request, url }) => {
  const { allowed } = await enforceLimit(`c-checkout:${clientIp(request)}`, { limit: 10, windowMs: 60_000 })
  if (!allowed) return json(429, { error: 'demasiados intentos, espera un minuto' })

  const code = params.code
  if (!isValidShortCode(code)) return json(404, { error: 'cobro no encontrado' })

  const payment = await findByShortCode(code)
  if (!payment) return json(404, { error: 'cobro no encontrado' })

  if (isTerminal(payment.status as PaymentStatus)) {
    return json(409, {
      error:
        payment.status === 'approved'
          ? 'este cobro ya fue pagado'
          : 'este cobro ya no está disponible',
      status: payment.status,
    })
  }
  if (isExpired(payment)) {
    return json(410, { error: 'este link venció, pide uno nuevo', status: 'expired' })
  }

  const wompiPublicKey = process.env.WOMPI_PUBLIC_KEY
  const wompiIntegrity = process.env.WOMPI_INTEGRITY_SECRET

  if (payment.provider === 'wompi' && wompiPublicKey && wompiIntegrity) {
    return json(200, {
      provider: 'wompi',
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
        // Prellena el teléfono en el checkout: un dato menos que teclear en la calle.
        'customer-data:phone-number': payment.payerPhone ?? '',
      },
    })
  }

  // Sin llaves configuradas: mismo camino de webhooks que la pasarela real.
  return json(200, { provider: 'mock', confirmUrl: '/api/payments/mock/pay', reference: payment.reference })
}
