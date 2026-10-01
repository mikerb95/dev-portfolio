// Modelo de la "cinta de días" de /ep: una raya por día de la etapa
// productiva, con las ventanas de bitácora debajo y las visitas encima.
//
// Lo usan dos lados con los mismos datos: el servidor pinta la cinta de esta
// ficha en el HTML prerenderizado, y la calculadora la vuelve a pintar en el
// navegador con la fecha de otro aprendiz. Por eso el marcado sale de aquí como
// texto (`htmlCinta`) y no de un componente: un solo dibujante para los dos, y
// la calculadora no puede enseñar una cinta distinta de la de arriba.
//
// Módulo puro e isomorfo: sin DOM, sin `node:*`, sin `../db`.

import { claveFecha, diaInhabil, habilAnterior } from '../festivos-co'
import type { Hito } from '../sena-ep'

// ── Fechas ─────────────────────────────────────────────────────────────────
// Todo en fecha LOCAL a medianoche, como festivos-co: es el mismo criterio con
// el que se decide si un día es inhábil, y mezclar UTC aquí correría un día
// los festivos en cualquier zona al oeste de Greenwich.

const fecha = (iso: string) => new Date(`${iso}T00:00:00`)
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const addMonths = (d: Date, n: number) => {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}
const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

export const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export const fCorto = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${MES_CORTO[d.getMonth()]}`

// ── Entrada ────────────────────────────────────────────────────────────────

export interface VentanaEntrada {
  n: number
  desdeIso: string
  hastaIso: string
  /** Bitácoras: día que se marca como entrega. Por defecto, `hastaIso`. */
  cierreIso?: string
  /** Visitas: nombre corto ("Concertación"). */
  titulo?: string
}

export interface EntradaCinta {
  inicioIso: string
  finIso: string
  bitacoras: VentanaEntrada[]
  visitas: VentanaEntrada[]
}

/**
 * Una ventana por mes desde el inicio, cerrando el día antes de que abra la
 * siguiente. Es la misma regla con la que /ep arma la tabla de bitácoras de la
 * ficha; vive aquí para que la cinta de la calculadora no tenga otra.
 */
export function ventanasBitacora(inicioIso: string, meses: number): VentanaEntrada[] {
  const inicio = fecha(inicioIso)
  return Array.from({ length: meses }, (_, i) => ({
    n: i + 1,
    desdeIso: claveFecha(addMonths(inicio, i)),
    hastaIso: claveFecha(addDays(addMonths(inicio, i + 1), -1)),
  }))
}

const TITULO_VISITA: Record<string, { n: number; titulo: string }> = {
  f023_1: { n: 1, titulo: 'Concertación' },
  f023_2: { n: 2, titulo: 'Seguimiento' },
  f023_3: { n: 3, titulo: 'Final y cierre' },
}

/** El día calendario de un hito de sena-ep (anclado a mediodía UTC). */
const isoDeHito = (h: Hito) => h.fecha.toISOString().slice(0, 10)

/**
 * Entrada de la cinta a partir de la proyección de la calculadora
 * (`computeHitos`). Se respeta la proyección tal cual: cada bitácora se marca
 * en la fecha que da `computeHitos` y la cinta se alarga hasta el último hito,
 * aunque caiga unos días después del fin nominal. La cinta tiene que contar
 * lo mismo que la lista de hitos que va debajo, no corregirla.
 */
export function entradaDesdeHitos(inicioIso: string, hitos: Hito[]): EntradaCinta {
  const bitacorasHito = hitos.filter((h) => h.categoria === 'bitacora')
  const ventanas = ventanasBitacora(inicioIso, bitacorasHito.length).map((v, i) => ({
    ...v,
    cierreIso: isoDeHito(bitacorasHito[i]),
  }))
  const visitas = hitos
    .filter((h) => TITULO_VISITA[h.docKey])
    .map((h) => {
      const iso = isoDeHito(h)
      return { ...TITULO_VISITA[h.docKey], desdeIso: iso, hastaIso: iso }
    })
  const ultimo = hitos.reduce((max, h) => (isoDeHito(h) > max ? isoDeHito(h) : max), inicioIso)
  const finVentanas = ventanas.at(-1)?.hastaIso ?? inicioIso
  return {
    inicioIso,
    finIso: ultimo > finVentanas ? ultimo : finVentanas,
    bitacoras: ventanas,
    visitas,
  }
}

// ── Modelo ─────────────────────────────────────────────────────────────────

export interface DiaCinta {
  i: number
  iso: string
  dow: number
  inhabil: 'festivo' | 'domingo' | 'sabado' | null
  motivo: string | null
  /** Ventana de bitácora a la que pertenece (null si cae después de la última). */
  bitacora: number | null
  /** Bitácora que se entrega este día. */
  cierre: number | null
  /** Bitácora cuya entrega se adelanta a este día porque su cierre es inhábil. */
  entrega: number | null
  visita: number | null
  /** Posición en la versión móvil: una fila por ventana, 1-based. */
  fila: number
  colm: number
}

export interface BitacoraCinta {
  n: number
  desde: number
  hasta: number
  cierre: number
  cierreIso: string
  /** Si el cierre es inhábil: el hábil anterior. */
  entregaIso: string | null
  motivo: string | null
}

export interface VisitaCinta {
  n: number
  titulo: string
  desde: number
  hasta: number
  desdeIso: string
  /** Hacia dónde se alinea la etiqueta para no salirse por los extremos. */
  alinear: 'start' | 'center' | 'end'
}

export interface Cinta {
  inicioIso: string
  finIso: string
  /** Días transcurridos entre inicio y fin: la cinta tiene `total + 1` rayas. */
  total: number
  dias: DiaCinta[]
  meses: { label: string; desde: number; span: number }[]
  bitacoras: BitacoraCinta[]
  visitas: VisitaCinta[]
  /** Filas de la versión móvil: una por bitácora, más una "cola" si sobran días. */
  filas: { fila: number; label: string; bitacora: number | null }[]
}

export function modeloCinta(e: EntradaCinta): Cinta {
  const inicio = fecha(e.inicioIso)
  const fin = fecha(e.finIso)
  const total = diasEntre(inicio, fin)
  if (!(total > 0)) throw new Error('rango de la cinta inválido')
  const idx = (iso: string) => Math.min(total, Math.max(0, diasEntre(inicio, fecha(iso))))

  const bitacoras: BitacoraCinta[] = e.bitacoras.map((b) => {
    const cierreIso = b.cierreIso ?? b.hastaIso
    const cierreD = fecha(cierreIso)
    const inh = diaInhabil(cierreD)
    return {
      n: b.n,
      desde: idx(b.desdeIso),
      hasta: idx(b.hastaIso),
      cierre: idx(cierreIso),
      cierreIso,
      entregaIso: inh ? claveFecha(habilAnterior(cierreD)) : null,
      motivo: inh?.motivo ?? null,
    }
  })

  const visitas: VisitaCinta[] = e.visitas.map((v) => {
    const desde = idx(v.desdeIso)
    const hasta = idx(v.hastaIso)
    const centro = (desde + hasta + 1) / 2 / (total + 1)
    return {
      n: v.n,
      titulo: v.titulo ?? `Visita ${v.n}`,
      desde,
      hasta,
      desdeIso: v.desdeIso,
      alinear: centro > 0.75 ? 'end' : centro < 0.15 ? 'start' : 'center',
    }
  })

  const filaCola = bitacoras.length + 1
  let hayCola = false
  const dias: DiaCinta[] = []
  for (let i = 0; i <= total; i++) {
    const d = addDays(inicio, i)
    const iso = claveFecha(d)
    const inh = diaInhabil(d)
    const b = bitacoras.find((x) => i >= x.desde && i <= x.hasta) ?? null
    if (!b) hayCola = true
    // Los días que preceden a la primera ventana (no ocurre con las entradas
    // reales, pero el modelo no lo supone) van a la primera fila.
    const colaDesde = bitacoras.length ? bitacoras[bitacoras.length - 1].hasta + 1 : 0
    dias.push({
      i,
      iso,
      dow: d.getDay(),
      inhabil: inh?.tipo ?? null,
      motivo: inh?.motivo ?? null,
      bitacora: b?.n ?? null,
      cierre: bitacoras.find((x) => x.cierre === i)?.n ?? null,
      entrega: bitacoras.find((x) => x.entregaIso === iso)?.n ?? null,
      visita: visitas.find((v) => i >= v.desde && i <= v.hasta)?.n ?? null,
      fila: b ? bitacoras.indexOf(b) + 1 : i < (bitacoras[0]?.desde ?? 0) ? 1 : filaCola,
      colm: b ? i - b.desde + 1 : i - colaDesde + 1,
    })
  }

  // Regla de meses: el primero arranca en el día 0 aunque el mes empezara
  // antes; los demás, en su día 1.
  const meses: Cinta['meses'] = []
  for (const d of dias) {
    const f = fecha(d.iso)
    if (d.i === 0 || f.getDate() === 1) {
      const etiqueta = f.getMonth() === 0 ? `${MES_CORTO[0]} ${f.getFullYear()}` : MES_CORTO[f.getMonth()]
      meses.push({ label: etiqueta, desde: d.i, span: 1 })
    }
  }
  meses.forEach((m, k) => {
    m.span = (meses[k + 1]?.desde ?? total + 1) - m.desde
  })

  const filas: Cinta['filas'] = bitacoras.map((b, k) => ({ fila: k + 1, label: `B${b.n}`, bitacora: b.n }))
  if (hayCola && bitacoras.length) filas.push({ fila: filaCola, label: 'Fin', bitacora: null })

  return { inicioIso: e.inicioIso, finIso: e.finIso, total, dias, meses, bitacoras, visitas, filas }
}

// ── Lectura de un día ──────────────────────────────────────────────────────
// Lo que dice la cinta cuando se apunta (o se recorre con flechas) un día. Es
// texto y no un tooltip flotante: vive en una línea fija bajo la cinta, que
// además es la región aria-live.

export interface Lectura {
  titulo: string
  lineas: { texto: string; tono: 'cyan' | 'violet' | 'ember' | 'lime' | 'ink' }[]
}

export function lecturaDia(c: Cinta, i: number, hoyIso: string | null = null): Lectura {
  const d = c.dias[Math.min(c.total, Math.max(0, i))]
  const f = fecha(d.iso)
  const esHoy = hoyIso === d.iso
  const titulo = `${esHoy ? 'Hoy · ' : ''}${DIA_CORTO[d.dow]} ${fCorto(f)}-${f.getFullYear()} · día ${d.i} de ${c.total}`
  const lineas: Lectura['lineas'] = []

  if (d.i === 0) lineas.push({ texto: 'Inicio de la etapa productiva', tono: 'lime' })
  if (d.cierre) {
    const b = c.bitacoras.find((x) => x.n === d.cierre)!
    lineas.push({ texto: `Entrega de la bitácora ${b.n}`, tono: 'cyan' })
    if (b.entregaIso) {
      const e = fecha(b.entregaIso)
      lineas.push({ texto: `${b.motivo}: entrega el ${DIA_CORTO[e.getDay()]} ${fCorto(e)}`, tono: 'ember' })
    }
  } else if (d.bitacora) {
    const b = c.bitacoras.find((x) => x.n === d.bitacora)!
    lineas.push({ texto: `Bitácora ${b.n} en curso · se entrega el ${fCorto(fecha(b.cierreIso))}`, tono: 'cyan' })
  }
  if (d.entrega) lineas.push({ texto: `Último hábil para entregar la bitácora ${d.entrega}`, tono: 'lime' })
  if (d.visita) {
    const v = c.visitas.find((x) => x.n === d.visita)!
    lineas.push({
      texto: v.desde === v.hasta ? `Visita ${v.n} · ${v.titulo}` : `Ventana de la visita ${v.n} · ${v.titulo}`,
      tono: 'violet',
    })
  }
  if (d.inhabil && !d.cierre) lineas.push({ texto: d.motivo!, tono: d.inhabil === 'festivo' ? 'ember' : 'ink' })
  if (d.i === c.total) lineas.push({ texto: 'Último día de la cinta', tono: 'lime' })
  if (!lineas.length) lineas.push({ texto: 'Día hábil', tono: 'ink' })
  return { titulo, lineas }
}

/** Índice del día `hoyIso` en la cinta, o null si cae fuera. */
export function indiceDe(c: Cinta, iso: string): number | null {
  const i = diasEntre(fecha(c.inicioIso), fecha(iso))
  return i >= 0 && i <= c.total ? i : null
}

// ── Marcado ────────────────────────────────────────────────────────────────
// Una sola rejilla para escritorio y móvil: cada pieza lleva sus dos
// posiciones como variables (`--col`/`--span` para la cinta horizontal,
// `--fila`/`--colm` para las filas por mes) y el CSS elige según el ancho.
// Así no hay dos cintas en el DOM ni un script que reacomode al girar el
// celular.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function htmlCinta(c: Cinta): string {
  const meses = c.meses
    .map((m) => `<span class="ct-mes" style="--col:${m.desde + 1};--span:${m.span}">${esc(m.label)}</span>`)
    .join('')

  const pines = c.visitas
    .map(
      (v) =>
        `<span class="ct-pin" data-v="${v.n}" data-alinear="${v.alinear}" style="--col:${v.desde + 1};--span:${v.hasta - v.desde + 1}">` +
        `<span class="ct-pin-et"><b>V${v.n}</b> ${esc(v.titulo)} <em>${fCorto(fecha(v.desdeIso))}</em></span></span>`,
    )
    .join('')

  const dias = c.dias
    .map((d) => {
      const attrs = [
        `data-i="${d.i}"`,
        `data-iso="${d.iso}"`,
        d.inhabil ? `data-inh="${d.inhabil}"` : '',
        d.cierre ? `data-cierre="${d.cierre}"` : '',
        d.entrega ? `data-entrega="${d.entrega}"` : '',
        d.visita ? `data-v="${d.visita}"` : '',
        d.bitacora ? `data-b="${d.bitacora}"` : '',
        d.dow === 1 ? 'data-lunes' : '',
      ]
        .filter(Boolean)
        .join(' ')
      return `<span class="ct-d" ${attrs} style="--col:${d.i + 1};--fila:${d.fila};--colm:${d.colm + 1}"><i></i></span>`
    })
    .join('')

  const bits = c.bitacoras
    .map(
      (b) =>
        `<span class="ct-b" data-b="${b.n}" style="--col:${b.desde + 1};--span:${b.hasta - b.desde + 1};--fila:${c.filas.find((f) => f.bitacora === b.n)!.fila}">` +
        `<b>B${b.n}</b><em>${fCorto(fecha(b.cierreIso))}${b.entregaIso ? ' <span class="ct-b-aviso" title="' + esc(b.motivo ?? '') + '">▲</span>' : ''}</em></span>`,
    )
    .join('')
  const cola = c.filas
    .filter((f) => f.bitacora === null)
    .map((f) => `<span class="ct-b ct-b-cola" style="--fila:${f.fila}"><b>${f.label}</b></span>`)
    .join('')

  return (
    `<div class="ct-grid" style="--n:${c.total + 1};--filas:${c.filas.length}">` +
    `<div class="ct-meses">${meses}</div>` +
    `<div class="ct-pines">${pines}</div>` +
    `<div class="ct-dias">${dias}</div>` +
    `<div class="ct-bits">${bits}${cola}</div>` +
    `<span class="ct-cabeza"></span>` +
    `<span class="ct-hoy"><em>Hoy</em></span>` +
    `</div>`
  )
}

/** Miniatura de una sola ventana de bitácora (la fila de la tabla). */
export function htmlMini(c: Cinta, n: number): string {
  const b = c.bitacoras.find((x) => x.n === n)
  if (!b) return ''
  return c.dias
    .filter((d) => d.i >= b.desde && d.i <= Math.max(b.hasta, b.cierre))
    .map((d) => {
      const attrs = [
        `data-iso="${d.iso}"`,
        d.inhabil ? `data-inh="${d.inhabil}"` : '',
        d.cierre === n ? 'data-cierre' : '',
        d.entrega === n ? 'data-entrega' : '',
      ]
        .filter(Boolean)
        .join(' ')
      return `<i ${attrs}></i>`
    })
    .join('')
}
