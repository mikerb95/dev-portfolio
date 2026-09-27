// Datos y geometría de las piezas de /lab bajo el hero: el ciclo de hallazgos
// y la escalera de carga. Todo sale de los agregados que la página ya lee; aquí
// no se inventa ninguna cifra, solo se decide dónde dibujarla.
//
// Módulo puro, probado en tests/motion-lab.test.ts.

import type { LoadStep } from '../lab/load-test'

// ── Ciclo de hallazgos ─────────────────────────────────────────────────────

export type Conteo = { open: number; resolved: number; accepted: number }

/**
 * Un punto por hallazgo mientras quepan; si no, cada punto vale varios y la
 * pieza lo dice. Una categoría con hallazgos nunca se queda sin punto: un
 * "aceptado" que desaparece por redondeo es justo el que hay que explicar.
 */
export function puntosCiclo(c: Conteo, max = 60): { porPunto: number; puntos: Conteo } {
  const total = c.open + c.resolved + c.accepted
  const porPunto = Math.max(1, Math.ceil(total / max))
  const a = (n: number) => (n > 0 ? Math.max(1, Math.round(n / porPunto)) : 0)
  return { porPunto, puntos: { open: a(c.open), resolved: a(c.resolved), accepted: a(c.accepted) } }
}

// ── Escalera de carga ──────────────────────────────────────────────────────

export type Lienzo = { ancho: number; alto: number; izq: number; der: number; arriba: number; abajo: number }
/** Medidas del lienzo: escritorio y una variante propia para móvil (no la de escritorio encogida). */
export const ESCALERA: Lienzo = { ancho: 720, alto: 280, izq: 46, der: 58, arriba: 30, abajo: 40 }
export const ESCALERA_MOVIL: Lienzo = { ancho: 360, alto: 280, izq: 34, der: 44, arriba: 30, abajo: 40 }
/** Techo del eje de latencia: el timeout de k6 en los perfiles del repo es 10 s. */
const P95_MAX_MS = 12_000
const P95_MIN_MS = 10

export type Escalon = {
  x: number
  ancho: number
  carga: number
  unidad: 'vus' | 'rps'
  /** Alto del escalón ofrecido y del servido (y = arriba de la barra). */
  yOfrecido: number
  yServido: number | null
  servido: number | null
  p95: number | null
  yP95: number | null
  estado: LoadStep['estado']
}

export type Escalera = {
  escalones: Escalon[]
  base: number
  /** Marcas del eje izquierdo (carga por segundo). */
  marcas: { valor: number; y: number }[]
  /** Marcas del eje derecho (p95, escala logarítmica). */
  marcasP95: { ms: number; y: number }[]
  /** Índice del primer escalón roto, o null si no se rompió. */
  quiebre: number | null
  /** Índice del último escalón sano antes del quiebre. */
  sostenido: number | null
  /** Centro de la columna de recuperación (a la derecha del último escalón). */
  xRecuperacion: number
  anchoColumna: number
  lineaP95: string
}

const bonito = (n: number) => {
  if (n <= 0) return 10
  const p = 10 ** Math.floor(Math.log10(n))
  const m = n / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

export function escalera(pasos: LoadStep[], lienzo: Lienzo = ESCALERA): Escalera {
  const { ancho, alto, izq, der, arriba, abajo } = lienzo
  const plotW = ancho - izq - der
  const base = alto - abajo
  const plotH = base - arriba
  // Una columna más a la derecha: la recuperación ocurre después de la
  // escalera y necesita su propio sitio en el eje del tiempo.
  const columnas = pasos.length + 1
  const col = plotW / columnas
  const tope = bonito(Math.max(1, ...pasos.map((p) => Math.max(p.carga, p.exitosasRps ?? 0))) * 1.05)
  const yDe = (v: number) => base - (Math.max(0, v) / tope) * plotH
  const log = (ms: number) => Math.log10(Math.min(P95_MAX_MS, Math.max(P95_MIN_MS, ms)))
  const yP95 = (ms: number) => base - ((log(ms) - log(P95_MIN_MS)) / (log(P95_MAX_MS) - log(P95_MIN_MS))) * plotH

  const escalones: Escalon[] = pasos.map((p, i) => ({
    x: izq + i * col + col * 0.2,
    ancho: col * 0.6,
    carga: p.carga,
    unidad: p.unidad,
    yOfrecido: yDe(p.carga),
    servido: p.exitosasRps,
    yServido: p.exitosasRps == null ? null : yDe(p.exitosasRps),
    p95: p.p95,
    yP95: p.p95 == null ? null : yP95(p.p95),
    estado: p.estado,
  }))

  const quiebreI = pasos.findIndex((p) => p.estado === 'roto')
  const quiebre = quiebreI >= 0 ? quiebreI : null
  const antes = quiebre ?? pasos.length
  let sostenido: number | null = null
  for (let i = 0; i < antes; i++) if (pasos[i].estado === 'ok') sostenido = i

  const puntos = escalones.filter((e) => e.yP95 != null).map((e) => `${(e.x + e.ancho / 2).toFixed(1)},${e.yP95!.toFixed(1)}`)
  return {
    escalones,
    base,
    marcas: [0, tope / 2, tope].map((valor) => ({ valor, y: yDe(valor) })),
    marcasP95: [10, 100, 1000, 10_000].map((ms) => ({ ms, y: yP95(ms) })),
    quiebre,
    sostenido,
    xRecuperacion: izq + pasos.length * col + col / 2,
    anchoColumna: col,
    lineaP95: puntos.length ? `M${puntos.join(' L')}` : '',
  }
}

/** Lee `steps_json` sin confiar en su forma: una fila vieja o rota no tumba la página. */
export function leerEscalones(json: string | null): LoadStep[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    if (!Array.isArray(v)) return []
    return v.filter(
      (p): p is LoadStep =>
        p && typeof p.carga === 'number' && (p.unidad === 'vus' || p.unidad === 'rps') && ['ok', 'degradado', 'roto'].includes(p.estado),
    )
  } catch {
    return []
  }
}
