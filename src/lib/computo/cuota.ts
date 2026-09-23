// Cuota gratis de Vercel compartida por todos los proyectos de la cuenta.
//
// En Hobby el cómputo no se factura: se corta. La cuota es UNA para toda la
// cuenta, así que el riesgo no es una factura sino que un proyecto con mucho
// tráfico apague a los demás. Este módulo responde cuánto de esa bolsa lleva
// consumido cada proyecto medido, a qué ritmo, y cuándo se agotaría.
//
// Módulo PURO e isomorfo: lo usan el cron que avisa, la página del panel y el
// cotizador del navegador. Las cuotas salen del catálogo de `infra-stack.ts`,
// el mismo que simula `/admin/infra`, para que no haya dos listas de límites.

import { DIMENSIONES, enUnidades, unidadDe, type Dimension, type UsoComputo } from './calculo'
import { ETIQUETAS_DIMENSION } from './tarifas'
import { clavePeriodo, rangoPeriodo, type ClavePeriodo } from './periodo'
import { VERCEL } from '../infra-stack'

const DIA_MS = 86_400_000

/** Cuota mensual del plan Hobby, en la unidad de facturación de cada dimensión. */
export const CUOTA_HOBBY: Record<Dimension, number> = (() => {
  const incluido = VERCEL.planes.find((p) => p.id === 'hobby')?.incluido ?? {}
  const r = {} as Record<Dimension, number>
  for (const d of DIMENSIONES) r[d] = incluido[d] ?? 0
  return r
})()

/**
 * Dimensiones que el medidor ve solo en parte: no ve lo que el CDN sirve sin
 * despertar la función (estáticos, aciertos de caché). Su consumo real es
 * MAYOR que el medido, y la vista lo tiene que decir.
 */
export const COTA_INFERIOR: ReadonlySet<Dimension> = new Set<Dimension>(['transferencia', 'edgeRequests'])

/**
 * Observación mínima para proyectar a fin de mes. Con menos, un solo día con
 * un pico multiplicado por treinta es ruido que dispara avisos falsos.
 */
export const OBSERVACION_MIN_MS = 3 * DIA_MS

/** Consumo de un proyecto en el mes en curso, tal como sale de la base. */
export interface ConsumoMedido {
  projectId: number
  nombre: string
  uso: UsoComputo
  /** Primera hora con datos en el mes, epoch ms. */
  desde: number
}

export interface ParteProyecto {
  projectId: number
  nombre: string
  consumido: number
  /** Qué parte de la cuota TOTAL se come este proyecto. */
  pctCuota: number
}

export interface EstadoDimension {
  dimension: Dimension
  etiqueta: string
  unidad: string
  cuota: number
  consumido: number
  pct: number
  proyectado: number
  pctProyectado: number
  agotada: boolean
  /** Cuándo se agotaría al ritmo actual, epoch ms, si es antes de fin de mes. */
  agotaEn: number | null
  cotaInferior: boolean
  /** De mayor a menor consumo. */
  proyectos: ParteProyecto[]
}

export interface EstadoCuota {
  periodo: ClavePeriodo
  ahora: number
  /** Inicio de lo observado: el día 1 o la primera medición, lo que sea después. */
  desde: number | null
  finMes: number
  proyeccionFiable: boolean
  dimensiones: EstadoDimension[]
  /** La dimensión que se agota primero (mayor proyección), o null si no hay consumo. */
  manda: Dimension | null
}

const pctDe = (valor: number, tope: number) => (tope > 0 ? (valor / tope) * 100 : 0)

/**
 * Estado de la cuota compartida en el mes de `ahora`.
 *
 * La proyección usa el ritmo OBSERVADO y no el del mes entero: si el medidor
 * se instaló el día 20, dividir por 20 días diluiría el ritmo real a menos de
 * la mitad. Lo que se consumió antes de instalarlo no se ve, y eso también es
 * una razón para leer el porcentaje como cota inferior.
 */
export function estadoCuota(consumos: ConsumoMedido[], ahora: number, cuota: Record<Dimension, number> = CUOTA_HOBBY): EstadoCuota {
  const periodo = clavePeriodo(ahora)
  const { desde: inicioMes, hasta: finMes } = rangoPeriodo(periodo)
  const desdes = consumos.map((c) => c.desde).filter((t) => Number.isFinite(t))
  const desde = desdes.length > 0 ? Math.max(inicioMes, Math.min(...desdes)) : null
  const observado = desde === null ? 0 : Math.max(0, ahora - desde)
  const restante = Math.max(0, finMes - ahora)
  const enUnidad = consumos.map((c) => ({ c, u: enUnidades(c.uso) }))

  const dimensiones = DIMENSIONES.map((dimension): EstadoDimension => {
    const tope = cuota[dimension]
    const consumido = enUnidad.reduce((s, p) => s + p.u[dimension], 0)
    const ritmo = observado > 0 ? consumido / observado : 0
    const proyectado = consumido + ritmo * restante
    const agotada = tope > 0 && consumido >= tope
    let agotaEn: number | null = null
    if (!agotada && tope > 0 && ritmo > 0) {
      const t = ahora + (tope - consumido) / ritmo
      if (t < finMes) agotaEn = t
    }
    return {
      dimension,
      etiqueta: ETIQUETAS_DIMENSION[dimension],
      unidad: unidadDe(dimension),
      cuota: tope,
      consumido,
      pct: pctDe(consumido, tope),
      proyectado,
      pctProyectado: pctDe(proyectado, tope),
      agotada,
      agotaEn,
      cotaInferior: COTA_INFERIOR.has(dimension),
      proyectos: enUnidad
        .map((p) => ({ projectId: p.c.projectId, nombre: p.c.nombre, consumido: p.u[dimension], pctCuota: pctDe(p.u[dimension], tope) }))
        .filter((p) => p.consumido > 0)
        .sort((a, b) => b.consumido - a.consumido),
    }
  })

  const conConsumo = dimensiones.filter((d) => d.consumido > 0)
  const manda = conConsumo.length > 0
    ? conConsumo.reduce((a, b) => (b.pctProyectado > a.pctProyectado ? b : a)).dimension
    : null

  return {
    periodo,
    ahora,
    desde,
    finMes,
    proyeccionFiable: observado >= OBSERVACION_MIN_MS,
    dimensiones,
    manda,
  }
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

/** Umbrales de consumo que avisan. El 70 da margen para actuar, no para enterarse. */
export const UMBRALES = [70, 90, 100] as const

/** Lo ya avisado en el mes, para no repetir. Vive en `app_settings`. */
export interface EstadoAvisos {
  periodo: ClavePeriodo
  /** Dimensión → mayor umbral de consumo ya avisado. */
  consumo: Partial<Record<Dimension, number>>
  /** Dimensiones cuya proyección de agotarse ya se avisó. */
  proyeccion: Partial<Record<Dimension, true>>
}

export interface AvisoCuota {
  tipo: 'consumo' | 'proyeccion'
  dimension: Dimension
  etiqueta: string
  unidad: string
  umbral: number
  consumido: number
  cuota: number
  pct: number
  pctProyectado: number
  agotaEn: number | null
  cotaInferior: boolean
}

const aviso = (tipo: AvisoCuota['tipo'], umbral: number, d: EstadoDimension): AvisoCuota => ({
  tipo,
  dimension: d.dimension,
  etiqueta: d.etiqueta,
  unidad: d.unidad,
  umbral,
  consumido: d.consumido,
  cuota: d.cuota,
  pct: d.pct,
  pctProyectado: d.pctProyectado,
  agotaEn: d.agotaEn,
  cotaInferior: d.cotaInferior,
})

/**
 * Qué avisar ahora y con qué estado quedarse.
 *
 * Solo el umbral MÁS ALTO recién cruzado: si el consumo salta de 50 a 95 entre
 * dos revisiones, avisar 70 y 90 a la vez es ruido. La proyección avisa una vez
 * por mes y solo mientras el consumo real no haya llegado al 100 %, porque ese
 * aviso ya dice todo lo que la proyección diría.
 */
export function decidirAvisos(estado: EstadoCuota, previo: EstadoAvisos | null): { avisos: AvisoCuota[]; estado: EstadoAvisos } {
  // Mes nuevo, avisos nuevos: la cuota se reinicia y el 70 % vuelve a importar.
  const base: EstadoAvisos = previo && previo.periodo === estado.periodo
    ? previo
    : { periodo: estado.periodo, consumo: {}, proyeccion: {} }
  const siguiente: EstadoAvisos = { periodo: estado.periodo, consumo: { ...base.consumo }, proyeccion: { ...base.proyeccion } }
  const avisos: AvisoCuota[] = []

  for (const d of estado.dimensiones) {
    const alcanzado = [...UMBRALES].reverse().find((u) => d.pct >= u)
    if (alcanzado !== undefined && alcanzado > (base.consumo[d.dimension] ?? 0)) {
      avisos.push(aviso('consumo', alcanzado, d))
      siguiente.consumo[d.dimension] = alcanzado
    }
    if (estado.proyeccionFiable && d.pctProyectado >= 100 && d.pct < 100 && !base.proyeccion[d.dimension]) {
      avisos.push(aviso('proyeccion', 100, d))
      siguiente.proyeccion[d.dimension] = true
    }
  }
  return { avisos, estado: siguiente }
}

/** Lee el estado guardado. Cualquier cosa rara vale como "nada avisado". */
export function parseAvisos(raw: string | null | undefined): EstadoAvisos | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<EstadoAvisos>
    if (!v || typeof v.periodo !== 'string') return null
    const consumo: Partial<Record<Dimension, number>> = {}
    const proyeccion: Partial<Record<Dimension, true>> = {}
    for (const d of DIMENSIONES) {
      const c = v.consumo?.[d]
      if (typeof c === 'number' && Number.isFinite(c)) consumo[d] = c
      if (v.proyeccion?.[d] === true) proyeccion[d] = true
    }
    return { periodo: v.periodo, consumo, proyeccion }
  } catch {
    return null
  }
}

const fmtNum = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: n < 10 ? 2 : 0 }).format(n)
const fmtDia = (t: number) =>
  new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(t))

/** Una línea por aviso, en el idioma de quien lee el celular. */
export function lineaAviso(a: AvisoCuota): string {
  const cota = a.cotaInferior ? ' (sin contar estáticos: el real es mayor)' : ''
  if (a.tipo === 'proyeccion') {
    const cuando = a.agotaEn !== null ? `se agota hacia el ${fmtDia(a.agotaEn)}` : 'no llega a fin de mes'
    return `${a.etiqueta}: al ritmo actual ${cuando} (proyección ${Math.round(a.pctProyectado)} %)${cota}`
  }
  const estado = a.umbral >= 100 ? 'cuota AGOTADA' : `${Math.round(a.pct)} % de la cuota`
  return `${a.etiqueta}: ${estado}, ${fmtNum(a.consumido)} de ${fmtNum(a.cuota)} ${a.unidad}${cota}`
}

/** Título, cuerpo y prioridad ntfy (1-5) para un conjunto de avisos. */
export function mensajeAvisos(avisos: AvisoCuota[]): { titulo: string; cuerpo: string; prioridad: number } {
  const grave = avisos.some((a) => a.umbral >= 100 || a.tipo === 'proyeccion' || a.umbral >= 90)
  const titulo = avisos.length === 1
    ? `Cuota gratis de Vercel: ${avisos[0].etiqueta.toLowerCase()}`
    : `Cuota gratis de Vercel: ${avisos.length} avisos`
  const cuerpo = [
    ...avisos.map(lineaAviso),
    'Si se agota, Vercel limita TODOS los proyectos de la cuenta hasta el mes siguiente.',
  ].join('\n')
  return { titulo, cuerpo, prioridad: grave ? 4 : 3 }
}
