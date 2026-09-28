// Modelo de la "partitura" de /automatizaciones: un renglón por tarea
// programada y una marca por cada ejecución real anotada en la bitácora.
//
// POR QUÉ UNA PARTITURA: la página afirma que un cron que deja de dispararse no
// produce un error, produce silencio. En una tabla con "última ejecución" el
// silencio es una celda; en un pentagrama es un compás vacío donde había pulso,
// y se ve sin leer nada.
//
// Módulo PURO (sin DOM, sin BD, sin reloj propio): lo usan el servidor para
// pintar la partitura en reposo y el navegador para el simulacro de corte. La
// definición de silencio y la decisión de avisar no se reescriben aquí: se
// importan de `src/lib/cron-silencio.ts`, que es lo que corre en producción.
// Si el vigilante cambia, el simulacro cambia con él.

import type { Cron } from '../../data/automatizaciones'
import {
  decidirAvisos,
  describirSilencio,
  jobsEnSilencio,
  tocaChequear,
  toleranciaMin,
  vigiladosUnicos,
  type EstadoSilencio,
  type OrigenCron,
  type Silencio,
} from '../cron-silencio'

const MIN_MS = 60_000
const HORA_MS = 60 * MIN_MS
const DIA_MS = 24 * HORA_MS

/** Una ejecución anotada. `at` en epoch ms. */
export type Corrida = { job: string; at: number; ok: boolean; ms: number | null }

export type Marca = { x: number; at: number; ok: boolean; ms: number | null }
/** Tramo en que el job estuvo callado más de lo que se le tolera. */
export type Hueco = { x0: number; x1: number; desde: number; hasta: number; min: number; abierto: boolean }

export type Carril = {
  job: string
  /** Intervalo más estricto entre sus disparadores (el que vigila el detector). */
  cadaMin: number
  toleranciaMin: number
  origenes: OrigenCron[]
  /** Horas declaradas del día (minutos desde las 00:00 UTC) de sus disparadores diarios. */
  horarios: number[]
  marcas: Marca[]
  /** Las horas declaradas que caen dentro de la ventana: "debía correr aquí". */
  fantasmas: number[]
  huecos: Hueco[]
  ultima: number | null
  total: number
  fallidas: number
}

export type Partitura = {
  desde: number
  hasta: number
  carriles: Carril[]
  corridas: number
  verdes: number
  /** Carriles que ahora mismo llevan más silencio del tolerado. */
  enSilencio: string[]
}

/** "07:00" → 420. Los horarios que no son una hora del día (cada ~5 min) dan null. */
export function minutoDelDia(horario: unknown): number | null {
  if (typeof horario !== 'string') return null
  const m = /^(\d{2}):(\d{2})$/.exec(horario)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Posición 0..1 de un instante dentro de la ventana. */
export const posicion = (at: number, desde: number, hasta: number): number => (at - desde) / (hasta - desde)

/**
 * Los renglones, en el orden en que se leen mejor: primero el pulso denso,
 * después los diarios por hora declarada. Un job con dos disparadores es UN
 * renglón (la bitácora no sabe quién lo disparó), con el intervalo más estricto.
 */
export function carrilesDelCatalogo(crons: readonly Cron[]): Omit<Carril, 'marcas' | 'fantasmas' | 'huecos' | 'ultima' | 'total' | 'fallidas'>[] {
  const unicos = vigiladosUnicos(crons.map((c) => ({ job: c.job, cadaMin: c.cadaMin, origen: c.origen })))
  return unicos
    .map((u) => {
      const propios = crons.filter((c) => c.job === u.job)
      const horarios = propios.map((c) => minutoDelDia(c.horario)).filter((m): m is number => m !== null)
      return {
        job: u.job,
        cadaMin: u.cadaMin,
        toleranciaMin: toleranciaMin(u.cadaMin),
        origenes: [...new Set(propios.map((c) => c.origen))],
        horarios: horarios.sort((a, b) => a - b),
      }
    })
    .sort((a, b) => a.cadaMin - b.cadaMin || (a.horarios[0] ?? 0) - (b.horarios[0] ?? 0))
}

/** Instantes declarados de un horario diario dentro de [desde, hasta]. */
export function instantesDiarios(minutos: readonly number[], desde: number, hasta: number): number[] {
  const out: number[] = []
  const dia0 = Math.floor(desde / DIA_MS) * DIA_MS
  for (let d = dia0; d <= hasta; d += DIA_MS) {
    for (const m of minutos) {
      const t = d + m * MIN_MS
      if (t >= desde && t <= hasta) out.push(t)
    }
  }
  return out.sort((a, b) => a - b)
}

/**
 * Silencios de un job: tramos entre dos ejecuciones (o entre la última y
 * `hasta`) más largos que su tolerancia. Se calculan con TODAS las corridas
 * que haya, no solo las de la ventana, para que un hueco que empezó antes del
 * borde izquierdo no se confunda con "no hay datos".
 */
export function huecosDe(tiempos: readonly number[], tolMin: number, desde: number, hasta: number): Hueco[] {
  const out: Hueco[] = []
  const tol = tolMin * MIN_MS
  const orden = [...tiempos].sort((a, b) => a - b)
  for (let i = 0; i < orden.length; i++) {
    const a = orden[i]
    const siguiente = orden[i + 1]
    const b = siguiente ?? hasta
    if (b - a <= tol || b < desde || a > hasta) continue
    const x0 = Math.max(a, desde)
    const x1 = Math.min(b, hasta)
    out.push({
      desde: a,
      hasta: b,
      x0: posicion(x0, desde, hasta),
      x1: posicion(x1, desde, hasta),
      min: Math.round((b - a) / MIN_MS),
      abierto: siguiente === undefined,
    })
  }
  return out
}

/**
 * La partitura de las últimas `horas` terminando en `hasta`.
 *
 * `corridas` puede traer más historia que la ventana (la página lee 48 h): se
 * usa para los huecos y para la última ejecución, y solo se dibuja lo que cae
 * dentro.
 */
export function construirPartitura(
  corridas: readonly Corrida[],
  crons: readonly Cron[],
  hasta: number,
  horas = 24
): Partitura {
  const desde = hasta - horas * HORA_MS
  const porJob = new Map<string, Corrida[]>()
  for (const c of corridas) {
    if (c.at > hasta) continue
    const lista = porJob.get(c.job) ?? []
    lista.push(c)
    porJob.set(c.job, lista)
  }

  let total = 0
  let verdes = 0
  const enSilencio: string[] = []
  const carriles: Carril[] = carrilesDelCatalogo(crons).map((base) => {
    const propias = (porJob.get(base.job) ?? []).sort((a, b) => a.at - b.at)
    const dentro = propias.filter((c) => c.at >= desde)
    const marcas = dentro.map((c) => ({ x: posicion(c.at, desde, hasta), at: c.at, ok: c.ok, ms: c.ms }))
    const ultima = propias.length ? propias[propias.length - 1].at : null
    const huecos = huecosDe(
      propias.map((c) => c.at),
      base.toleranciaMin,
      desde,
      hasta
    )
    if (huecos.some((h) => h.abierto)) enSilencio.push(base.job)
    total += dentro.length
    verdes += dentro.filter((c) => c.ok).length
    return {
      ...base,
      marcas,
      fantasmas: instantesDiarios(base.horarios, desde, hasta).map((t) => posicion(t, desde, hasta)),
      huecos,
      ultima,
      total: dentro.length,
      fallidas: dentro.length - dentro.filter((c) => c.ok).length,
    }
  })

  return { desde, hasta, carriles, corridas: total, verdes, enSilencio }
}

// ---------------------------------------------------------------------------
// Estado de una fila de la tabla
// ---------------------------------------------------------------------------

export type EstadoFila = 'ok' | 'fallo' | 'silencio' | 'sin-registro'

/**
 * Cómo se pinta la última ejecución de un cron.
 *
 * `ventanaMin` es cuánta historia se leyó de verdad. Un job ausente solo se
 * acusa de silencio si la ventana cubre su tolerancia: con menos historia no se
 * sabe si calla o si simplemente toca más tarde, y se dice "sin registro".
 */
export function estadoFila(
  cadaMin: number,
  ultima: { at: number; ok: boolean } | null,
  ventanaMin: number,
  ahora: number
): EstadoFila {
  const tol = toleranciaMin(cadaMin)
  if (!ultima) return ventanaMin >= tol ? 'silencio' : 'sin-registro'
  if ((ahora - ultima.at) / MIN_MS > tol) return 'silencio'
  return ultima.ok ? 'ok' : 'fallo'
}

/** Fracción de la tolerancia ya consumida desde la última ejecución (medidor). */
export function consumoTolerancia(cadaMin: number, ultima: number | null, ahora: number): number {
  if (ultima === null) return 1
  return Math.max(0, (ahora - ultima) / MIN_MS / toleranciaMin(cadaMin))
}

// ---------------------------------------------------------------------------
// Simulacro: cortar el programador externo
// ---------------------------------------------------------------------------

/** El endpoint que hospeda al vigilante (ver `src/lib/cron-runs.ts`). */
export const JOB_VIGILANTE = 'uptime-check'

export type Revision = { at: number; avisos: Silencio[] }

export type Simulacro = {
  corte: number
  /** Ejecuciones que siguen ocurriendo después del corte (solo disparadores de Vercel). */
  futuras: Corrida[]
  /** Cada vez que el vigilante se despierta y mira la bitácora. */
  revisiones: Revision[]
  /** La revisión que por fin avisa, o null si no llega dentro del horizonte. */
  alarma: (Revision & { textos: string[] }) | null
  /** Jobs que dejan de sonar con el corte. */
  callados: string[]
}

/**
 * Qué pasa si el programador externo deja de disparar en `corte`.
 *
 * Lo que sigue corriendo son los disparadores de Vercel, a su hora declarada.
 * El vigilante vive DENTRO de `uptime-check`, así que solo mira la bitácora
 * cuando ese endpoint se ejecuta: con el disparador rápido muerto, lo despierta
 * el diario. Y la corrida en curso se anota DESPUÉS de revisar (`conRegistro`
 * registra al terminar el handler), por eso al revisar todavía no cuenta.
 *
 * Todo lo que decide (tolerancia, "toca revisar", quién se avisa, el texto del
 * aviso) son las funciones de producción, no una copia.
 */
export function simularCorte(
  corridas: readonly Corrida[],
  crons: readonly Cron[],
  corte: number,
  horizonteHoras = 72,
  estadoInicial: EstadoSilencio = { avisados: {}, chequeadoEn: corte }
): Simulacro {
  const fin = corte + horizonteHoras * HORA_MS
  const futuras: Corrida[] = []
  for (const c of crons) {
    if (c.origen !== 'vercel') continue
    const m = minutoDelDia(c.horario)
    if (m === null) continue
    for (const at of instantesDiarios([m], corte + 1, fin)) futuras.push({ job: c.job, at, ok: true, ms: null })
  }
  futuras.sort((a, b) => a.at - b.at)

  const vigilados = crons.map((c) => ({ job: c.job, cadaMin: c.cadaMin, origen: c.origen }))
  const ultimas = new Map<string, number>()
  for (const c of corridas) {
    if (c.at > corte) continue
    if ((ultimas.get(c.job) ?? -Infinity) < c.at) ultimas.set(c.job, c.at)
  }

  const revisiones: Revision[] = []
  let estado = estadoInicial
  let alarma: Simulacro['alarma'] = null
  for (const f of futuras) {
    if (f.job === JOB_VIGILANTE && !alarma) {
      const ahora = new Date(f.at)
      if (tocaChequear(estado, ahora)) {
        const mapa = new Map([...ultimas].map(([j, t]) => [j, new Date(t)]))
        const silencios = jobsEnSilencio(vigilados, mapa, ahora)
        const r = decidirAvisos(silencios, estado, ahora)
        estado = r.estado
        const rev = { at: f.at, avisos: r.avisos }
        revisiones.push(rev)
        if (r.avisos.length) alarma = { ...rev, textos: r.avisos.map(describirSilencio) }
      }
    }
    ultimas.set(f.job, f.at)
  }

  const deVercel = new Set(crons.filter((c) => c.origen === 'vercel').map((c) => c.job))
  const callados = [...new Set(crons.filter((c) => c.origen === 'cron-job.org').map((c) => c.job))]
  return {
    corte,
    futuras,
    revisiones,
    alarma,
    // Un job con los dos disparadores no se calla del todo: baja a su ritmo diario.
    callados: callados.filter((j) => !deVercel.has(j)),
  }
}

/** Formato "3 h 12 min" / "45 min" para contadores del simulacro. */
export function duracionCorta(min: number): { h: number; m: number } {
  const total = Math.max(0, Math.floor(min))
  return { h: Math.floor(total / 60), m: total % 60 }
}

// ---------------------------------------------------------------------------
// Geometría del SVG (compartida por el servidor y el navegador)
// ---------------------------------------------------------------------------

/** Ancho del viewBox de cada renglón. El alto es fijo y el SVG se estira. */
export const ANCHO = 1000
export const ALTO = 24

const fx = (x: number) => (x * ANCHO).toFixed(1)

/** Una raya vertical por corrida, en un solo `d`: 300 marcas son un nodo, no 300. */
export function pathMarcas(xs: readonly number[]): string {
  return xs.map((x) => `M${fx(x)} 5V19`).join('')
}

/** Horas declaradas: una raya más alta y punteada por CSS. */
export function pathFantasmas(xs: readonly number[]): string {
  return xs.map((x) => `M${fx(x)} 1V23`).join('')
}

/** Rótulos del eje de tiempo: cada `cadaH` horas en punto (UTC), dentro de la ventana. */
export function marcasEje(desde: number, hasta: number, cadaH = 3, maxX = 0.93): { x: number; hora: string }[] {
  const out: { x: number; hora: string }[] = []
  const paso = cadaH * HORA_MS
  for (let t = Math.ceil(desde / paso) * paso; t <= hasta; t += paso) {
    // Cerca del borde derecho el rótulo chocaría con el de "ahora".
    if (posicion(t, desde, hasta) > maxX) continue
    const h = new Date(t).getUTCHours()
    out.push({ x: posicion(t, desde, hasta), hora: `${String(h).padStart(2, '0')}:00` })
  }
  return out
}

/** "14:05" en UTC. */
export function horaUTC(at: number): string {
  const d = new Date(at)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
