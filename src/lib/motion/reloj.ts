// Modelo del reloj de sesiones de /log: una fila por día de Bogotá y 24 horas
// de ancho. Cada commit es un punto en su hora; los commits a menos de 90 min
// se funden en una sesión, dibujada desde 30 min antes del primero hasta el
// último, que es exactamente lo que suma la cifra de trabajo profundo. Todo
// sale de las reglas de src/lib/actividad.ts, las mismas que usa el endpoint.
//
// Módulo puro (sin DOM): geometría, ritmo del escaneo y lectura bajo el cursor.

import {
  DIA_MS,
  MINUTO_MS,
  PREVIO_SESION_MIN,
  agruparSesiones,
  cuentaEnVentana,
  diaBogota,
  horaBogota,
  inicioDiaBogota,
  minutosSesion,
  racha,
  redondearMarca,
  type Sesion,
} from '../actividad'

export type ModoResalte = 'semana' | 'mes' | 'commits' | 'racha'

export type SesionReloj = Sesion & { enSemana: boolean }

/** Trozo de una sesión dentro de una fila (una sesión que cruza la medianoche se parte en dos). */
export type Tramo = { fila: number; h0: number; h1: number; previo: boolean; sesion: number }

export type PuntoReloj = {
  fila: number
  h: number
  t: number
  publico: boolean
  /** Índice en la lista pública (para leer su mensaje), -1 si es privado. */
  ref: number
  sesion: number
}

export type ModeloReloj = {
  ahora: number
  /** Día de Bogotá de cada fila, de la más antigua (arriba) a hoy (abajo). */
  dias: number[]
  inicioVentana: number
  /** Hora de la fila 0 en que empieza la ventana de 30 días (antes no se consultó). */
  hInicioVentana: number
  hAhora: number
  sesiones: SesionReloj[]
  tramos: Tramo[]
  puntos: PuntoReloj[]
  horasFila: number[]
  commitsFila: number[]
  porHora: number[]
  filasRacha: Set<number>
  rachaDias: number
  /** Inicio de la ventana de 7 días. */
  inicioSemana: number
}

export const VENTANA_DIAS = 30

/**
 * Construye el reloj a partir de las marcas públicas (con su índice en la
 * bitácora) y las privadas (solo la hora). Las públicas se redondean igual que
 * en el servidor: así las sesiones son las mismas que produjeron las cifras.
 */
export function construirReloj(entrada: {
  publicos: { t: number; ref: number }[]
  privados: number[]
  ahora: number
}): ModeloReloj {
  const { ahora } = entrada
  const inicioVentana = ahora - VENTANA_DIAS * DIA_MS
  const inicioSemana = ahora - 7 * DIA_MS
  const marcas = [
    ...entrada.publicos.map((p) => ({ t: redondearMarca(p.t), publico: true, ref: p.ref })),
    ...entrada.privados.map((t) => ({ t, publico: false, ref: -1 })),
  ]
    .filter((m) => Number.isFinite(m.t))
    .sort((a, b) => a.t - b.t)

  const sesiones: SesionReloj[] = agruparSesiones(marcas.map((m) => m.t)).map((s) => ({
    ...s,
    enSemana: cuentaEnVentana(s, ahora, 7 * DIA_MS),
  }))

  const primerDia = diaBogota(inicioVentana)
  const ultimoDia = diaBogota(ahora)
  const dias = Array.from({ length: ultimoDia - primerDia + 1 }, (_, i) => primerDia + i)
  const filaDe = (t: number) => diaBogota(t) - primerDia
  const n = dias.length

  // Tramos: la sesión se dibuja desde 30 min antes de su primer commit, y se
  // parte en cada medianoche que cruza. Solo las sesiones que cuentan en la
  // ventana de 30 días, que son las que suma la cifra.
  const tramos: Tramo[] = []
  const horasFila = new Array<number>(n).fill(0)
  sesiones.forEach((s, i) => {
    if (!cuentaEnVentana(s, ahora, VENTANA_DIAS * DIA_MS)) return
    const previo = s.inicio - PREVIO_SESION_MIN * MINUTO_MS
    for (const [a, b, esPrevio] of [
      [previo, s.inicio, true],
      [s.inicio, s.fin, false],
    ] as const) {
      let desde = a
      while (desde < b) {
        const dia = diaBogota(desde)
        const corte = Math.min(b, inicioDiaBogota(dia + 1))
        const fila = dia - primerDia
        if (fila >= 0 && fila < n) {
          const h0 = horaBogota(desde)
          const h1 = corte === inicioDiaBogota(dia + 1) ? 24 : horaBogota(corte)
          tramos.push({ fila, h0, h1, previo: esPrevio, sesion: i })
          horasFila[fila] += h1 - h0
        }
        desde = corte
      }
    }
  })

  // Cada punto sabe a qué sesión pertenece: las marcas y las sesiones están
  // ordenadas, así que basta un recorrido.
  const puntos: PuntoReloj[] = []
  const commitsFila = new Array<number>(n).fill(0)
  const porHora = new Array<number>(24).fill(0)
  let si = 0
  for (const m of marcas) {
    while (si < sesiones.length - 1 && m.t > sesiones[si].fin) si++
    const fila = filaDe(m.t)
    if (fila < 0 || fila >= n) continue
    const h = horaBogota(m.t)
    puntos.push({ fila, h, t: m.t, publico: m.publico, ref: m.ref, sesion: si })
    commitsFila[fila]++
    porHora[Math.min(23, Math.floor(h))]++
  }

  const r = racha(
    marcas.map((m) => m.t),
    ahora,
  )
  const filasRacha = new Set<number>()
  if (r.desde !== null) for (let d = r.desde; d < r.desde + r.dias; d++) filasRacha.add(d - primerDia)

  return {
    ahora,
    dias,
    inicioVentana,
    hInicioVentana: horaBogota(inicioVentana),
    hAhora: horaBogota(ahora),
    sesiones,
    tramos,
    puntos,
    horasFila,
    commitsFila,
    porHora,
    filasRacha,
    rachaDias: r.dias,
    inicioSemana,
  }
}

/** Minutos de una sesión tal como los cuenta la cifra (con los 30 previos). */
export const minutosDe = minutosSesion

// ── Medidas ────────────────────────────────────────────────────────────────

export type Medidas = {
  ancho: number
  alto: number
  /** Canal izquierdo (fechas). */
  izq: number
  /** Canal derecho (horas por día). */
  der: number
  /** Eje de horas arriba. */
  arriba: number
  altoFila: number
  /** Separación entre la rejilla y el histograma por hora. */
  hueco: number
  histo: number
  compacto: boolean
}

/**
 * Reparto del lienzo según el ancho disponible. En móvil el canal de fechas y
 * el de horas se estrechan y las filas se aprietan; la hora sigue ocupando el
 * ancho útil completo, que es lo que hay que poder leer.
 */
export function medidasReloj(ancho: number, filas: number): Medidas {
  const compacto = ancho < 640
  const izq = compacto ? 30 : 64
  const der = compacto ? 34 : 86
  const arriba = compacto ? 22 : 28
  const altoFila = compacto ? 10 : ancho < 1000 ? 13 : 15
  const hueco = compacto ? 14 : 18
  const histo = compacto ? 34 : 46
  const alto = arriba + filas * altoFila + hueco + histo + (compacto ? 16 : 20)
  return { ancho, alto, izq, der, arriba, altoFila, hueco, histo, compacto }
}

export const anchoUtil = (m: Medidas) => Math.max(0, m.ancho - m.izq - m.der)
export const xDeHora = (m: Medidas, h: number) => m.izq + (h / 24) * anchoUtil(m)
export const yDeFila = (m: Medidas, fila: number) => m.arriba + fila * m.altoFila
export const baseHisto = (m: Medidas, filas: number) => yDeFila(m, filas) + m.hueco + m.histo

// ── Ritmo del escaneo ──────────────────────────────────────────────────────

/** Duración del escaneo completo, en segundos. */
export const duracionEscaneo = (filas: number) => 2.4 + filas * 0.03

const suave = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/**
 * Posición del cabezal (en filas, puede pasar de la última) a los `t`
 * segundos. Empieza despacio, cruza el mes y frena al llegar a hoy.
 */
export function cabezal(t: number, filas: number): number {
  return suave(t / duracionEscaneo(filas)) * (filas + 1.6)
}

/** Cuánto ha aparecido una fila (puntos) y cuánto se ha fundido (sesiones), 0-1. */
export function faseFila(cab: number, fila: number): { puntos: number; fusion: number } {
  return {
    puntos: Math.max(0, Math.min(1, (cab - fila) / 0.5)),
    fusion: suave((cab - fila - 0.45) / 1.1),
  }
}

// ── Lectura bajo el cursor ─────────────────────────────────────────────────

export type Lectura =
  | { tipo: 'punto'; fila: number; punto: PuntoReloj }
  | { tipo: 'sesion'; fila: number; sesion: number }
  | { tipo: 'fila'; fila: number }
  | null

/**
 * Qué hay bajo el cursor: el commit más cercano si está a menos de `radioPx`,
 * si no la sesión que cubre esa hora, si no la fila. Fuera de la rejilla, nada.
 */
export function leerEn(modelo: ModeloReloj, m: Medidas, x: number, y: number, radioPx = 7): Lectura {
  const fila = Math.floor((y - m.arriba) / m.altoFila)
  if (fila < 0 || fila >= modelo.dias.length || x < m.izq || x > m.ancho - m.der) return null
  const h = ((x - m.izq) / anchoUtil(m)) * 24
  let mejor: PuntoReloj | null = null
  let dMejor = radioPx
  for (const p of modelo.puntos) {
    if (p.fila !== fila) continue
    const d = Math.abs(xDeHora(m, p.h) - x)
    if (d <= dMejor) {
      dMejor = d
      mejor = p
    }
  }
  if (mejor) return { tipo: 'punto', fila, punto: mejor }
  const tramo = modelo.tramos.find((tr) => tr.fila === fila && h >= tr.h0 && h <= tr.h1)
  if (tramo) return { tipo: 'sesion', fila, sesion: tramo.sesion }
  return { tipo: 'fila', fila }
}

/** Formato "13:05" de una hora decimal. */
export function reloj24(h: number): string {
  const min = Math.round(h * 60)
  const hh = Math.floor(min / 60) % 24
  const mm = min % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
