// PDF de una propuesta de Plano.
//
// pdf-lib y no HTML→PDF, por la misma razón que la cuenta de cobro: no hay
// Chromium en la función serverless. Función PURA: recibe el snapshot ya
// congelado y devuelve bytes. A diferencia de la cuenta de cobro, una
// propuesta ocupa varias páginas, así que todo se dibuja a través de un cursor
// que salta de página cuando no cabe el siguiente bloque.
//
// Va el texto FORMAL de las cláusulas: es el que vale como acuerdo. El "en
// cristiano" vive en el enlace del cliente.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { formatearMonto } from '../../data/tarifario'
import { sanitize } from '../cuenta-cobro-pdf'
import { CANAL_LABEL, SEGUIMIENTO_LABEL } from './contacto'
import { fechaCorta, fechaLarga } from './fechas'
import { cantidadConUnidad, NIVEL_LABEL, type Snapshot } from './tipos'

const INK = rgb(0.08, 0.08, 0.1)
const MUTED = rgb(0.45, 0.45, 0.48)
const RULE = rgb(0.85, 0.85, 0.87)
const CYAN = rgb(0, 0.55, 0.6)

export type PdfPropuestaInput = {
  snapshot: Snapshot
  version: number
  huella: string
  aceptacion?: { nombre: string; documento: string; el: Date; huella: string } | null
}

const PLAN_LABEL = { hitos: 'Por entregas', cuotas: 'En cuotas', contado: 'De contado' } as const

export async function generarPdfPropuesta(input: PdfPropuestaInput): Promise<Uint8Array> {
  const s = input.snapshot
  const doc = await PDFDocument.create()
  doc.setTitle(sanitize(`Propuesta - ${s.titulo}`))
  doc.setAuthor('Mike Rodríguez - codebymike.net')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)

  const W = 595.28
  const H = 841.89
  const mx = 54
  const right = W - mx
  const ancho = right - mx
  const pie = 60
  let page: PDFPage = doc.addPage([W, H])
  let y = H - 64
  const m = (v: number) => formatearMonto(v, s.moneda)

  type Op = { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> }
  const text = (t: string, x: number, yy: number, o: Op = {}) =>
    page.drawText(sanitize(t), { x, y: yy, size: o.size ?? 10, font: o.f ?? font, color: o.color ?? INK })
  const textRight = (t: string, xr: number, yy: number, o: Op = {}) => {
    const f = o.f ?? font
    text(t, xr - f.widthOfTextAtSize(sanitize(t), o.size ?? 10), yy, o)
  }
  const regla = (yy: number) => page.drawLine({ start: { x: mx, y: yy }, end: { x: right, y: yy }, thickness: 0.5, color: RULE })

  const wrap = (t: string, f: PDFFont, size: number, max: number): string[] => {
    const limpio = sanitize(t).trim()
    if (!limpio) return []
    const out: string[] = []
    let buf = ''
    for (const w of limpio.split(/\s+/)) {
      const probe = buf ? `${buf} ${w}` : w
      if (f.widthOfTextAtSize(probe, size) > max && buf) {
        out.push(buf)
        buf = w
      } else buf = probe
    }
    if (buf) out.push(buf)
    return out
  }

  /** Salta de página si no caben `alto` puntos. */
  const espacio = (alto: number) => {
    if (y - alto < pie) {
      page = doc.addPage([W, H])
      y = H - 64
    }
  }

  const parrafo = (t: string, o: Op & { x?: number; max?: number } = {}) => {
    const size = o.size ?? 10
    for (const l of wrap(t, o.f ?? font, size, o.max ?? ancho)) {
      espacio(size + 4)
      text(l, o.x ?? mx, y, { ...o, size })
      y -= size + 4
    }
  }

  const seccion = (titulo: string) => {
    espacio(48)
    y -= 12
    text(titulo.toUpperCase(), mx, y, { size: 8.5, f: bold, color: CYAN })
    y -= 8
    regla(y)
    y -= 16
  }

  // ── Encabezado ────────────────────────────────────────────────────────────
  text('PROPUESTA', mx, y, { size: 9, f: bold, color: MUTED })
  textRight(`Versión ${input.version}`, right, y, { size: 9, f: mono, color: CYAN })
  y -= 26
  for (const l of wrap(s.titulo || 'Propuesta', bold, 22, ancho)) {
    text(l, mx, y, { size: 22, f: bold })
    y -= 26
  }
  const para = [s.cliente.nombre, s.cliente.empresa].filter(Boolean).join(' - ')
  if (para) text(`Para: ${para}`, mx, y, { size: 11 })
  y -= 15
  text(`Fecha: ${fechaLarga(s.generadoEl)}  ·  Válida hasta el ${fechaCorta(s.validoHasta)}`, mx, y, { size: 10, color: MUTED })
  y -= 14
  text('De: Mike Rodríguez (EL DESARROLLADOR) - codebymike.net', mx, y, { size: 10, color: MUTED })
  y -= 22
  regla(y)
  y -= 18

  if (s.resumen) {
    seccion('Lo que entendí')
    parrafo(s.resumen, { size: 10.5 })
  }

  // ── Alcance ───────────────────────────────────────────────────────────────
  seccion(`Qué incluye · versión ${NIVEL_LABEL[s.version].toLowerCase()}`)
  if (s.base) parrafo(`- Plan web ${s.base.nombre}: diseño, secciones, publicación y primer año de dominio y alojamiento.`)
  for (const l of s.lineas.filter((x) => x.incluida)) {
    parrafo(`- ${l.nombre}${cantidadConUnidad(l.cantidad, l.unidad)}`)
  }
  if (s.exclusiones.length) {
    y -= 6
    parrafo('No incluye:', { f: bold, size: 10 })
    for (const x of s.exclusiones) parrafo(`- ${x}`, { color: MUTED })
  }

  // ── Inversión ─────────────────────────────────────────────────────────────
  seccion('Inversión')
  espacio(40)
  text('Precio del proyecto', mx, y, { size: 11 })
  textRight(m(s.precio), right, y, { size: 16, f: bold })
  y -= 22
  if (s.plan.recargoTotal > 0) {
    text(`Recargo por financiación (${s.plan.pagos.filter((p) => p.cuota).length} cuotas)`, mx, y, { size: 10, color: MUTED })
    textRight(m(s.plan.recargoTotal), right, y, { size: 10, color: MUTED })
    y -= 15
  }
  if (s.plan.descuento > 0) {
    text('Descuento por pago de contado', mx, y, { size: 10, color: MUTED })
    textRight(`-${m(s.plan.descuento)}`, right, y, { size: 10, color: MUTED })
    y -= 15
  }
  if (s.plan.total !== s.precio) {
    text('Total a pagar', mx, y, { size: 11, f: bold })
    textRight(m(s.plan.total), right, y, { size: 11, f: bold })
    y -= 18
  }
  y -= 6
  parrafo(`Forma de pago: ${PLAN_LABEL[s.plan.tipo].toLowerCase()}.`, { size: 10, f: bold })
  y -= 4
  espacio(18)
  text('Pago', mx, y, { size: 8, f: bold, color: MUTED })
  text('Vence', mx + 300, y, { size: 8, f: bold, color: MUTED })
  textRight('Valor', right, y, { size: 8, f: bold, color: MUTED })
  y -= 6
  regla(y)
  y -= 14
  for (const p of s.plan.pagos) {
    espacio(30)
    text(`${p.n}. ${p.concepto}${p.pct ? ` (${p.pct} %)` : ''}`, mx, y, { size: 10 })
    text(fechaCorta(p.vence), mx + 300, y, { size: 10, f: mono })
    textRight(m(p.monto), right, y, { size: 10, f: bold })
    y -= 13
    if (p.radicarAntesDe) {
      text(`Radicar la cuenta de cobro a más tardar el ${fechaCorta(p.radicarAntesDe)}`, mx + 12, y, { size: 8.5, color: MUTED })
      y -= 12
    }
    if (p.cuota) {
      text(`Abono ${m(p.cuota.abono)} + recargo ${m(p.cuota.recargo)} · saldo ${m(p.cuota.saldo)}`, mx + 12, y, { size: 8.5, color: MUTED })
      y -= 12
    }
    y -= 3
  }
  parrafo('Las fechas de los pagos atados a entregas son estimadas: el pago vence cuando se cumple la entrega, no antes.', { size: 8.5, color: MUTED })

  // ── Cronograma ────────────────────────────────────────────────────────────
  seccion('Cronograma estimado')
  for (const h of s.hitos) {
    espacio(28)
    text(fechaCorta(h.fecha), mx, y, { size: 10, f: mono, color: CYAN })
    text(h.nombre, mx + 90, y, { size: 10, f: bold })
    y -= 13
    parrafo(h.entregable, { x: mx + 90, max: ancho - 90, size: 9.5, color: MUTED })
    y -= 3
  }

  // ── Contacto ──────────────────────────────────────────────────────────────
  seccion('Comunicación')
  const c = s.contacto
  const persona = (rol: string, p: { nombre: string; rol: string; telefono: string; correo: string } | null) => {
    if (!p || !p.nombre) return
    parrafo(`${rol}: ${p.nombre}${p.rol ? ` (${p.rol})` : ''}${[p.telefono, p.correo].filter(Boolean).length ? ` - ${[p.telefono, p.correo].filter(Boolean).join(' - ')}` : ''}`)
  }
  persona('Contacto del cliente', c.contacto)
  persona('Aprueba las entregas', c.decisor)
  persona('Paga', c.pagador)
  parrafo(`Canal: ${CANAL_LABEL[c.canal]}, ${c.horario}. Respuesta de EL DESARROLLADOR en máximo ${c.respuestaMikeHoras} horas hábiles. Seguimiento: ${SEGUIMIENTO_LABEL[c.seguimiento]}.`, { color: MUTED })

  // ── Condiciones ───────────────────────────────────────────────────────────
  seccion('Condiciones')
  s.clausulas
    .filter((x) => x.activa)
    .forEach((x, i) => {
      espacio(40)
      parrafo(`${i + 1}. ${x.titulo}`, { f: bold, size: 10 })
      parrafo(x.formal, { size: 9.5, color: rgb(0.2, 0.2, 0.23) })
      y -= 6
    })

  // ── Aceptación ────────────────────────────────────────────────────────────
  seccion('Aceptación')
  if (input.aceptacion) {
    const a = input.aceptacion
    parrafo(`Aceptada electrónicamente por ${a.nombre}, documento ${a.documento}, el ${fechaLarga(a.el.toISOString().slice(0, 10))}.`)
    parrafo(`Constancia: ${a.huella}`, { f: mono, size: 8, color: MUTED })
  } else {
    parrafo('Esta propuesta se acepta en el enlace privado que la acompaña, con el nombre y el documento de quien la acepta (Ley 527 de 1999).', { color: MUTED })
  }

  // ── Pie en todas las páginas ──────────────────────────────────────────────
  const paginas = doc.getPages()
  paginas.forEach((pg, i) => {
    const t = `Versión ${input.version} · huella ${input.huella.slice(0, 16)}`
    pg.drawText(sanitize(t), { x: mx, y: 32, size: 7.5, font: mono, color: MUTED })
    const n = `${i + 1} / ${paginas.length}`
    pg.drawText(n, { x: right - mono.widthOfTextAtSize(n, 7.5), y: 32, size: 7.5, font: mono, color: MUTED })
  })

  return doc.save()
}
