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
  | 'timerIntermediate' // borde doble + reloj: el proceso espera aquí
  | 'boundaryTimer' // borde doble pegado a una tarea: se dispara si tarda de más
  | 'endEvent' // borde grueso
  | 'endEventError' // borde grueso + rayo
  // Actividades: rectángulos redondeados con marcador de tipo arriba a la izquierda.
  | 'task'
  | 'taskUser'
  | 'taskService'
  | 'taskScript'
  | 'taskSend'
  // Compuertas: todas son el mismo rombo; lo que cambia el comportamiento es
  // el marcador interno, así que dibujarlo mal cambia el significado del
  // diagrama, no su estética.
  | 'gatewayExclusive' // X — un solo camino
  | 'gatewayEvent' // pentágono en doble círculo — decide el primer evento que ocurra
  | 'gatewayParallel' // + — todos los caminos a la vez
  | 'gatewayInclusive' // O — uno, varios o todos
  | 'gatewayComplex' // * — condición que no cabe en las anteriores

export type BpmnFlowKind = 'sequence' | 'message' | 'default'

interface BpmnNodeBase {
  id: string
  label: string
  /**
   * Tiempo asociado al nodo (presupuesto, ventana, vigencia o cadencia). Se
   * dibuja como anotación junto a la figura. Cada valor sale de una constante
   * del código, no de una estimación: ver `tiempos` del proceso.
   */
  duracion?: string
}

/** Nodo colocado en la grilla de carriles y columnas. */
export interface BpmnGridNode extends BpmnNodeBase {
  type: Exclude<BpmnNodeType, 'boundaryTimer'>
  /** id del carril donde vive. */
  lane: string
  /** Columna en la grilla (0 = extremo izquierdo). Ordena la lectura izquierda→derecha. */
  col: number
  /** Fila dentro del carril, para ramas paralelas. Por defecto 0. */
  row?: number
}

/**
 * Evento de borde: no ocupa celda propia, va pegado al borde de la tarea que
 * vigila. Modelado como tipo aparte para que sea imposible declarar uno sin
 * anfitrión o con una columna que nadie usaría.
 */
export interface BpmnBoundaryNode extends BpmnNodeBase {
  type: 'boundaryTimer'
  /** id de la tarea a cuyo borde se pega. */
  attachedTo: string
  /** false = no interrumpe la tarea (borde punteado). Por defecto interrumpe. */
  interrumpe?: boolean
}

export type BpmnNode = BpmnGridNode | BpmnBoundaryNode

export const isBoundary = (n: BpmnNode): n is BpmnBoundaryNode => n.type === 'boundaryTimer'

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
  /**
   * Los tiempos del proceso con su procedencia. Un diagrama que dice "72 h" sin
   * decir de dónde sale ese 72 es una afirmación sin respaldo: cada fila cita
   * la constante del código que la fija, para poder contrastarla.
   */
  tiempos?: TiempoProceso[]
}

export interface TiempoProceso {
  concepto: string
  valor: string
  /** Constante y archivo donde está fijado el valor. */
  origen: string
  /** Por qué ese número y no otro. */
  razon?: string
}

// ── Geometría ───────────────────────────────────────────────────────────────

export const GEO = {
  colW: 178,
  rowH: 108,
  taskW: 134,
  taskH: 58,
  eventD: 36,
  boundaryD: 30,
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
  // El evento de borde va algo más pequeño para que se lea como pegado a la
  // tarea y no como un evento suelto que quedó encima.
  if (type === 'boundaryTimer') return { w: GEO.boundaryD, h: GEO.boundaryD }
  // Todo lo demás es un evento (círculo).
  return { w: GEO.eventD, h: GEO.eventD }
}

/** Las etiquetas de eventos y compuertas van FUERA de la figura, debajo. */
export const labelsOutside = (type: BpmnNodeType): boolean => !type.startsWith('task')

export interface Pt {
  x: number
  y: number
}

export interface PlacedNode extends BpmnNodeBase {
  type: BpmnNodeType
  lane: string
  col: number
  row: number
  /** Solo en eventos de borde: id de la tarea a la que están pegados. */
  attachedTo?: string
  interrumpe?: boolean
  cx: number
  cy: number
  w: number
  h: number
  /** Líneas ya cortadas para el <text>. */
  lines: string[]
  outside: boolean
  /**
   * Las etiquetas de compuerta van ARRIBA del rombo: debajo chocan con la
   * etiqueta de la rama que baja ("no", "sí"), que se dibuja pegada al origen.
   * Las de evento van debajo, como es convención.
   */
  labelAbove: boolean
  /**
   * Los eventos de borde alinean su texto hacia la izquierda del círculo: por
   * la derecha del borde es por donde sale su propia flecha, y una etiqueta
   * centrada acaba partida por ese trazo.
   */
  labelAlign: 'middle' | 'end'
  /** Punto de anclaje horizontal del texto, según `labelAlign`. */
  labelX: number
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
    const midX = (start.x + end.x) / 2 + channelOffset
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
  const channel = CHANNEL + Math.abs(channelOffset)
  const channelY = sameY
    ? Math.max(start.y, end.y) + channel
    : goingDown
      ? start.y + channel
      : start.y - channel
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

/**
 * Dónde va la etiqueta de condición de un flujo.
 *
 * No basta con "a 26px del origen": las dos ramas de una compuerta salen por el
 * mismo puerto y sus dos primeros tramos se solapan, así que "sí" y "no"
 * terminaban dibujados en el mismo punto — leyéndose sobre la rama contraria.
 * Por eso, si la rama quiebra, la etiqueta se ancla DESPUÉS del quiebre: ahí el
 * trazo ya es exclusivo de esa rama y no hay ambigüedad posible.
 *
 * Además se aparta perpendicular al tramo: una etiqueta encima de su propia
 * flecha se lee mal.
 */
export function labelAnchor(pts: Pt[]): Pt {
  if (pts.length === 2) {
    const p = pointAlong(pts, 26)
    const vertical = Math.abs(pts[1].x - pts[0].x) < 0.001
    return vertical ? { x: p.x + 16, y: p.y } : { x: p.x, y: p.y - 11 }
  }

  const bend = pts[1]
  const next = pts[2]
  const len = Math.hypot(next.x - bend.x, next.y - bend.y)
  const t = len === 0 ? 0 : Math.min(18, len / 2) / len
  const p = { x: round(bend.x + (next.x - bend.x) * t), y: round(bend.y + (next.y - bend.y) * t) }
  const vertical = Math.abs(next.x - bend.x) < 0.001
  return vertical ? { x: p.x + 16, y: p.y } : { x: p.x, y: p.y - 11 }
}

// Aproximación del ancho de una etiqueta: sin métricas de fuente en el
// servidor, se estima por caracteres. Va holgada a propósito — el objetivo es
// detectar choques en los tests, y quedarse corto sería peor que pasarse.
const CHAR_W = 5.6
const LINE_H = 12

export interface Box {
  x1: number
  x2: number
  y1: number
  y2: number
}

/**
 * Caja que ocupa el texto que un nodo dibuja FUERA de su figura: la etiqueta de
 * eventos y compuertas, y la anotación de duración de cualquier nodo. Devuelve
 * la unión de ambas, que es lo que hay que mantener libre de flechas.
 */
export function labelBox(n: PlacedNode): Box | null {
  const cajas: Box[] = []

  if (n.outside && n.lines.length > 0) {
    const w = Math.max(...n.lines.map((l) => l.length)) * CHAR_W + 6
    const h = n.lines.length * LINE_H + 4
    const y1 = n.labelAbove ? n.cy - n.h / 2 - 6 - h : n.cy + n.h / 2 + 4
    cajas.push({ x1: n.cx - w / 2, x2: n.cx + w / 2, y1, y2: y1 + h })
  }

  if (n.duracion) {
    const w = n.duracion.length * CHAR_W + 10
    const y1 = duracionY(n) - 9
    cajas.push({ x1: n.cx - w / 2, x2: n.cx + w / 2, y1, y2: y1 + 15 })
  }

  if (cajas.length === 0) return null
  return cajas.reduce((a, b) => ({
    x1: Math.min(a.x1, b.x1),
    x2: Math.max(a.x2, b.x2),
    y1: Math.min(a.y1, b.y1),
    y2: Math.max(a.y2, b.y2),
  }))
}

/**
 * Línea base de la anotación de duración.
 *
 * Debajo de la figura salvo en las compuertas: ahí abajo es donde salen las
 * ramas con sus "sí"/"no", así que el tiempo se apila arriba, encima de la
 * etiqueta. En un evento el texto va primero y el tiempo justo debajo.
 */
export function duracionY(n: PlacedNode): number {
  if (n.labelAbove) {
    const primeraLinea = n.cy - n.h / 2 - 8 - Math.max(0, n.lines.length - 1) * LINE_H
    return primeraLinea - LINE_H
  }
  const bajoLaFigura = n.cy + n.h / 2 + 13
  if (!n.outside || n.lines.length === 0) return bajoLaFigura
  return bajoLaFigura + n.lines.length * LINE_H
}

/** Caja de la etiqueta de un flujo, centrada en su ancla. */
export function flowLabelBox(label: string, at: Pt): Box {
  const w = label.length * CHAR_W + 8
  return { x1: at.x - w / 2, x2: at.x + w / 2, y1: at.y - 8, y2: at.y + 8 }
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function layout(process: BpmnProcess): Layout {
  // Los eventos de borde no ocupan celda: su sitio sale del de su anfitrión, así
  // que se colocan en una segunda pasada.
  const gridNodes = process.nodes.filter((n): n is BpmnGridNode => !isBoundary(n))
  const boundaryNodes = process.nodes.filter(isBoundary)

  const rowsPerLane = new Map<string, number>()
  for (const lane of process.lanes) rowsPerLane.set(lane.id, 1)
  for (const n of gridNodes) {
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

  const maxCol = gridNodes.reduce((m, n) => Math.max(m, n.col), 0)
  const width = GEO.laneHeaderW + GEO.padX + maxCol * GEO.colW + GEO.taskW + GEO.padRight
  const height = y

  const nodes: PlacedNode[] = gridNodes.map((n) => {
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
      labelAbove: outside && n.type.startsWith('gateway'),
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))

  // Segunda pasada: los eventos de borde se cuelgan del borde inferior derecho
  // de su tarea. Esa esquina es la que queda libre — la izquierda recibe la
  // flecha de entrada y el marcador de tipo de tarea vive arriba.
  for (const b of boundaryNodes) {
    const host = byId.get(b.attachedTo)
    if (!host) throw new Error(`El evento de borde "${b.id}" se cuelga de la tarea inexistente "${b.attachedTo}"`)
    const { w, h } = sizeOf(b.type)
    const placed: PlacedNode = {
      ...b,
      lane: host.lane,
      col: host.col,
      row: host.row,
      w,
      h,
      cx: host.cx + host.w / 2 - w / 2 - 6,
      cy: host.cy + host.h / 2,
      lines: wrap(b.label, 20, 2),
      outside: true,
      labelAbove: false,
    }
    nodes.push(placed)
    byId.set(b.id, placed)
  }

  const edges: PlacedEdge[] = process.flows.map((f) => {
    const a = byId.get(f.from)
    const b = byId.get(f.to)
    if (!a) throw new Error(`El flujo "${f.from} → ${f.to}" sale de un nodo inexistente`)
    if (!b) throw new Error(`El flujo "${f.from} → ${f.to}" entra a un nodo inexistente`)
    const points = route(a, b, f.channelOffset ?? 0)
    return {
      from: f.from,
      to: f.to,
      kind: f.kind ?? 'sequence',
      points,
      path: polylinePath(points),
      label: f.label,
      // Junto al origen: en BPMN la condición se lee pegada a la compuerta.
      labelAt: f.label ? labelAnchor(points) : undefined,
    }
  })

  return { width, height, lanes, nodes, edges }
}

// ── Verificación de la geometría ────────────────────────────────────────────

export interface LayoutIssue {
  kind: 'overlap' | 'crossing' | 'label'
  detail: string
}

const bbox = (n: PlacedNode): Box => ({
  x1: n.cx - n.w / 2,
  x2: n.cx + n.w / 2,
  y1: n.cy - n.h / 2,
  y2: n.cy + n.h / 2,
})

const grow = (b: Box, m: number): Box => ({ x1: b.x1 - m, x2: b.x2 + m, y1: b.y1 - m, y2: b.y2 + m })

const boxesOverlap = (a: Box, b: Box): boolean => a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2

/**
 * Detecta los defectos que arruinan un BPMN a la vista: nodos en la misma
 * celda, flechas que atraviesan figuras ajenas y etiquetas encimadas entre sí.
 * Se ejecuta en los tests, no en runtime.
 */
export function findLayoutIssues(process: BpmnProcess): LayoutIssue[] {
  const { nodes, edges } = layout(process)
  const issues: LayoutIssue[] = []

  const cells = new Map<string, string>()
  for (const n of nodes) {
    // Los eventos de borde comparten celda con su anfitrión a propósito.
    if (n.attachedTo) continue
    const key = `${n.lane}:${n.col}:${n.row ?? 0}`
    const taken = cells.get(key)
    if (taken) issues.push({ kind: 'overlap', detail: `"${n.id}" y "${taken}" comparten la celda ${key}` })
    else cells.set(key, n.id)
  }

  // Un evento de borde se pisa con su anfitrión por definición, y su flecha de
  // salida arranca sobre el borde de esa misma tarea. Solo esos dos casos se
  // perdonan: perdonar cualquier flecha que toque al anfitrión dejaba pasar
  // que una salida de la tarea partiera en dos la etiqueta del temporizador.
  const anfitrionDe = new Map<string, string>()
  for (const n of nodes) if (n.attachedTo) anfitrionDe.set(n.id, n.attachedTo)

  // Solo la figura del anfitrión queda exenta, y solo frente a la flecha que
  // sale de SU evento de borde (que nace pegada a ese borde). La etiqueta del
  // evento no se exime nunca: que una salida de la tarea la parta en dos es
  // exactamente el defecto que hay que ver.
  const exentoDeLaFlecha = (nodeId: string, e: PlacedEdge): boolean => anfitrionDe.get(e.from) === nodeId

  // Margen: una flecha que pasa rozando una caja también se ve mal.
  const M = 6
  for (const e of edges) {
    for (const n of nodes) {
      if (n.id === e.from || n.id === e.to) continue
      if (exentoDeLaFlecha(n.id, e)) continue
      const box = grow(bbox(n), M)
      for (let i = 0; i < e.points.length - 1; i++) {
        if (segmentHitsBox(e.points[i], e.points[i + 1], box)) {
          issues.push({ kind: 'crossing', detail: `el flujo ${e.from} → ${e.to} atraviesa "${n.id}"` })
          break
        }
      }
    }
  }

  // Etiquetas: las de nodo contra las de nodo, y las de rama contra las de
  // nodo. Es justo el choque que se cuela sin darse cuenta, porque el texto se
  // dibuja fuera de la figura y nadie lo cuenta como ocupación.
  const etiquetasNodo = nodes
    .map((n) => ({ id: n.id, box: labelBox(n) }))
    .filter((x): x is { id: string; box: Box } => x.box !== null)

  for (let i = 0; i < etiquetasNodo.length; i++) {
    for (let j = i + 1; j < etiquetasNodo.length; j++) {
      if (boxesOverlap(etiquetasNodo[i].box, etiquetasNodo[j].box)) {
        issues.push({
          kind: 'label',
          detail: `las etiquetas de "${etiquetasNodo[i].id}" y "${etiquetasNodo[j].id}" se encinan`,
        })
      }
    }
  }

  // Flechas contra etiquetas de nodo: el texto vive fuera de la figura, así que
  // una flecha puede pasar limpia por encima de la caja y aun así partir en dos
  // el nombre que cuelga debajo.
  for (const e of edges) {
    for (const et of etiquetasNodo) {
      if (et.id === e.from || et.id === e.to) continue
      for (let i = 0; i < e.points.length - 1; i++) {
        if (segmentHitsBox(e.points[i], e.points[i + 1], et.box)) {
          issues.push({ kind: 'label', detail: `el flujo ${e.from} → ${e.to} cruza la etiqueta de "${et.id}"` })
          break
        }
      }
    }
  }

  // Etiqueta de rama contra etiqueta de rama: es el choque que deja un "sí"
  // dibujado sobre el camino del "no". Sin esta comprobación se coló una vez.
  const etiquetasFlujo = edges
    .filter((e) => e.label && e.labelAt)
    .map((e) => ({ e, box: flowLabelBox(e.label!, e.labelAt!) }))

  for (let i = 0; i < etiquetasFlujo.length; i++) {
    for (let j = i + 1; j < etiquetasFlujo.length; j++) {
      const a = etiquetasFlujo[i]
      const b = etiquetasFlujo[j]
      if (boxesOverlap(a.box, b.box)) {
        issues.push({
          kind: 'label',
          detail: `las etiquetas "${a.e.label}" (${a.e.from} → ${a.e.to}) y "${b.e.label}" (${b.e.from} → ${b.e.to}) se encinan`,
        })
      }
    }
  }

  for (const e of edges) {
    if (!e.label || !e.labelAt) continue
    const box = flowLabelBox(e.label, e.labelAt)
    for (const et of etiquetasNodo) {
      if (boxesOverlap(box, et.box)) {
        issues.push({ kind: 'label', detail: `la etiqueta "${e.label}" (${e.from} → ${e.to}) choca con la de "${et.id}"` })
      }
    }
    for (const n of nodes) {
      if (n.id === e.from || n.id === e.to) continue
      if (boxesOverlap(box, bbox(n))) {
        issues.push({ kind: 'label', detail: `la etiqueta "${e.label}" (${e.from} → ${e.to}) cae sobre "${n.id}"` })
      }
    }
  }

  return issues
}

// Los tramos siempre son horizontales o verticales (ruteo ortogonal), así que
// basta con comparar rangos: no hace falta intersección de segmentos general.
function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return maxX > box.x1 && minX < box.x2 && maxY > box.y1 && minY < box.y2
}
