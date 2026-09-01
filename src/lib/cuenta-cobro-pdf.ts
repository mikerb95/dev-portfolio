// PDF de la cuenta de cobro.
//
// pdf-lib y no HTML→PDF, por la misma razón que la factura del portal: no hay
// Chromium en la función serverless sin @sparticuz/chromium, un paquete pesado
// para un documento de una página. Función PURA: recibe el registro y devuelve
// bytes, sin tocar red ni base de datos, así que se puede probar.
//
// El orden de los bloques no es estético: es el que espera un área de pagos
// colombiana, y es el que permite al pagador armar su Documento Soporte
// (Res. DIAN 000167 de 2021). Ver docs/plan-cuentas-de-cobro.md §1.2.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  LEYENDA_DOCUMENTO_SOPORTE,
  LEYENDA_NO_OBLIGADO_FACTURAR,
  LEYENDA_NO_RESPONSABLE_IVA,
  montoEnLetras,
  type Deudor,
  type Emisor,
  type Retencion,
} from './cuentas-cobro'

const INK = rgb(0.08, 0.08, 0.1)
const MUTED = rgb(0.45, 0.45, 0.48)
const RULE = rgb(0.85, 0.85, 0.87)
const CYAN = rgb(0, 0.55, 0.6) // el cian de neón del sitio no tiene contraste sobre blanco

export type CuentaCobroPdfInput = {
  number: string
  city: string | null
  issuedAt: Date | null
  dueAt: Date | null
  concept: string | null
  contractRef: string | null
  periodStart: Date | null
  periodEnd: Date | null
  subtotalCents: number
  totalCents: number
  retentionsCents: number
  netCents: number
  notes: string | null
  ssPlanilla: string | null
  ssPeriodo: string | null
  emisor: Emisor
  deudor: Deudor
  retentions: Retencion[]
  items: { description: string; quantity: number; unitCents: number; totalCents: number }[]
}

// ── Saneado de texto ────────────────────────────────────────────────────────

// Las fuentes estándar de pdf-lib codifican en WinAnsi. Las tildes y la ñ pasan
// sin problema, pero cualquier carácter fuera de ese rango (un emoji pegado
// desde WhatsApp, unas comillas tipográficas, una raya larga) hace que
// `drawText` LANCE en tiempo de ejecución: no en compilación, y no en el caso
// de prueba. Es el fallo más probable de este archivo, así que todo texto que
// se dibuja pasa por aquí.
//
// La tabla se declara por PUNTO DE CÓDIGO y no con literales por dos razones:
// varios de estos caracteres son indistinguibles a simple vista de su
// equivalente ASCII (o directamente invisibles, como los espacios), y la
// convención del repositorio prohíbe escribir la raya larga en el código.
const REEMPLAZOS: Record<number, string> = {
  0x2014: '-', // raya
  0x2013: '-', // semirraya
  0x2212: '-', // signo menos
  0x2018: "'", // comilla simple de apertura
  0x2019: "'", // comilla simple de cierre / apóstrofo tipográfico
  0x201a: "'", // comilla simple baja
  0x201c: '"', // comilla doble de apertura
  0x201d: '"', // comilla doble de cierre
  0x201e: '"', // comilla doble baja
  0x2026: '...', // puntos suspensivos
  0x00a0: ' ', // espacio duro (el que mete Intl alrededor del símbolo de moneda)
  0x2009: ' ', // espacio fino
  0x202f: ' ', // espacio fino sin separación
  0x2022: '*', // viñeta
}

export function sanitize(s: string | null | undefined): string {
  if (!s) return ''
  const out: string[] = []
  for (const ch of String(s)) {
    const code = ch.codePointAt(0) ?? 0
    const reemplazo = REEMPLAZOS[code]
    if (reemplazo !== undefined) {
      out.push(reemplazo)
      continue
    }
    // Fuera controles y todo lo que no quepa en Latin-1. Se descarta el
    // carácter, no el documento: perder un emoji es mejor que un 500.
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code > 0xff) continue
    out.push(ch)
  }
  return out.join('')
}

const fmt = (cents: number): string =>
  // Intl inserta un espacio duro tras el símbolo según la versión de ICU del
  // runtime. No se normaliza aquí: `sanitize` ya lo convierte en espacio normal
  // justo antes de dibujar, y tenerlo en un solo sitio evita que se olvide.
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(cents / 100)

const fecha = (d: Date | null): string =>
  d ? new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }).format(d) : ''

// ── Generación ──────────────────────────────────────────────────────────────

export async function generateCuentaCobroPdf(input: CuentaCobroPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 en puntos
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)

  const { width, height } = page.getSize()
  const marginX = 50
  const right = width - marginX
  let y = height - 58

  type Opts = { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> }
  const text = (s: string, x: number, yPos: number, o: Opts = {}) =>
    page.drawText(sanitize(s), { x, y: yPos, size: o.size ?? 10, font: o.f ?? font, color: o.color ?? INK })

  const textRight = (s: string, xRight: number, yPos: number, o: Opts = {}) => {
    const f = o.f ?? font
    const size = o.size ?? 10
    text(s, xRight - f.widthOfTextAtSize(sanitize(s), size), yPos, o)
  }

  const line = (yPos: number, color = RULE) =>
    page.drawLine({ start: { x: marginX, y: yPos }, end: { x: right, y: yPos }, thickness: 0.5, color })

  /** pdf-lib no envuelve texto: hay que medir palabra a palabra. */
  const wrap = (s: string, f: typeof font, size: number, maxWidth: number): string[] => {
    const clean = sanitize(s).trim()
    if (!clean) return []
    const out: string[] = []
    let buf = ''
    for (const w of clean.split(/\s+/)) {
      const probe = buf ? `${buf} ${w}` : w
      if (f.widthOfTextAtSize(probe, size) > maxWidth && buf) {
        out.push(buf)
        buf = w
      } else {
        buf = probe
      }
    }
    if (buf) out.push(buf)
    return out
  }

  const paragraph = (s: string, size: number, color = MUTED, f = font) => {
    for (const l of wrap(s, f, size, right - marginX)) {
      text(l, marginX, y, { size, color, f })
      y -= size + 3
    }
  }

  const SEP = '  ·  ' // punto medio: separador de datos dentro de una misma línea

  // ── Encabezado ────────────────────────────────────────────────────────────
  // El título es literalmente CUENTA DE COBRO. Titular "FACTURA" quien no es
  // facturador electrónico es emitir un documento que no puede emitir.
  text('CUENTA DE COBRO', marginX, y, { size: 20, f: bold })
  textRight(input.number, right, y + 2, { size: 12, f: mono, color: CYAN })
  y -= 18
  const lugarFecha = [input.city, fecha(input.issuedAt)].filter(Boolean).join(', ')
  if (lugarFecha) text(lugarFecha, marginX, y, { size: 10, color: MUTED })
  y -= 26
  line(y)
  y -= 26

  // ── Emisor ────────────────────────────────────────────────────────────────
  const e = input.emisor
  text(e.nombre, marginX, y, { size: 13, f: bold })
  y -= 15
  text(`C.C. ${e.cedula}`, marginX, y, { size: 10, f: mono })
  y -= 13
  const contacto = [e.telefono, e.email].filter(Boolean).join(SEP)
  for (const l of [e.direccion, e.ciudad, contacto].filter(Boolean)) {
    text(l, marginX, y, { size: 9.5, color: MUTED })
    y -= 12
  }

  // ── Deudor ────────────────────────────────────────────────────────────────
  y -= 16
  text('DEBE A', marginX, y, { size: 8, f: bold, color: MUTED })
  y -= 16
  const d = input.deudor
  text(d.nombre, marginX, y, { size: 12, f: bold })
  y -= 14
  text(`NIT/C.C. ${d.nit}`, marginX, y, { size: 10, f: mono })
  y -= 13
  for (const l of [d.direccion, d.ciudad].filter(Boolean)) {
    text(l, marginX, y, { size: 9.5, color: MUTED })
    y -= 12
  }

  // ── La suma ───────────────────────────────────────────────────────────────
  // El valor en letras es requisito de forma en la práctica colombiana, y va
  // antes de la tabla porque es lo primero que lee quien aprueba el pago.
  y -= 18
  text('LA SUMA DE', marginX, y, { size: 8, f: bold, color: MUTED })
  y -= 16
  const letrasY = y
  for (const l of wrap(montoEnLetras(input.totalCents), bold, 11, right - marginX - 130)) {
    text(l, marginX, y, { size: 11, f: bold })
    y -= 14
  }
  textRight(fmt(input.totalCents), right, letrasY, { size: 14, f: bold, color: CYAN })

  // ── Concepto ──────────────────────────────────────────────────────────────
  y -= 12
  text('POR CONCEPTO DE', marginX, y, { size: 8, f: bold, color: MUTED })
  y -= 14
  paragraph(input.concept ?? '', 10, INK)

  const meta: string[] = []
  if (input.periodStart || input.periodEnd) {
    meta.push(`Periodo: ${[fecha(input.periodStart), fecha(input.periodEnd)].filter(Boolean).join(' a ')}`)
  }
  if (input.contractRef) meta.push(`Contrato/OC: ${input.contractRef}`)
  if (input.dueAt) meta.push(`Pago hasta: ${fecha(input.dueAt)}`)
  if (meta.length) {
    y -= 4
    text(meta.join(SEP), marginX, y, { size: 9, color: MUTED })
    y -= 14
  }

  // ── Tabla de conceptos ────────────────────────────────────────────────────
  y -= 12
  const colQty = marginX + 300
  const colPrice = marginX + 355

  text('DETALLE', marginX, y, { size: 8, f: bold, color: MUTED })
  text('CANT.', colQty, y, { size: 8, f: bold, color: MUTED })
  text('VALOR UNIT.', colPrice, y, { size: 8, f: bold, color: MUTED })
  textRight('TOTAL', right, y, { size: 8, f: bold, color: MUTED })
  y -= 8
  line(y)
  y -= 16

  for (const item of input.items) {
    // Un documento con más líneas de las que caben se trunca con aviso en vez
    // de desbordar el diseño. El caso normal (1-6 líneas) nunca lo toca.
    if (y < 250) {
      text('... (continúa)', marginX, y, { size: 9, color: MUTED })
      y -= 16
      break
    }
    text(item.description.slice(0, 52), marginX, y, { size: 10 })
    text(String(item.quantity), colQty, y, { size: 10 })
    text(fmt(item.unitCents), colPrice, y, { size: 10 })
    textRight(fmt(item.totalCents), right, y, { size: 10 })
    y -= 17
  }

  y -= 4
  line(y)
  y -= 20

  // ── Totales y retenciones ─────────────────────────────────────────────────
  const labelX = right - 260
  const fila = (label: string, value: string, o: Opts = {}) => {
    const size = o.size ?? 10
    text(label, labelX, y, { size, f: o.f ?? font, color: o.color ?? MUTED })
    textRight(value, right, y, { size, f: o.f ?? font, color: o.color ?? INK })
    y -= size + 6
  }

  fila('Subtotal', fmt(input.subtotalCents))
  // El IVA se imprime explícitamente en cero: su ausencia no es un olvido, es
  // el motivo por el que este documento existe, y quien lo revisa lo busca.
  fila('IVA (no responsable)', fmt(0))

  const aplicadas = input.retentions.filter((r) => r.applied)
  for (const r of aplicadas) {
    const pct = (r.rate * 100).toFixed(2).replace(/\.?0+$/, '')
    fila(`${r.label} (${pct} %)`, `- ${fmt(r.valueCents)}`, { size: 8.5 })
  }

  page.drawLine({ start: { x: labelX, y: y + 10 }, end: { x: right, y: y + 10 }, thickness: 0.75, color: rgb(0.7, 0.7, 0.73) })
  y -= 6
  fila('TOTAL A COBRAR', fmt(input.totalCents), { f: bold, size: 12, color: INK })
  if (aplicadas.length) {
    fila('Neto estimado tras retenciones', fmt(input.netCents), { size: 9.5, color: MUTED })
  }

  // ── Datos bancarios ───────────────────────────────────────────────────────
  y -= 14
  text('CONSIGNAR A', marginX, y, { size: 8, f: bold, color: MUTED })
  y -= 14
  text([e.banco, e.tipoCuenta, e.numeroCuenta].filter(Boolean).join(SEP), marginX, y, { size: 10.5, f: mono })
  y -= 13
  text(`Titular: ${e.nombre} - C.C. ${e.cedula}`, marginX, y, { size: 9, color: MUTED })
  y -= 20

  if (input.ssPlanilla || input.ssPeriodo) {
    const ss = [
      input.ssPlanilla ? `planilla ${input.ssPlanilla}` : null,
      input.ssPeriodo ? `periodo ${input.ssPeriodo}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    text(`Seguridad social (PILA): ${ss}`, marginX, y, { size: 9, color: MUTED })
    y -= 18
  }

  if (input.notes) {
    paragraph(input.notes, 9)
    y -= 8
  }

  // ── Leyendas legales ──────────────────────────────────────────────────────
  // Van al pie, pero no son decoración: la primera explica por qué no hay IVA,
  // la segunda por qué no hay factura electrónica, y la tercera le dice al
  // pagador exactamente qué documento tiene que generar por su lado.
  y = Math.max(y, 148)
  line(y)
  y -= 14
  for (const l of [LEYENDA_NO_RESPONSABLE_IVA, LEYENDA_NO_OBLIGADO_FACTURAR, LEYENDA_DOCUMENTO_SOPORTE]) {
    paragraph(l, 7.5)
    y -= 3
  }

  // ── Firma ─────────────────────────────────────────────────────────────────
  const firmaY = 76
  page.drawLine({ start: { x: marginX, y: firmaY }, end: { x: marginX + 200, y: firmaY }, thickness: 0.6, color: rgb(0.6, 0.6, 0.63) })
  text(e.nombre, marginX, firmaY - 14, { size: 10, f: bold })
  text(`C.C. ${e.cedula}`, marginX, firmaY - 26, { size: 9, color: MUTED })
  textRight('codebymike.tech', right, firmaY - 26, { size: 8, color: MUTED })

  return doc.save()
}
