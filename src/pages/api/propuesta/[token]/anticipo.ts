import type { APIRoute } from 'astro'
import { anticipo } from '../../../../lib/plano/aceptacion'
import { json, propuestaPublica, rastro } from '../../../../lib/plano/endpoint'
import { serverEnv } from '../../../../lib/env'
import { wompiIntegritySignature, isTerminal, type PaymentStatus } from '../../../../lib/payments'

// Parámetros firmados del checkout del anticipo. Mismo diseño que
// /api/c/[code]/checkout: el monto NO viaja desde el cliente, se lee de la
// versión aceptada y se firma aquí en el momento del clic.

export const POST: APIRoute = async ({ params, request, url }) => {
  const p = await propuestaPublica(params.token)
  if (!p) return json(404, { error: 'propuesta no encontrada' })
  const a = await anticipo(p)
  if ('error' in a) return json(a.status, { error: a.error })
  const { payment } = a
  if (isTerminal(payment.status as PaymentStatus)) {
    return json(409, { error: payment.status === 'approved' ? 'El anticipo ya está pagado.' : 'Este pago ya no está disponible. Escríbele a Mike.', status: payment.status })
  }
  rastro(request, 'propuesta.anticipo_checkout', 200)

  const publica = serverEnv('WOMPI_PUBLIC_KEY')
  const integridad = serverEnv('WOMPI_INTEGRITY_SECRET')
  if (payment.provider === 'wompi' && publica && integridad) {
    return json(200, {
      provider: 'wompi',
      url: 'https://checkout.wompi.co/p/',
      params: {
        'public-key': publica,
        currency: payment.currency,
        'amount-in-cents': String(payment.amountCents),
        reference: payment.reference,
        'signature:integrity': wompiIntegritySignature(payment.reference, payment.amountCents, payment.currency, integridad),
        'redirect-url': new URL(`/propuesta/${p.token}`, url.origin).toString(),
      },
    })
  }
  // Sin llaves de Wompi: la pasarela simulada recorre el mismo camino de webhooks.
  return json(200, { provider: 'mock', confirmUrl: '/api/payments/mock/pay', reference: payment.reference })
}
