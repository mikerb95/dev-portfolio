import type { APIRoute } from 'astro'
import { generateCuentaCobroPdf } from '../../../../../lib/cuenta-cobro-pdf'
import {
  cuentaCobro,
  loadEmisorYConfig,
  parseRetenciones,
  parseSnapshot,
} from '../../../../../lib/cuentas-cobro-db'
import { parseDeudor, type Deudor, type Emisor } from '../../../../../lib/cuentas-cobro'

// Descarga del PDF de una cuenta de cobro. Bajo sesión de admin (matcher
// isAdmin del middleware) y vetada en modo demo por patrón en lib/demo.ts: es
// un GET que imprime cédula, dirección y número de cuenta bancaria, así que
// "la demo es solo lectura" por sí solo NO lo detendría.

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return new Response('id inválido', { status: 400 })

  const detalle = await cuentaCobro(id)
  if (!detalle) return new Response('no encontrada', { status: 404 })

  const { cuenta } = detalle

  // Emitida: se imprime EXACTAMENTE lo que se congeló al emitir. Borrador: se
  // usan los datos vivos, porque es una previsualización de lo que se emitiría.
  // Esta bifurcación es la que hace que reimprimir un documento de hace ocho
  // meses no lo actualice con la cuenta bancaria de hoy.
  const emisorSnap = parseSnapshot<Emisor>(cuenta.issuerSnapshot)
  const deudorSnap = parseSnapshot<Deudor>(cuenta.payerSnapshot)

  let emisor = emisorSnap
  let deudor = deudorSnap
  if (!emisor || !deudor) {
    const { emisor: vivo } = await loadEmisorYConfig()
    emisor = emisor ?? vivo
    deudor = deudor ?? parseDeudor(detalle.clientName, detalle.billingInfo)
  }

  const bytes = await generateCuentaCobroPdf({
    number: cuenta.number,
    city: cuenta.city,
    // Un borrador todavía no tiene fecha de emisión; se previsualiza con hoy,
    // que es la fecha que llevaría si se emitiera ahora.
    issuedAt: cuenta.issuedAt ?? new Date(),
    dueAt: cuenta.dueAt,
    concept: cuenta.concept,
    contractRef: cuenta.contractRef,
    periodStart: cuenta.periodStart,
    periodEnd: cuenta.periodEnd,
    subtotalCents: cuenta.subtotalCents,
    totalCents: cuenta.totalCents,
    retentionsCents: cuenta.retentionsCents,
    netCents: cuenta.netCents,
    notes: cuenta.notes,
    ssPlanilla: cuenta.ssPlanilla,
    ssPeriodo: cuenta.ssPeriodo,
    emisor,
    deudor,
    retentions: parseRetenciones(cuenta.retentions),
    items: detalle.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitCents: i.unitCents,
      totalCents: i.totalCents,
    })),
  })

  const nombre = cuenta.status === 'draft' ? `${cuenta.number}-BORRADOR.pdf` : `${cuenta.number}.pdf`

  // Buffer.from y no el Uint8Array crudo: el tipo que devuelve pdf-lib no
  // coincide exactamente con el BodyInit que espera Response en este target de
  // TS, aunque en runtime ambos son el mismo ArrayBuffer. Mismo apaño que en
  // el PDF de facturas del portal.
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombre}"`,
      // Datos personales y bancarios: fuera de la CDN y del caché del navegador.
      'Cache-Control': 'no-store',
    },
  })
}
