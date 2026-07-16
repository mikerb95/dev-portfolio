import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { payments } from '../../../../../db/schema'
import { createPaymentIdempotent, wompiIntegritySignature } from '../../../../../lib/payments'
import { clientInvoice, isPayable } from '../../../../../lib/portal/invoices'
import { requireRole } from '../../../../../lib/portal/session'
import { audit } from '../../../../../lib/portal/audit'
import { clientIp } from '../../../../../lib/device-info'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * Inicia el pago de una factura del portal.
 *
 * Todo lo que importa aquí es que el monto NO viene del cliente: se lee de la
 * factura, que se lee filtrando por el clientId de la sesión. El navegador solo
 * dice "quiero pagar la factura 12"; cuánto cuesta lo decide el servidor.
 *
 * La clave de idempotencia se deriva de la factura (`invoice-<id>`), no se
 * genera al azar: así, el doble clic en "pagar" y el volver-atrás-y-reintentar
 * reutilizan el MISMO pago en vez de crear cobros paralelos por el mismo
 * concepto. Ese es justo el caso que createPaymentIdempotent ya sabe resolver.
 */
export const POST: APIRoute = async (context) => {
  // Pagar es cosa de `owner` y `billing`. Un `member` ve la factura, no la paga.
  const auth = await requireRole(context, ['owner', 'billing'])
  if (auth.response) return auth.response
  const { session } = auth

  const invoiceId = Number(context.params.id)
  if (!Number.isInteger(invoiceId)) return json(400, { error: 'Factura inválida.' })

  const result = await clientInvoice(session.client.id, invoiceId)
  // Ajena o inexistente: la misma respuesta para ambas.
  if (!result) return json(404, { error: 'Factura no encontrada.' })

  const { invoice } = result
  if (!isPayable(invoice.status)) {
    return json(409, { error: `Esta factura está ${invoice.status === 'paid' ? 'pagada' : 'anulada'} y no admite pago.` })
  }

  const wompiPublicKey = process.env.WOMPI_PUBLIC_KEY
  const wompiIntegrity = process.env.WOMPI_INTEGRITY_SECRET
  const provider: 'wompi' | 'mock' = wompiPublicKey && wompiIntegrity ? 'wompi' : 'mock'

  const { payment, conflict } = await createPaymentIdempotent({
    amountCents: invoice.totalCents,
    currency: invoice.currency,
    description: `Factura ${invoice.number}`,
    payerEmail: session.user.email,
    idempotencyKey: `invoice-${invoice.id}`,
    provider,
  })

  // La clave ya se usó con otro importe: pasa si edité la factura después de un
  // primer intento de pago. Cobrar el importe viejo sería peor que fallar.
  if (conflict) return json(409, { error: 'El importe de la factura cambió desde tu último intento. Recarga la página.' })

  // Vínculo pago → factura: es lo que permite al webhook saber qué saldar
  // cuando la pasarela confirme. Se escribe aquí, antes de mandar al cliente a
  // pagar, porque después ya no controlamos si vuelve.
  if (payment.invoiceId !== invoice.id) {
    await db.update(payments).set({ invoiceId: invoice.id }).where(eq(payments.id, payment.id))
  }

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'invoice.pay_started',
    entity: 'invoice',
    entityId: invoice.id,
    detail: `ref ${payment.reference}`,
    ip: clientIp(context.request.headers),
  })

  const redirectUrl = new URL(`/portal/facturas/${invoice.id}`, context.url.origin).toString()

  if (payment.provider === 'wompi' && wompiPublicKey && wompiIntegrity) {
    const params = new URLSearchParams({
      'public-key': wompiPublicKey,
      currency: payment.currency,
      'amount-in-cents': String(payment.amountCents),
      reference: payment.reference,
      'signature:integrity': wompiIntegritySignature(
        payment.reference,
        payment.amountCents,
        payment.currency,
        wompiIntegrity
      ),
      'redirect-url': redirectUrl,
      'customer-data:email': session.user.email,
    })
    return json(200, { redirect: `https://checkout.wompi.co/p/?${params}` })
  }

  // Sin pasarela configurada: al simulador, que ejerce el mismo webhook y la
  // misma máquina de estados. Es lo que permite ver el flujo entero en la demo.
  return json(200, { redirect: `/portal/facturas/${invoice.id}/simular?ref=${payment.reference}` })
}
