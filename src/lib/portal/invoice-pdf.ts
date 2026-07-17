// Generación del PDF de una factura.
//
// pdf-lib en vez de renderizar HTML→PDF (no hay Chromium disponible en la
// función serverless sin @sparticuz/chromium, un paquete pesado para algo tan
// simple como una factura de una página). pdf-lib dibuja directamente con
// coordenadas: más manual, cero dependencias nativas, arranca en milisegundos.
//
// El PDF se genera UNA vez por factura y se guarda en Blob (ver
// src/pages/api/portal/facturas/[id]/pdf.ts); esta función es pura y no toca
// red ni base de datos, así que es fácil de probar.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { clientInvoice } from './invoices'
import { formatMoney, formatDate } from './format'

const INK = rgb(0.08, 0.08, 0.1)
const MUTED = rgb(0.45, 0.45, 0.48)
const CYAN = rgb(0, 0.55, 0.6) // versión oscurecida del acento: en blanco sobre
// fondo blanco, el cian de neón del sitio (#00f2ff) casi no tiene contraste.

// Reutiliza EXACTAMENTE la forma que devuelve clientInvoice(): así, si esa
// consulta cambia qué columnas selecciona, este archivo no se desincroniza en
// silencio con un `as` que oculte el desajuste.
export type InvoicePdfInput = NonNullable<Awaited<ReturnType<typeof clientInvoice>>>

/** Genera el PDF y devuelve sus bytes. No escribe nada: eso lo hace el llamador. */
export async function generateInvoicePdf({ invoice, items }: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 en puntos
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)

  const { width, height } = page.getSize()
  const marginX = 50
  let y = height - 60

  const text = (
    s: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}
  ) => page.drawText(s, { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? INK })

  const line = (yPos: number) =>
    page.drawLine({ start: { x: marginX, y: yPos }, end: { x: width - marginX, y: yPos }, thickness: 0.5, color: rgb(0.85, 0.85, 0.87) })

  // Cabecera
  text('CodeByMike', marginX, y, { size: 18, f: bold })
  text(invoice.number, width - marginX - mono.widthOfTextAtSize(invoice.number, 12), y - 2, { size: 12, f: mono, color: CYAN })
  y -= 20
  text('codebymike.tech', marginX, y, { size: 9, color: MUTED })
  y -= 30
  line(y)
  y -= 30

  // Datos de emisión / cliente
  const col2 = marginX + 280
  text('FACTURADO A', marginX, y, { size: 8, f: bold, color: MUTED })
  text('FECHAS', col2, y, { size: 8, f: bold, color: MUTED })
  y -= 16
  text(invoice.company ?? invoice.clientName, marginX, y, { size: 11, f: bold })
  text(`Emitida: ${formatDate(invoice.issuedAt)}`, col2, y, { size: 10 })
  y -= 14

  let billingLines: [string, string][] = []
  try {
    billingLines = invoice.billingInfo ? Object.entries(JSON.parse(invoice.billingInfo)) : []
  } catch {
    billingLines = []
  }
  const dueLabel = invoice.dueAt ? `Vence: ${formatDate(invoice.dueAt)}` : null
  if (dueLabel) text(dueLabel, col2, y, { size: 10 })
  for (const [k, v] of billingLines) {
    text(`${k}: ${v}`, marginX, y, { size: 9, color: MUTED })
    y -= 13
  }
  if (invoice.paidAt) {
    y -= billingLines.length ? 0 : 0
    text(`Pagada: ${formatDate(invoice.paidAt)}`, col2, y - (billingLines.length ? 13 : 0), { size: 10, color: rgb(0.2, 0.5, 0.25) })
  }

  y -= 30
  if (invoice.projectTitle) {
    text(invoice.projectTitle, marginX, y, { size: 9, f: mono, color: MUTED })
    y -= 24
  }

  // Tabla de líneas
  const colDesc = marginX
  const colQty = marginX + 300
  const colPrice = marginX + 360
  const colTotal = width - marginX - 70

  text('CONCEPTO', colDesc, y, { size: 8, f: bold, color: MUTED })
  text('CANT.', colQty, y, { size: 8, f: bold, color: MUTED })
  text('PRECIO', colPrice, y, { size: 8, f: bold, color: MUTED })
  text('TOTAL', colTotal, y, { size: 8, f: bold, color: MUTED })
  y -= 8
  line(y)
  y -= 18

  for (const item of items) {
    // Una factura con demasiadas líneas para una página se trunca con aviso en
    // vez de desbordar el diseño: el caso normal (2-6 líneas) nunca lo toca.
    if (y < 160) {
      text('… (continúa)', colDesc, y, { size: 9, color: MUTED })
      break
    }
    text(item.description.slice(0, 55), colDesc, y, { size: 10 })
    text(String(item.quantity), colQty, y, { size: 10 })
    text(formatMoney(item.unitCents, invoice.currency), colPrice, y, { size: 10 })
    const totalStr = formatMoney(item.totalCents, invoice.currency)
    text(totalStr, colTotal + (70 - font.widthOfTextAtSize(totalStr, 10)), y, { size: 10 })
    y -= 20
  }

  y -= 10
  line(y)
  y -= 24

  // Totales
  const totalsX = width - marginX - 200
  const drawTotal = (label: string, cents: number, big = false) => {
    const value = formatMoney(cents, invoice.currency)
    text(label, totalsX, y, { size: big ? 12 : 10, f: big ? bold : font, color: big ? INK : MUTED })
    const f = big ? bold : font
    const size = big ? 13 : 10
    text(value, width - marginX - f.widthOfTextAtSize(value, size), y, { size, f, color: big ? CYAN : INK })
    y -= big ? 22 : 16
  }
  drawTotal('Subtotal', invoice.subtotalCents)
  if (invoice.taxCents > 0) drawTotal('Impuestos', invoice.taxCents)
  y -= 4
  page.drawLine({ start: { x: totalsX, y: y + 14 }, end: { x: width - marginX, y: y + 14 }, thickness: 0.75, color: rgb(0.7, 0.7, 0.73) })
  drawTotal('Total', invoice.totalCents, true)

  if (invoice.notes) {
    y -= 20
    text('NOTAS', marginX, y, { size: 8, f: bold, color: MUTED })
    y -= 14
    // Envuelto a mano en líneas de ~90 caracteres: pdf-lib no envuelve texto solo.
    const words = invoice.notes.split(/\s+/)
    let lineBuf = ''
    for (const w of words) {
      if ((lineBuf + ' ' + w).trim().length > 90) {
        text(lineBuf.trim(), marginX, y, { size: 9, color: MUTED })
        y -= 13
        lineBuf = w
      } else {
        lineBuf += ' ' + w
      }
    }
    if (lineBuf.trim()) text(lineBuf.trim(), marginX, y, { size: 9, color: MUTED })
  }

  // Pie
  text('Generado por el portal de clientes de CodeByMike.', marginX, 40, { size: 8, color: MUTED })

  return doc.save()
}
