// Geometría y estadística de /engineering. Lo que decide QUÉ se dibuja en la
// página (dónde cae la visita actual frente a los visitantes reales, cómo se
// reparte la carga en fases, qué altura tiene cada barra de la tira de 90
// días) vive aquí, sin DOM ni base de datos: lo usan el servidor (para pintar
// el estado final) y el navegador (para animar hacia él), y se prueba en
// tests/motion-engineering.test.ts.

import { THRESHOLDS, type VitalMetric } from '../vitals'

// ── Distribución de los visitantes reales ────────────────────────────────

/**
 * Tabla de cuantiles equiespaciados (p0, p5, …, p100 con 21 puntos). Es lo que
 * viaja al navegador en vez de las muestras: 21 números por métrica bastan para
 * ubicar una visita con error de un par de puntos porcentuales, y no publican
 * ninguna muestra individual.
 */
export function tablaCuantiles(valores: number[], puntos = 21): number[] {
  if (valores.length === 0 || puntos < 2) return []
  const orden = [...valores].sort((a, b) => a - b)
  const n = orden.length
  const tabla: number[] = []
  for (let i = 0; i < puntos; i++) {
    // Interpolación lineal entre rangos vecinos (el "tipo 7" de R): con pocas
    // muestras evita que la tabla salte en escalones de una muestra entera.
    const pos = (i / (puntos - 1)) * (n - 1)
    const bajo = Math.floor(pos)
    const alto = Math.min(n - 1, bajo + 1)
    tabla.push(orden[bajo]! + (orden[alto]! - orden[bajo]!) * (pos - bajo))
  }
  return tabla
}

/**
 * Qué fracción de los visitantes midió un valor MENOR O IGUAL que `v`, leída
 * de la tabla de cuantiles con interpolación lineal. En estas métricas menos es
 * mejor, así que `1 - fraccionHasta` es "más rápida que el X % de las visitas".
 */
export function fraccionHasta(tabla: number[], v: number): number {
  const k = tabla.length
  if (k < 2 || !Number.isFinite(v)) return 0.5
  if (v < tabla[0]!) return 0
  if (v >= tabla[k - 1]!) return 1
  for (let i = 0; i < k - 1; i++) {
    const a = tabla[i]!
    const b = tabla[i + 1]!
    if (v >= a && v < b) {
      const t = b > a ? (v - a) / (b - a) : 0
      return (i + t) / (k - 1)
    }
  }
  return 1
}

/** Porcentaje entero de visitas que fueron MÁS LENTAS que `v` (0 a 100). */
export function masRapidaQue(tabla: number[], v: number): number {
  return Math.round((1 - fraccionHasta(tabla, v)) * 100)
}

/**
 * Tope de la escala de cada medidor: 1,5 veces el umbral de "pobre". Deja
 * sitio para ver la cola lenta sin que un único valor atípico aplaste la zona
 * buena contra el borde izquierdo.
 */
export function topeEscala(metrica: VitalMetric): number {
  return THRESHOLDS[metrica][1] * 1.5
}

/**
 * Histograma de `cubetas` barras entre 0 y `tope`, normalizado a la barra más
 * alta (0 a 1). Lo que pasa del tope se suma a la última barra: esconder la
 * cola lenta sería maquillar justo el dato que más importa.
 */
export function histograma(valores: number[], tope: number, cubetas: number): number[] {
  const cuentas = new Array<number>(cubetas).fill(0)
  if (valores.length === 0 || tope <= 0 || cubetas <= 0) return cuentas
  for (const v of valores) {
    if (!Number.isFinite(v)) continue
    const i = Math.min(cubetas - 1, Math.max(0, Math.floor((v / tope) * cubetas)))
    cuentas[i]!++
  }
  const max = Math.max(...cuentas)
  return max > 0 ? cuentas.map((c) => c / max) : cuentas
}

/** Posición (0 a 1) de un valor sobre la escala de un medidor, acotada. */
export function enEscala(v: number, tope: number): number {
  if (!Number.isFinite(v) || tope <= 0) return 0
  return Math.min(1, Math.max(0, v / tope))
}

// ── La carga de la visita actual ─────────────────────────────────────────

/** Subconjunto de PerformanceNavigationTiming que hace falta (se prueba sin navegador). */
export type TiemposNavegacion = {
  startTime?: number
  redirectEnd: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  connectEnd: number
  requestStart: number
  responseStart: number
  responseEnd: number
  domContentLoadedEventEnd: number
  loadEventEnd: number
}

export type ClaveFase = 'red' | 'servidor' | 'descarga' | 'render'
export type Fase = { clave: ClaveFase; inicio: number; fin: number }

/**
 * Parte la carga en cuatro tramos legibles para quien no conoce la API:
 *   · red       DNS + conexión + TLS (lo que cuesta llegar)
 *   · servidor  desde que sale la petición hasta el primer byte
 *   · descarga  del primer byte al último del HTML
 *   · render    del HTML completo a la página cargada
 * Los tramos de duración cero se omiten (una conexión reutilizada no tiene red)
 * y ninguno puede empezar antes de que acabe el anterior: con la página
 * servida desde la caché del navegador algunos tiempos llegan en 0 o
 * desordenados, y una barra hacia atrás no significa nada.
 */
export function fasesCarga(n: TiemposNavegacion): Fase[] {
  const cortes: [ClaveFase, number, number][] = [
    ['red', n.domainLookupStart, n.connectEnd],
    ['servidor', n.requestStart, n.responseStart],
    ['descarga', n.responseStart, n.responseEnd],
    ['render', n.responseEnd, n.loadEventEnd || n.domContentLoadedEventEnd],
  ]
  const fases: Fase[] = []
  let cursor = 0
  for (const [clave, a, b] of cortes) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const inicio = Math.max(cursor, a)
    const fin = Math.max(inicio, b)
    if (fin - inicio < 0.5) continue
    fases.push({ clave, inicio, fin })
    cursor = fin
  }
  return fases
}

/**
 * Señal del osciloscopio: bytes que llegaron por la red a lo largo de la carga,
 * suavizados con un núcleo gaussiano y normalizados a 0-1. Cada recurso reparte
 * su peso entre el inicio y el fin de su descarga, así que un archivo grande
 * que tarda se ve como una meseta y no como una aguja. Un recurso sin tamaño
 * conocido (de otro origen sin Timing-Allow-Origin, o servido de caché) cuenta
 * con un peso mínimo: sí ocurrió, y la traza no debe fingir silencio.
 */
export function senalTransferencia(
  recursos: { inicio: number; fin: number; bytes: number }[],
  hasta: number,
  muestras: number,
): number[] {
  const senal = new Array<number>(muestras).fill(0)
  if (hasta <= 0 || muestras < 2) return senal
  const paso = hasta / (muestras - 1)
  const crudo = new Array<number>(muestras).fill(0)
  for (const r of recursos) {
    const peso = Math.max(r.bytes, 1500)
    const a = Math.max(0, Math.min(muestras - 1, Math.floor(r.inicio / paso)))
    const b = Math.max(a, Math.min(muestras - 1, Math.ceil(r.fin / paso)))
    const porMuestra = peso / (b - a + 1)
    for (let i = a; i <= b; i++) crudo[i]! += porMuestra
  }
  // Núcleo de ~1,5 % del ancho: suaviza el serrucho de las cubetas sin borrar
  // la forma de las ráfagas (HTML, luego CSS y JS, luego imágenes).
  const sigma = Math.max(1, muestras * 0.015)
  const radio = Math.ceil(sigma * 3)
  for (let i = 0; i < muestras; i++) {
    let s = 0
    let w = 0
    for (let j = Math.max(0, i - radio); j <= Math.min(muestras - 1, i + radio); j++) {
      const k = Math.exp(-((i - j) ** 2) / (2 * sigma * sigma))
      s += crudo[j]! * k
      w += k
    }
    senal[i] = w > 0 ? s / w : 0
  }
  const max = Math.max(...senal)
  return max > 0 ? senal.map((v) => v / max) : senal
}

/**
 * Duración de la ventana del osciloscopio: lo más tardío entre el LCP y el fin
 * de la carga, con un 12 % de aire a la derecha y redondeado a una escala
 * legible (múltiplos de 250 ms). Con un tope de 12 s: una visita patológica no
 * puede convertir la gráfica en una línea aplastada contra la izquierda.
 */
export function ventanaTraza(...tiempos: (number | null | undefined)[]): number {
  const max = Math.max(0, ...tiempos.filter((t): t is number => typeof t === 'number' && Number.isFinite(t)))
  if (max <= 0) return 1000
  return Math.min(12_000, Math.ceil((max * 1.12) / 250) * 250)
}

/** Recorrido del trazo como `d` de SVG: polilínea sobre una caja de `ancho` × `alto`. */
export function trazoSenal(senal: number[], ancho: number, alto: number, margen = 0.12): string {
  if (senal.length < 2) return ''
  const util = alto * (1 - margen * 2)
  const base = alto - alto * margen
  return senal
    .map((v, i) => {
      const x = (i / (senal.length - 1)) * ancho
      const y = base - v * util
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

// ── Disponibilidad: la tira de 90 días ───────────────────────────────────

export type DiaDisponibilidad = { dia: string; total: number; ok: number; pct: number | null }

/** Clave 'YYYY-MM-DD' en UTC, la misma que usa `monitor_daily`. */
export function claveDia(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Una entrada por día de la ventana, de la más antigua a hoy, aunque ese día
 * no tenga filas. Los días sin sondeos quedan con `pct: null` y se pintan como
 * hueco: el corte real de agosto de 2026 (cuota de Turso agotada) tiene que
 * verse como lo que fue, no rellenarse ni estirar la tira para esconderlo.
 */
export function diasDisponibilidad(
  filas: { dia: string; total: number; ok: number }[],
  hoyMs: number,
  dias: number,
): DiaDisponibilidad[] {
  const porDia = new Map<string, { total: number; ok: number }>()
  for (const f of filas) {
    const prev = porDia.get(f.dia) ?? { total: 0, ok: 0 }
    porDia.set(f.dia, { total: prev.total + Number(f.total), ok: prev.ok + Number(f.ok) })
  }
  const salida: DiaDisponibilidad[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const dia = claveDia(hoyMs - i * 86_400_000)
    const f = porDia.get(dia)
    salida.push({
      dia,
      total: f?.total ?? 0,
      ok: f?.ok ?? 0,
      pct: f && f.total > 0 ? Math.round((f.ok / f.total) * 10000) / 100 : null,
    })
  }
  return salida
}

/**
 * Altura de cada barra de la tira. Una escala lineal de 0 a 100 % dejaría
 * todas las barras iguales (casi todo es 99,x %); esta amplifica lo que
 * importa: 100 % llena, 99 % baja al 70 %, y de 95 % para abajo queda en el
 * suelo de 18 %, que sigue siendo visible pero grita.
 */
export function alturaDia(pct: number | null): number {
  if (pct == null) return 0
  if (pct >= 100) return 1
  if (pct <= 95) return 0.18
  // 95 → 0,18 ; 99 → 0,7 ; 100 → 1 (tramo lineal a trozos)
  return pct >= 99 ? 0.7 + (pct - 99) * 0.3 : 0.18 + ((pct - 95) / 4) * 0.52
}

/**
 * Silueta rellena de un histograma (la "montaña" de visitantes de cada fila del
 * instrumento): una curva por el centro de cada barra, cerrada contra el suelo.
 * Los extremos arrancan y mueren en el suelo para que la forma no empiece con
 * un escalón vertical en el borde.
 */
export function areaHistograma(alturas: number[], ancho: number, alto: number): string {
  const n = alturas.length
  if (n === 0) return ''
  const pts = alturas.map((h, i) => [((i + 0.5) / n) * ancho, alto - Math.max(0, Math.min(1, h)) * alto * 0.92] as const)
  let d = `M0 ${alto} L${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`
  // Curva cuadrática por los puntos medios: suave, sin sobrepasar la altura
  // real de ninguna barra (una spline cúbica sí se pasaría en los picos).
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1]!
    const [x1, y1] = pts[i]!
    d += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`
  }
  const [xu, yu] = pts[n - 1]!
  d += ` L${xu.toFixed(1)} ${yu.toFixed(1)} L${ancho} ${alto} Z`
  return d
}

/** Bytes acumulados que llegaron hasta el instante `t` (para la lectura del cursor). */
export function bytesHasta(recursos: { inicio: number; fin: number; bytes: number }[], t: number): number {
  let total = 0
  for (const r of recursos) {
    if (t >= r.fin) total += r.bytes
    else if (t > r.inicio && r.fin > r.inicio) total += (r.bytes * (t - r.inicio)) / (r.fin - r.inicio)
  }
  return total
}
