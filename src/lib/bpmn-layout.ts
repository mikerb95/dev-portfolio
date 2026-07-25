// Motor de layout BPMN: convierte un modelo de proceso (carriles, nodos con
// coordenadas de grilla y flujos) en geometría SVG lista para pintar.
//
// Por qué propio y no bpmn-js: la única forma de dibujar notación BPMN real
// sin bpmn-js (~500 KB de diagram-js) era generar el SVG nosotros. A cambio de
// escribir el ruteo, el diagrama queda sin dependencias, con los mismos tokens
// de color del sitio y sin JavaScript en el cliente — el SVG sale ya renderizado
// desde el servidor.
//
// Módulo PURO a propósito: no importa Astro ni la BD, así los tests pueden
// verificar la geometría (que ningún flujo atraviese una caja ajena, que no
// haya nodos superpuestos) sin montar nada.

export type BpmnNodeType =
  // Eventos: círculos. El grosor/estilo del borde es lo que los distingue en BPMN.
  | 'startEvent' // borde fino
  | 'messageStart' // borde fino + sobre
  | 'timerStart' // borde fino + reloj
  | 'intermediateEvent' // borde doble
  | 'endEvent' // borde grueso
  | 'endEventError' // borde grueso + rayo
  // Actividades: rectángulos redondeados con marcador de tipo arriba a la izquierda.
  | 'task'
  | 'taskUser'
  | 'taskService'
  | 'taskScript'
  | 'taskSend'
  // Compuertas: rombos con marcador interno.
  | 'gatewayExclusive' // X
  | 'gatewayParallel' // +

export type BpmnFlowKind = 'sequence' | 'message' | 'default'

export interface BpmnNode {
  id: string
  type: BpmnNodeType
  label: string
  /** id del carril donde vive. */
  lane: string
  /** Columna en la grilla (0 = extremo izquierdo). Ordena la lectura izquierda→derecha. */
  col: number
  /** Fila dentro del carril, para ramas paralelas. Por defecto 0. */
  row?: number
}

export interface BpmnFlow {
  from: string
  to: string
  /** Etiqueta de condición ("sí", "no", …). Se dibuja junto al origen, como en BPMN. */
  label?: string
  kind?: BpmnFlowKind
  /**
   * Desplaza el canal por el que se rutea el tramo intermedio. Sirve cuando dos
   * flujos salen de la misma compuerta hacia filas distintas: sin esto ambos
   * comparten el mismo canal y se dibujan encimados un buen tramo.
   */
  channelOffset?: number
}

export interface BpmnLane {
  id: string
  label: string
}

export interface BpmnProcess {
  id: string
  titulo: string
  desc: string
  /** Dónde vive este proceso en el código, para que el diagrama sea auditable. */
  origen: string
  lanes: BpmnLane[]
  nodes: BpmnNode[]
  flows: BpmnFlow[]
  nota?: string
}

// ── Geometría ───────────────────────────────────────────────────────────────

export const GEO = {
  colW: 178,
  rowH: 108,
  taskW: 134,
  taskH: 58,
  eventD: 36,
  gwD: 42,
  lanePadY: 34,
  laneHeaderW: 34,
  padX: 30,
  padRight: 40,
  cornerR: 9,
} as const

export interface Size {
  w: number
  h: number
}

export function sizeOf(type: BpmnNodeType): Size {
  if (type.startsWith('gateway')) return { w: GEO.gwD, h: GEO.gwD }
  if (type.startsWith('task')) return { w: GEO.taskW, h: GEO.taskH }
  // Todo lo demás es un evento (círculo).
  return { w: GEO.eventD, h: GEO.eventD }
}

/** Las etiquetas de eventos y compuertas van FUERA de la figura, debajo. */
export const labelsOutside = (type: BpmnNodeType): boolean => !type.startsWith('task')

export interface Pt {
  x: number
  y: number
}

export interface PlacedNode extends BpmnNode {
  cx: number
  cy: number
  w: number
  h: number
  /** Líneas ya cortadas para el <text>. */
  lines: string[]
  outside: boolean
}

export interface PlacedLane extends BpmnLane {
  y: number
  height: number
  rows: number
}

export interface PlacedEdge {
  from: string
  to: string
  kind: BpmnFlowKind
  points: Pt[]
  path: string
  label?: string
  labelAt?: Pt
}

export interface Layout {
  width: number
  height: number
  lanes: PlacedLane[]
  nodes: PlacedNode[]
  edges: PlacedEdge[]
}

// ── Corte de texto ──────────────────────────────────────────────────────────

/**
 * SVG no envuelve texto: hay que cortarlo a mano en tspans. La medida es por
 * caracteres (no por ancho real de glifo) porque no tenemos acceso a métricas
 * de fuente en el servidor; el límite va deliberadamente conservador.
 */
export function wrap(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines
  // Se recorta con elipsis antes que desbordar la figura.
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:]$/, '')}…`
  return kept
}

// ── Ruteo ortogonal ─────────────────────────────────────────────────────────

type Side = 'l' | 'r' | 't' | 'b'

function port(n: PlacedNode, side: Side): Pt {
  switch (side) {
    case 'l':
      return { x: n.cx - n.w / 2, y: n.cy }
    case 'r':
      return { x: n.cx + n.w / 2, y: n.cy }
    case 't':
      return { x: n.cx, y: n.cy - n.h / 2 }
    case 'b':
      return { x: n.cx, y: n.cy + n.h / 2 }
  }
}

/** Holgura de los canales por los que se rodea un nodo al volver hacia atrás. */
const CHANNEL = 30

/**
 * Ruta ortogonal entre dos nodos. Cuatro casos, elegidos para que el trazo se
 * lea como un diagrama hecho a mano: recto si se puede, Z si hay que cambiar de
 * carril hacia adelante, y rodeo por un canal si el flujo vuelve hacia atrás
 * (bucles de reintento).
 */
export function route(a: PlacedNode, b: PlacedNode, channelOffset = 0): Pt[] {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const sameY = Math.abs(dy) < 2
  const sameX = Math.abs(dx) < 2

  // Caso A · misma altura y hacia adelante: recta horizontal.
  if (sameY && dx > 0) return [port(a, 'r'), port(b, 'l')]

  // Caso B · misma columna: recta vertical entre carriles o filas.
  if (sameX && !sameY) {
    return dy > 0 ? [port(a, 'b'), port(b, 't')] : [port(a, 't'), port(b, 'b')]
  }

  // Caso C · hacia adelante cambiando de fila/carril: Z por el canal intermedio.
  if (dx > 0) {
    const start = port(a, 'r')
    const end = port(b, 'l')
    const midX = (start.x + end.x) / 2
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
  }

  // Caso D · hacia atrás (bucle): se sale por arriba/abajo, se viaja por un
  // canal libre y se entra por la cara opuesta del destino.
  const goingDown = dy > 0
  // Un bucle a la misma altura se rodea por debajo; si hay desnivel, por el lado
  // hacia el que ya se mueve.
  const exit: Side = sameY ? 'b' : goingDown ? 'b' : 't'
  const enter: Side = sameY ? 'b' : goingDown ? 't' : 'b'
  const start = port(a, exit)
  const end = port(b, enter)
  const channelY = sameY
    ? Math.max(start.y, end.y) + CHANNEL
    : goingDown
      ? start.y + CHANNEL
      : start.y - CHANNEL
  return [start, { x: start.x, y: channelY }, { x: end.x, y: channelY }, end]
}

/** Convierte una polilínea en un path con esquinas redondeadas. */
export function polylinePath(pts: Pt[], r = GEO.cornerR): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`

  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const next = pts[i + 1]
    // El radio nunca puede comerse más de la mitad de un tramo, o la curva se
    // desborda hacia el tramo vecino y el trazo se ve roto.
    const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y)
    const outLen = Math.hypot(next.x - curr.x, next.y - curr.y)
    const rr = Math.min(r, inLen / 2, outLen / 2)
    if (rr < 1) {
      d += ` L ${curr.x} ${curr.y}`
      continue
    }
    const inUx = (curr.x - prev.x) / (inLen || 1)
    const inUy = (curr.y - prev.y) / (inLen || 1)
    const outUx = (next.x - curr.x) / (outLen || 1)
    const outUy = (next.y - curr.y) / (outLen || 1)
    d += ` L ${round(curr.x - inUx * rr)} ${round(curr.y - inUy * rr)}`
    d += ` Q ${round(curr.x)} ${round(curr.y)} ${round(curr.x + outUx * rr)} ${round(curr.y + outUy * rr)}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

const round = (n: number): number => Math.round(n * 10) / 10

/** Punto a `dist` del inicio de la polilínea: ahí van las etiquetas de condición. */
export function pointAlong(pts: Pt[], dist: number): Pt {
  let remaining = dist
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len >= remaining) {
      const t = len === 0 ? 0 : remaining / len
      return { x: round(a.x + (b.x - a.x) * t), y: round(a.y + (b.y - a.y) * t) }
    }
    remaining -= len
  }
  return pts[pts.length - 1]
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function layout(process: BpmnProcess): Layout {
  const rowsPerLane = new Map<string, number>()
  for (const lane of process.lanes) rowsPerLane.set(lane.id, 1)
  for (const n of process.nodes) {
    const rows = (n.row ?? 0) + 1
    rowsPerLane.set(n.lane, Math.max(rowsPerLane.get(n.lane) ?? 1, rows))
  }

  const lanes: PlacedLane[] = []
  let y = 0
  for (const lane of process.lanes) {
    const rows = rowsPerLane.get(lane.id) ?? 1
    const height = GEO.lanePadY * 2 + (rows - 1) * GEO.rowH + GEO.taskH
    lanes.push({ ...lane, y, height, rows })
    y += height
  }
  const laneById = new Map(lanes.map((l) => [l.id, l]))

  const maxCol = process.nodes.reduce((m, n) => Math.max(m, n.col), 0)
  const width = GEO.laneHeaderW + GEO.padX + maxCol * GEO.colW + GEO.taskW + GEO.padRight
  const height = y

  const nodes: PlacedNode[] = process.nodes.map((n) => {
    const lane = laneById.get(n.lane)
    if (!lane) throw new Error(`El nodo "${n.id}" apunta al carril inexistente "${n.lane}"`)
    const { w, h } = sizeOf(n.type)
    const outside = labelsOutside(n.type)
    return {
      ...n,
      row: n.row ?? 0,
      w,
      h,
      cx: GEO.laneHeaderW + GEO.padX + n.col * GEO.colW + GEO.taskW / 2,
      cy: lane.y + GEO.lanePadY + (n.row ?? 0) * GEO.rowH + GEO.taskH / 2,
      // Fuera de la figura hay más aire que dentro de una tarea.
      lines: wrap(n.label, outside ? 20 : 21, outside ? 2 : 3),
      outside,
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))

  const edges: PlacedEdge[] = process.flows.map((f) => {
    const a = byId.get(f.from)
    const b = byId.get(f.to)
    if (!a) throw new Error(`El flujo "${f.from} → ${f.to}" sale de un nodo inexistente`)
    if (!b) throw new Error(`El flujo "${f.from} → ${f.to}" entra a un nodo inexistente`)
    const points = route(a, b)
    return {
      from: f.from,
      to: f.to,
      kind: f.kind ?? 'sequence',
      points,
      path: polylinePath(points),
      label: f.label,
      // Junto al origen: en BPMN la condición se lee pegada a la compuerta.
      labelAt: f.label ? pointAlong(points, 26) : undefined,
    }
  })

  return { width, height, lanes, nodes, edges }
}

// ── Verificación de la geometría ────────────────────────────────────────────

export interface LayoutIssue {
  kind: 'overlap' | 'crossing'
  detail: string
}

const bbox = (n: PlacedNode) => ({
  x1: n.cx - n.w / 2,
  x2: n.cx + n.w / 2,
  y1: n.cy - n.h / 2,
  y2: n.cy + n.h / 2,
})

/**
 * Detecta los dos defectos que arruinan un BPMN a la vista: dos nodos en la
 * misma celda y una flecha que atraviesa una figura con la que no tiene nada
 * que ver. Se ejecuta en los tests, no en runtime.
 */
export function findLayoutIssues(process: BpmnProcess): LayoutIssue[] {
  const { nodes, edges } = layout(process)
  const issues: LayoutIssue[] = []

  const cells = new Map<string, string>()
  for (const n of nodes) {
    const key = `${n.lane}:${n.col}:${n.row ?? 0}`
    const taken = cells.get(key)
    if (taken) issues.push({ kind: 'overlap', detail: `"${n.id}" y "${taken}" comparten la celda ${key}` })
    else cells.set(key, n.id)
  }

  // Margen: una flecha que pasa rozando una caja también se ve mal.
  const M = 6
  for (const e of edges) {
    for (const n of nodes) {
      if (n.id === e.from || n.id === e.to) continue
      const b = bbox(n)
      const box = { x1: b.x1 - M, x2: b.x2 + M, y1: b.y1 - M, y2: b.y2 + M }
      for (let i = 0; i < e.points.length - 1; i++) {
        if (segmentHitsBox(e.points[i], e.points[i + 1], box)) {
          issues.push({ kind: 'crossing', detail: `el flujo ${e.from} → ${e.to} atraviesa "${n.id}"` })
          break
        }
      }
    }
  }

  return issues
}

// Los tramos siempre son horizontales o verticales (ruteo ortogonal), así que
// basta con comparar rangos: no hace falta intersección de segmentos general.
function segmentHitsBox(a: Pt, b: Pt, box: { x1: number; x2: number; y1: number; y2: number }): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return maxX > box.x1 && minX < box.x2 && maxY > box.y1 && minY < box.y2
}
