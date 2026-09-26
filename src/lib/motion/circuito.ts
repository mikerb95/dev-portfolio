// Guion y geometría del hero de /tools: el "circuito de operación".
//
// La pieza dibuja el sitio con sus tres franjas (middleware, rutas y /admin),
// lo que entra desde fuera (tráfico, despliegues, monitores) y lo que sale
// (el celular, /status, el portal del cliente). Sobre ese mapa se reproducen
// cuatro escenarios en bucle, y cada uno cruza las herramientas que intervienen
// de verdad en ese caso: nada viaja por un cable que no exista en el código.
//   · caos: un flag rompe /tienda, el monitor lo ve, la alerta llega y el pánico
//     lo apaga (06 → 01)
//   · deploy roto: el health check falla y el pipeline revierte solo (05)
//   · sondeo hostil: gris hasta que el clasificador lo inspecciona (07)
//   · proyecto nuevo: un servicio alimenta el P&L y la bóveda a la vez, porque
//     costo y credenciales viven en la misma fila (02, 04, 03)
//
// Los textos de cada escenario viven en el diccionario (tools.motion.circuito);
// aquí solo queda el guion: quién, cuándo y hacia dónde.
//
// Módulo puro, probado en tests/motion-tools.test.ts.

export const NODOS = [
  // Entradas (columna izquierda en escritorio, fila de arriba en móvil).
  'internet',
  'ci',
  'monitor',
  // Franjas del sitio.
  'siem',
  'caos',
  'r-home',
  'r-tienda',
  'r-api',
  'admin',
  'pnl',
  'seg',
  'boveda',
  // Salidas.
  'ntfy',
  'status',
  'portal',
] as const

export type NodoId = (typeof NODOS)[number]

/** Caso de estudio de la página que representa cada estación del circuito. */
export const CASO_DE: Partial<Record<NodoId, string>> = {
  monitor: '01',
  pnl: '02',
  seg: '03',
  boveda: '04',
  ci: '05',
  caos: '06',
  siem: '07',
}

/** Color del paquete: el mismo código que /security (gris hasta inspeccionar). */
export type Tono = 'neutro' | 'dato' | 'ok' | 'alerta' | 'error'
export type Estado = 'reposo' | 'activo' | 'ok' | 'alerta' | 'error'

export type Paso =
  | { t: number; tipo: 'viaje'; de: NodoId; a: NodoId; tono: Tono; dur?: number; frena?: boolean }
  | {
      t: number
      tipo: 'estado'
      nodo: NodoId
      estado: Estado
      /** Clave de `tools.motion.circuito.lecturas`. */
      lectura?: string
      /** Lectura literal (versiones, códigos HTTP): no se traduce. */
      crudo?: string
    }
  | { t: number; tipo: 'log'; nodo: NodoId; linea: number; tono: Tono }

export type EscenarioId = 'caos' | 'deploy' | 'sondeo' | 'proyecto'

export type Escenario = {
  id: EscenarioId
  /** Casos de estudio que protagonizan el escenario. */
  casos: string[]
  duracion: number
  pasos: Paso[]
}

/** Duración por defecto de un viaje, en segundos. */
export const DUR_VIAJE = 0.8

const v = (t: number, de: NodoId, a: NodoId, tono: Tono, extra: { dur?: number; frena?: boolean } = {}): Paso => ({
  t,
  tipo: 'viaje',
  de,
  a,
  tono,
  ...extra,
})
const e = (t: number, nodo: NodoId, estado: Estado, lectura?: { k?: string; c?: string }): Paso => ({
  t,
  tipo: 'estado',
  nodo,
  estado,
  ...(lectura?.k ? { lectura: lectura.k } : {}),
  ...(lectura?.c ? { crudo: lectura.c } : {}),
})
const l = (t: number, nodo: NodoId, linea: number, tono: Tono): Paso => ({ t, tipo: 'log', nodo, linea, tono })

export const ESCENARIOS: Escenario[] = [
  {
    id: 'caos',
    casos: ['06', '01'],
    duracion: 13.4,
    pasos: [
      l(0, 'caos', 0, 'alerta'),
      e(0, 'caos', 'alerta', { k: 'flagActivo' }),
      v(0.3, 'caos', 'r-tienda', 'error'),
      e(1.1, 'r-tienda', 'error', { c: '500' }),
      v(1.8, 'monitor', 'r-tienda', 'dato'),
      v(2.6, 'r-tienda', 'monitor', 'error'),
      l(3.4, 'monitor', 1, 'error'),
      e(3.4, 'monitor', 'error', { k: 'caida' }),
      l(4.0, 'monitor', 2, 'error'),
      // La alerta no sale del monitor: la manda el cron que corre en /api, en
      // el mismo sitio. Por eso el paquete pasa por la ruta antes del celular.
      v(4.4, 'monitor', 'r-api', 'dato'),
      v(5.2, 'r-api', 'ntfy', 'error'),
      e(6.0, 'ntfy', 'error', { k: 'alertaRecibida' }),
      l(6.0, 'ntfy', 3, 'error'),
      v(6.4, 'r-api', 'status', 'error'),
      e(7.2, 'status', 'alerta', { k: 'incidente' }),
      l(7.2, 'status', 4, 'alerta'),
      l(8.2, 'caos', 5, 'ok'),
      e(8.2, 'caos', 'reposo'),
      v(8.4, 'caos', 'r-tienda', 'ok'),
      e(9.2, 'r-tienda', 'reposo'),
      v(9.4, 'monitor', 'r-tienda', 'dato'),
      v(10.2, 'r-tienda', 'monitor', 'ok'),
      e(11.0, 'monitor', 'ok', { k: 'arriba' }),
      l(11.0, 'monitor', 6, 'ok'),
      e(11.0, 'ntfy', 'reposo'),
      e(11.0, 'status', 'reposo'),
      l(11.8, 'monitor', 7, 'ok'),
      e(12.8, 'monitor', 'reposo'),
    ],
  },
  {
    id: 'deploy',
    casos: ['05'],
    duracion: 11.6,
    pasos: [
      l(0, 'ci', 0, 'dato'),
      e(0, 'ci', 'activo', { c: 'push' }),
      v(0.9, 'ci', 'r-home', 'dato'),
      l(0.9, 'ci', 1, 'dato'),
      e(1.7, 'r-home', 'activo', { c: 'v1.5' }),
      e(1.7, 'ci', 'activo', { c: 'v1.5' }),
      // El health check es contra el sitio real, no contra un mock: ida y vuelta.
      v(2.5, 'ci', 'r-home', 'dato'),
      v(3.3, 'r-home', 'ci', 'error'),
      l(4.1, 'ci', 2, 'error'),
      e(4.1, 'r-home', 'error', { c: 'v1.5 ✕' }),
      e(4.1, 'ci', 'error', { k: 'healthFalla' }),
      l(5.0, 'ci', 3, 'ok'),
      v(5.0, 'ci', 'r-home', 'ok'),
      e(5.8, 'r-home', 'ok', { c: 'v1.4' }),
      e(5.8, 'ci', 'ok', { c: 'v1.4' }),
      v(6.4, 'ci', 'r-home', 'dato'),
      v(7.2, 'r-home', 'ci', 'ok'),
      l(8.0, 'ci', 4, 'ok'),
      v(8.5, 'ci', 'admin', 'dato'),
      e(9.3, 'admin', 'activo', { k: 'runRegistrado' }),
      l(9.3, 'ci', 5, 'dato'),
      e(10.8, 'ci', 'reposo'),
      e(10.8, 'r-home', 'reposo'),
      e(10.8, 'admin', 'reposo'),
    ],
  },
  {
    id: 'sondeo',
    casos: ['07'],
    duracion: 12.4,
    pasos: [
      // Todo llega gris: una petición hostil no se distingue de una visita
      // hasta que el clasificador la inspecciona (el mismo lenguaje del hero de
      // /security).
      v(0, 'internet', 'siem', 'neutro'),
      v(0.8, 'siem', 'r-home', 'ok'),
      e(1.6, 'r-home', 'ok'),
      l(1.6, 'internet', 0, 'ok'),
      e(2.2, 'r-home', 'reposo'),
      v(2.2, 'internet', 'siem', 'neutro'),
      e(3.0, 'siem', 'alerta', { k: 'clasificando' }),
      l(3.0, 'siem', 1, 'neutro'),
      l(3.5, 'siem', 2, 'alerta'),
      v(4.0, 'internet', 'siem', 'neutro', { dur: 0.6, frena: true }),
      v(4.2, 'internet', 'siem', 'neutro', { dur: 0.6, frena: true }),
      v(4.4, 'internet', 'siem', 'neutro', { dur: 0.6, frena: true }),
      e(5.0, 'siem', 'alerta', { c: '429' }),
      l(5.0, 'siem', 3, 'alerta'),
      v(5.8, 'internet', 'siem', 'neutro', { frena: true }),
      e(6.6, 'siem', 'error', { k: 'bloqueada' }),
      l(6.6, 'siem', 4, 'error'),
      l(7.6, 'siem', 5, 'error'),
      e(7.6, 'siem', 'error', { k: 'bloqueo1h' }),
      // Como la alerta del monitor: la manda el cron del sitio, no la capa.
      v(8.6, 'siem', 'r-api', 'dato'),
      v(9.4, 'r-api', 'ntfy', 'alerta'),
      e(10.2, 'ntfy', 'alerta', { k: 'anomalia' }),
      l(10.2, 'ntfy', 6, 'alerta'),
      e(11.6, 'siem', 'reposo'),
      e(11.6, 'ntfy', 'reposo'),
    ],
  },
  {
    id: 'proyecto',
    casos: ['02', '04', '03'],
    duracion: 10.6,
    pasos: [
      e(0, 'pnl', 'activo', { k: 'registrando' }),
      l(0, 'pnl', 0, 'dato'),
      e(1.3, 'pnl', 'ok', { k: 'margen' }),
      l(1.3, 'pnl', 1, 'ok'),
      // Costo y credenciales son la misma fila (project_services): el mismo
      // alta que mueve el P&L deja un secreto que entra cifrado.
      e(2.3, 'boveda', 'activo', { k: 'cifrando' }),
      l(2.3, 'boveda', 2, 'dato'),
      e(3.5, 'boveda', 'ok', { c: 'iv:tag:ct' }),
      e(4.2, 'seg', 'activo', { k: 'hitoNuevo' }),
      v(4.2, 'seg', 'portal', 'dato'),
      l(4.2, 'seg', 3, 'dato'),
      e(5.0, 'portal', 'activo', { k: 'hitoNuevo' }),
      v(6.0, 'monitor', 'portal', 'ok', { dur: 1 }),
      l(6.0, 'monitor', 4, 'ok'),
      e(7.0, 'portal', 'ok', { k: 'uptime' }),
      e(9.2, 'pnl', 'reposo'),
      e(9.2, 'boveda', 'reposo'),
      e(9.2, 'seg', 'reposo'),
      e(9.2, 'portal', 'reposo'),
    ],
  },
]

/** Cuántas líneas de bitácora usa cada escenario (para cuadrar el diccionario). */
export function lineasDe(esc: Escenario): number {
  let max = -1
  for (const p of esc.pasos) if (p.tipo === 'log') max = Math.max(max, p.linea)
  return max + 1
}

/** Claves de lectura que usa el guion (para cuadrar el diccionario). */
export function lecturasUsadas(): string[] {
  const s = new Set<string>()
  for (const esc of ESCENARIOS) for (const p of esc.pasos) if (p.tipo === 'estado' && p.lectura) s.add(p.lectura)
  return [...s].sort()
}

/**
 * Cables del mapa: la unión, sin dirección, de todos los viajes del guion. Se
 * dibujan tenues siempre y los paquetes corren por encima, así que un paquete
 * nunca aparece cruzando por donde no hay cable.
 */
export function cables(escenarios: Escenario[] = ESCENARIOS): [NodoId, NodoId][] {
  const vistos = new Map<string, [NodoId, NodoId]>()
  for (const esc of escenarios)
    for (const p of esc.pasos) {
      if (p.tipo !== 'viaje') continue
      const [a, b] = p.de < p.a ? [p.de, p.a] : [p.a, p.de]
      vistos.set(`${a}|${b}`, [a, b])
    }
  return [...vistos.values()]
}

/** Última línea de bitácora que ya se escribió en el segundo `t` del escenario. */
export function lineasHasta(esc: Escenario, t: number): { linea: number; tono: Tono; nodo: NodoId }[] {
  return esc.pasos
    .filter((p): p is Extract<Paso, { tipo: 'log' }> => p.tipo === 'log' && p.t <= t)
    .map((p) => ({ linea: p.linea, tono: p.tono, nodo: p.nodo }))
}

/** "15:00" a partir de segundos. */
export function mmss(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ── Geometría de los cables ───────────────────────────────────────────────

export type Caja = { x: number; y: number; w: number; h: number }
export type Punto = { x: number; y: number }

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Conector ortogonal entre dos cajas, como una pista de circuito: sale por el
 * lado de `a` que mira hacia `b`, gira a mitad de camino y entra por el lado de
 * `b` que mira hacia `a`. El eje lo decide la distancia dominante, así que el
 * mismo mapa sirve en columnas (escritorio) y en filas (móvil) sin rutas
 * escritas a mano.
 */
export function conector(a: Caja, b: Caja): Punto[] {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  // Si las cajas se solapan en un eje, cruzar por ese eje sería salir por un
  // lado para entrar por dentro de la otra: se usa el otro.
  const solapanX = a.x < b.x + b.w && b.x < a.x + a.w
  const solapanY = a.y < b.y + b.h && b.y < a.y + a.h
  const horizontal = solapanY ? true : solapanX ? false : Math.abs(dx) >= Math.abs(dy)

  if (horizontal) {
    const s = { x: dx >= 0 ? a.x + a.w : a.x, y: ca.y }
    const f = { x: dx >= 0 ? b.x : b.x + b.w, y: cb.y }
    if (Math.abs(s.y - f.y) < 0.5) return [s, { x: f.x, y: s.y }]
    const mx = (s.x + f.x) / 2
    return [s, { x: mx, y: s.y }, { x: mx, y: f.y }, f]
  }
  const s = { x: ca.x, y: dy >= 0 ? a.y + a.h : a.y }
  const f = { x: cb.x, y: dy >= 0 ? b.y : b.y + b.h }
  if (Math.abs(s.x - f.x) < 0.5) return [s, { x: s.x, y: f.y }]
  const my = (s.y + f.y) / 2
  return [s, { x: s.x, y: my }, { x: f.x, y: my }, f]
}

/**
 * Atributo `d` de una polilínea ortogonal con las esquinas redondeadas. El
 * radio se recorta en los tramos cortos: un codo más grande que su tramo
 * dibuja un rizo hacia atrás.
 */
export function rutaRedondeada(puntos: Punto[], radio = 10): string {
  if (puntos.length === 0) return ''
  let d = `M${r1(puntos[0].x)} ${r1(puntos[0].y)}`
  for (let i = 1; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1]
    const p = puntos[i]
    const p1 = puntos[i + 1]
    const l0 = Math.hypot(p.x - p0.x, p.y - p0.y)
    const l1 = Math.hypot(p1.x - p.x, p1.y - p.y)
    const r = Math.min(radio, l0 / 2, l1 / 2)
    if (r < 0.5) {
      d += ` L${r1(p.x)} ${r1(p.y)}`
      continue
    }
    const a = { x: p.x - ((p.x - p0.x) / l0) * r, y: p.y - ((p.y - p0.y) / l0) * r }
    const b = { x: p.x + ((p1.x - p.x) / l1) * r, y: p.y + ((p1.y - p.y) / l1) * r }
    d += ` L${r1(a.x)} ${r1(a.y)} Q${r1(p.x)} ${r1(p.y)} ${r1(b.x)} ${r1(b.y)}`
  }
  const u = puntos[puntos.length - 1]
  return d + ` L${r1(u.x)} ${r1(u.y)}`
}
