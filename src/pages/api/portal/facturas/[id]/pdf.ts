import type { APIRoute } from 'astro'
import { clientInvoice } from '../../../../../lib/portal/invoices'
import { generateInvoicePdf } from '../../../../../lib/portal/invoice-pdf'
import { requirePortalSession } from '../../../../../lib/portal/session'
import { audit } from '../../../../../lib/portal/audit'
import { clientIp } from '../../../../../lib/device-info'

/**
 * PDF de una factura, generado al vuelo (sin caché en Blob).
 *
 * pdf-lib tarda unos milisegundos en dibujar una página de texto: cachear en
 * Blob añadiría una capa (¿cuándo invalidar? ¿qué pasa si edito las notas de
 * una factura ya emitida?) para ahorrar algo que ya es barato. Se genera desde
 * el estado actual de la fila cada vez, así nunca puede quedar desactualizado.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requirePortalSession(context)
  if (auth.response) return auth.response
  const { session } = auth

  const id = Number(context.params.id)
  if (!Number.isInteger(id)) return new Response('No encontrado', { status: 404 })

  const result = await clientInvoice(session.client.id, id)
  if (!result) return new Response('No encontrado', { status: 404 })

  const bytes = await generateInvoicePdf(result)

  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'document.download',
    entity: 'invoice_pdf',
    entityId: id,
    detail: result.invoice.number,
    ip: clientIp(context.request.headers),
  })

  // Buffer.from y no el Uint8Array crudo: el tipo que devuelve pdf-lib no
  // coincide exactamente con el BodyInit que espera Response en este target
  // de TS, aunque en runtime ambos son el mismo ArrayBuffer.
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.invoice.number}.pdf"`,
      'Cache-Control': 'no-store, private',
    },
  })
}
