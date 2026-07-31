// Motor de layout de diagramas de actividades UML 2.5.1.
//
// Por qué propio y no Mermaid: `flowchart` NO es notación de actividad. No
// tiene barra de bifurcación/unión, no tiene particiones, no distingue el nodo
// inicial (círculo relleno) del final de actividad (diana) ni del final de
// flujo (círculo con aspa), y dibuja las guardas como texto suelto en vez de
// entre corchetes. Un diagrama que se pide "sí o sí en UML" no puede salir de
// ahí. El precedente del repo es el motor BPMN: mismo enfoque, SVG generado en
// el servidor, sin dependencias ni JavaScript en el cliente.
//
// Se reutiliza del motor BPMN todo lo que es geometría genérica (corte de
// texto, polilíneas redondeadas, punto sobre la traza); lo que cambia es el
// sentido de lectura —aquí el flujo baja y las particiones son columnas— y el
// catálogo de figuras, que es el de UML y no el de BPMN.
//
// Módulo PURO: sin Astro, sin BD. Los tests verifican la geometría
// (solapamientos, aristas que cruzan figuras ajenas, nodos fuera de su
// partición) sin montar nada.

import { pointAlong, polylinePath, wrap, type Pt } from './bpmn-layout'

export type { Pt }

/**
 * Catálogo de nodos de actividad de UML 2.5.1. El significado va en la figura:
 * dibujar un `merge` como `decision` (o al revés) cambia lo que el diagrama
 * afirma, no su estética — el rombo de decisión tiene una entrada y varias
 * salidas con guarda, el de unión varias entradas y una salida sin guarda.
 */
export type UmlActivityNodeType =
  // Nodos de control
  | 'initial' // círculo relleno
  | 'activityFinal' // diana: anillo + disco
  | 'flowFinal' // círculo con aspa: termina ESTE flujo, no la actividad
  | 'decision' // rombo, 1 entrada → n salidas con guarda
  | 'merge' // rombo, n entradas → 1 salida sin guarda
  | 'fork' // barra: 1 entrada → n salidas concurrentes
  | 'join' // barra: n entradas → 1 salida (espera a todas)
  // Nodos ejecutables y de objeto
  | 'action' // rectángulo de esquinas redondeadas
  | 'objectNode' // rectángulo recto: un dato que viaja entre acciones
  // Acciones de señal
  | 'sendSignal' // pentágono convexo
  | 'acceptEvent' // pentágono cóncavo
  | 'timeEvent' // reloj de arena

export interface UmlActivityNode {
  id: string
  /** Vacío en nodos de control que no lo llevan (merge, fork sin nombre). */
  label?: string
  type: UmlActivityNodeType
  /** id de la partición (calle) a la que pertenece. */
  particion: string
  /** Fila en la grilla: 0 arriba. Fija el orden de lectura de arriba abajo. */
  fila: number
  /**
   * Desplazamiento horizontal dentro de la partición, en anchos de rama. Sirve
   * para las ramas concurrentes que nacen de una misma bifurcación y viven en
   * la misma partición: sin esto se dibujarían una encima de otra.
   */
  rama?: number
  /**
   * Particiones que abarca una barra de bifurcación/unión. Una barra que
   * reparte trabajo entre dos calles tiene que llegar visualmente a las dos.
   */
  abarca?: number
  /** Nota al margen, para dejar por escrito el porqué de una bifurcación. */
  nota?: string
}

export interface UmlActivityEdge {
  from: string
  to: string
  /**
   * Guarda de la transición. Se dibuja SIEMPRE entre corchetes, como manda la
   * notación: el dato trae `vigente`, el diagrama pinta `[vigente]`.
   */
  guarda?: string
  /** Flujo de objeto (línea con punta abierta hacia un nodo de objeto). */
  kind?: 'control' | 'object'
  /** Desplaza el canal de ruteo cuando dos aristas comparten tramo. */
  channelOffset?: number
  /**
   * Corrige a mano dónde cae la guarda. Hace falta cuando dos ramas salen del
   * mismo rombo: sus primeros tramos son casi paralelos y el ancla automática
   * las deja una encima de otra, con lo que cada guarda acaba leyéndose sobre
   * la rama contraria — que dice justo lo contrario de lo que pasa.
   */
  guardaOffset?: { dx?: number; dy?: number }
}

export interface UmlParticion {
  id: string
  label: string
  /** Quién es en el sistema real: se imprime bajo el nombre de la calle. */
  rol?: string
}

export interface UmlActivityModel {
  id: string
  titulo: string
  desc: string
  /** Dónde vive esto en el código, para poder contrastar el diagrama. */
  origen: string
  particiones: UmlParticion[]
  nodes: UmlActivityNode[]
  edges: UmlActivityEdge[]
  nota?: string
}

// ── Geometría ───────────────────────────────────────────────────────────────

export const GEO = {
  /** Ancho de cada partición (columna). */
  colW: 250,
  /** Separación vertical entre centros de fila consecutiva. */
  filaH: 96,
  /** Alto de la cabecera con el nombre de la partición. */
  headerH: 46,
  padTop: 26,
  padBottom: 34,
  cornerR: 9,
  /** Ancho de una rama dentro de una partición. */
  ramaW: 116,
} as const

export interface Size {
  w: number
  h: number
}

export function sizeOf(type: UmlActivityNodeType, abarca = 1): Size {
  switch (type) {
    case 'action':
      return { w: 176, h: 52 }
    case 'objectNode':
      return { w: 158, h: 44 }
    case 'sendSignal':
    case 'acceptEvent':
      return { w: 158, h: 46 }
    case 'decision':
    case 'merge':
      return { w: 48, h: 48 }
    case 'fork':
    case 'join':
      // La barra se estira hasta cubrir las particiones que reparte.
      return { w: Math.min(GEO.colW * abarca - 60, 176 + (abarca - 1) * GEO.colW), h: 8 }
    case 'initial':
      return { w: 18, h: 18 }
    case 'activityFinal':
    case 'flowFinal':
      return { w: 26, h: 26 }
    case 'timeEvent':
      return { w: 28, h: 36 }
  }
}

/** Las figuras que no son rectángulos llevan la etiqueta fuera, a un lado. */
export const labelInside = (type: UmlActivityNodeType): boolean =>
  type === 'action' || type === 'objectNode' || type === 'sendSignal' || type === 'acceptEvent'

export interface PlacedActivityNode extends UmlActivityNode {
  cx: number
  cy: number
  w: number
  h: number
  /** Texto ya cortado en líneas: SVG no envuelve solo. */
  lines: string[]
  /** Ancla de la etiqueta cuando va fuera de la figura. */
  labelX: number
  labelY: number
  labelAlign: 'start' | 'middle' | 'end'
}

export interface PlacedParticion extends UmlParticion {
  x1: number
  x2: number
}

export interface PlacedActivityEdge extends UmlActivityEdge {
  pts: Pt[]
  d: string
  /** Dónde va la guarda, ya apartada del trazo. */
  guardAt: Pt
  guardAlign: 'start' | 'middle' | 'end'
}

export interface ActivityLayout {
  w: number
  h: number
  particiones: PlacedParticion[]
  nodes: PlacedActivityNode[]
  edges: PlacedActivityEdge[]
}

type Side = 'l' | 'r' | 't' | 'b'

function port(n: PlacedActivityNode, side: Side): Pt {
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

/** Holgura del canal por el que se rodea una figura al volver hacia arriba. */
const CHANNEL = 34

/**
 * Ruta ortogonal entre dos nodos, con el flujo bajando.
 *
 * Cuatro casos, los mismos del motor BPMN pero con los ejes cambiados: recta si
 * se puede, Z si hay que cambiar de columna avanzando, y rodeo por un canal
 * lateral cuando el flujo sube (los bucles de reintento, que en este sistema
 * son la norma y no la excepción).
 */
export function route(a: PlacedActivityNode, b: PlacedActivityNode, channelOffset = 0): Pt[] {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const sameX = Math.abs(dx) < 2
  const sameY = Math.abs(dy) < 2

  // Caso A · misma columna y hacia abajo: recta vertical.
  if (sameX && dy > 0 && channelOffset === 0) return [port(a, 'b'), port(b, 't')]

  // Caso B · misma fila: recta horizontal entre particiones o ramas.
  if (sameY && !sameX) {
    return dx > 0 ? [port(a, 'r'), port(b, 'l')] : [port(a, 'l'), port(b, 'r')]
  }

  // Caso A-bis · salto largo hacia abajo con canal explícito. Es el caso de la
  // rama que se salta varios pasos (la ruta pública que no verifica sesión, el
  // deploy sano que no hace rollback): la recta vertical la haría atravesar las
  // figuras intermedias, así que baja por un canal lateral y entra de costado.
  if (dy > 0 && channelOffset !== 0) {
    const start = port(a, channelOffset > 0 ? 'r' : 'l')
    const x = a.cx + channelOffset
    // Por qué cara entra depende de dónde quedó el canal respecto al destino,
    // no del signo del desvío: entrar por la cara equivocada dibuja la flecha
    // atravesando la figura que debería estar señalando.
    const end = port(b, x > b.cx ? 'r' : 'l')
    return [start, { x, y: start.y }, { x, y: end.y }, end]
  }

  // Caso C · hacia abajo cambiando de columna: Z por el canal intermedio.
  if (dy > 0) {
    const start = port(a, 'b')
    const end = port(b, 't')
    const midY = (start.y + end.y) / 2 + channelOffset
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
  }

  // Caso D · hacia arriba (bucle): se sale por un lado, se sube por un canal
  // libre y se entra por la cara opuesta del destino.
  const goingRight = dx > 0
  const exit: Side = sameX ? 'r' : goingRight ? 'r' : 'l'
  const enter: Side = sameX ? 'r' : goingRight ? 'l' : 'r'
  const start = port(a, exit)
  const end = port(b, enter)
  const channel = CHANNEL + Math.abs(channelOffset)
  const channelX = sameX
    ? Math.max(start.x, end.x) + channel
    : goingRight
      ? start.x + channel
      : start.x - channel
  return [start, { x: channelX, y: start.y }, { x: channelX, y: end.y }, end]
}

/**
 * Dónde se ancla la guarda de una transición.
 *
 * Si la arista quiebra, la guarda va DESPUÉS del quiebre: las dos ramas de un
 * rombo salen por puertos distintos pero sus primeros tramos pueden solaparse,
 * y una guarda dibujada sobre la rama contraria dice lo contrario de lo que
 * pasa.
 */
export function guardAnchor(pts: Pt[]): { at: Pt; align: 'start' | 'middle' | 'end' } {
  if (pts.length === 2) {
    const p = pointAlong(pts, 24)
    const vertical = Math.abs(pts[1].x - pts[0].x) < 0.001
    return vertical ? { at: { x: p.x + 8, y: p.y }, align: 'start' } : { at: { x: p.x, y: p.y - 8 }, align: 'middle' }
  }
  const bend = pts[1]
  const next = pts[2]
  const len = Math.hypot(next.x - bend.x, next.y - bend.y)
  const t = len === 0 ? 0 : Math.min(20, len / 2) / len
  const p = { x: bend.x + (next.x - bend.x) * t, y: bend.y + (next.y - bend.y) * t }
  const vertical = Math.abs(next.x - bend.x) < 0.001
  return vertical ? { at: { x: p.x + 8, y: p.y }, align: 'start' } : { at: { x: p.x, y: p.y - 8 }, align: 'middle' }
}

const CHARS_POR_LINEA: Partial<Record<UmlActivityNodeType, number>> = {
  action: 24,
  objectNode: 22,
  sendSignal: 20,
  acceptEvent: 20,
}

export function layout(model: UmlActivityModel): ActivityLayout {
  const { colW, filaH, headerH, padTop, padBottom, ramaW } = GEO

  const particiones: PlacedParticion[] = model.particiones.map((p, i) => ({
    ...p,
    x1: i * colW,
    x2: (i + 1) * colW,
  }))
  const indiceParticion = new Map(model.particiones.map((p, i) => [p.id, i]))

  const filaMax = model.nodes.reduce((max, n) => Math.max(max, n.fila), 0)

  const nodes: PlacedActivityNode[] = model.nodes.map((n) => {
    const col = indiceParticion.get(n.particion)
    if (col === undefined) throw new Error(`Nodo "${n.id}": partición desconocida "${n.particion}"`)

    const abarca = n.abarca ?? 1
    const { w, h } = sizeOf(n.type, abarca)
    // Una barra que abarca varias calles se centra sobre el bloque completo;
    // el resto se centra en su columna, desplazado por rama si la hay.
    const centroCol = col * colW + (abarca > 1 ? (colW * abarca) / 2 : colW / 2)
    const cx = centroCol + (n.rama ?? 0) * ramaW
    const cy = headerH + padTop + n.fila * filaH + h / 2

    const maxChars = CHARS_POR_LINEA[n.type]
    const lines = n.label && maxChars ? wrap(n.label, maxChars, 3) : n.label ? wrap(n.label, 26, 2) : []

    const dentro = labelInside(n.type)
    return {
      ...n,
      cx,
      cy,
      w,
      h,
      lines,
      labelX: dentro ? cx : cx + w / 2 + 10,
      labelY: dentro ? cy : cy - ((lines.length - 1) * 12) / 2,
      labelAlign: dentro ? 'middle' : 'start',
    }
  })

  const porId = new Map(nodes.map((n) => [n.id, n]))
  const edges: PlacedActivityEdge[] = model.edges.map((e) => {
    const a = porId.get(e.from)
    const b = porId.get(e.to)
    if (!a || !b) throw new Error(`Arista ${e.from}→${e.to}: nodo inexistente`)
    const pts = route(a, b, e.channelOffset ?? 0)
    const { at, align } = guardAnchor(pts)
    const ajuste = e.guardaOffset
    return {
      ...e,
      pts,
      d: polylinePath(pts, GEO.cornerR),
      guardAt: { x: at.x + (ajuste?.dx ?? 0), y: at.y + (ajuste?.dy ?? 0) },
      guardAlign: align,
    }
  })

  // El ancho útil puede exceder las particiones si alguna rama se desplaza.
  const maxX = nodes.reduce((max, n) => Math.max(max, n.cx + n.w / 2), particiones.at(-1)?.x2 ?? colW)

  return {
    w: Math.max(maxX + 24, particiones.at(-1)?.x2 ?? colW),
    h: headerH + padTop + filaMax * filaH + padBottom,
    particiones,
    nodes,
    edges,
  }
}

// ── Verificación del dibujo ─────────────────────────────────────────────────

export interface LayoutIssue {
  kind: 'overlap' | 'edge-crosses-node' | 'fuera-de-particion' | 'semantica'
  detail: string
}

interface Box {
  x1: number
  x2: number
  y1: number
  y2: number
}

const bbox = (n: PlacedActivityNode): Box => ({
  x1: n.cx - n.w / 2,
  x2: n.cx + n.w / 2,
  y1: n.cy - n.h / 2,
  y2: n.cy + n.h / 2,
})

const grow = (b: Box, m: number): Box => ({ x1: b.x1 - m, x2: b.x2 + m, y1: b.y1 - m, y2: b.y2 + m })

const overlap = (a: Box, b: Box): boolean => a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2

function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  const seg: Box = {
    x1: Math.min(a.x, b.x),
    x2: Math.max(a.x, b.x),
    y1: Math.min(a.y, b.y),
    y2: Math.max(a.y, b.y),
  }
  return overlap(seg, box)
}

/**
 * Defectos del dibujo Y de la semántica UML. Lo segundo importa tanto como lo
 * primero: un rombo de decisión con dos entradas o una rama sin guarda es un
 * diagrama incorrecto aunque se vea perfecto.
 */
export function findLayoutIssues(model: UmlActivityModel): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const l = layout(model)

  // Figuras encimadas.
  for (let i = 0; i < l.nodes.length; i++) {
    for (let j = i + 1; j < l.nodes.length; j++) {
      const a = l.nodes[i]
      const b = l.nodes[j]
      if (overlap(grow(bbox(a), 5), bbox(b))) {
        issues.push({ kind: 'overlap', detail: `"${a.id}" y "${b.id}" se solapan` })
      }
    }
  }

  // Aristas que atraviesan una figura que no es ni su origen ni su destino.
  for (const e of l.edges) {
    for (const n of l.nodes) {
      if (n.id === e.from || n.id === e.to) continue
      const box = grow(bbox(n), 3)
      for (let i = 0; i < e.pts.length - 1; i++) {
        if (segmentHitsBox(e.pts[i], e.pts[i + 1], box)) {
          issues.push({ kind: 'edge-crosses-node', detail: `${e.from}→${e.to} cruza "${n.id}"` })
          break
        }
      }
    }
  }

  const entradas = new Map<string, number>()
  const salidas = new Map<string, UmlActivityEdge[]>()
  for (const e of model.edges) {
    entradas.set(e.to, (entradas.get(e.to) ?? 0) + 1)
    salidas.set(e.from, [...(salidas.get(e.from) ?? []), e])
  }

  for (const n of model.nodes) {
    const ent = entradas.get(n.id) ?? 0
    const sal = salidas.get(n.id) ?? []

    if (n.type === 'initial' && ent > 0) {
      issues.push({ kind: 'semantica', detail: `el nodo inicial "${n.id}" no puede tener transiciones entrantes` })
    }
    if ((n.type === 'activityFinal' || n.type === 'flowFinal') && sal.length > 0) {
      issues.push({ kind: 'semantica', detail: `el nodo final "${n.id}" no puede tener transiciones salientes` })
    }
    // Decisión: una entrada, varias salidas, todas con guarda.
    if (n.type === 'decision') {
      if (sal.length < 2) {
        issues.push({ kind: 'semantica', detail: `la decisión "${n.id}" necesita al menos dos salidas` })
      }
      const sinGuarda = sal.filter((e) => !e.guarda)
      if (sinGuarda.length > 0) {
        issues.push({
          kind: 'semantica',
          detail: `salidas sin guarda en la decisión "${n.id}": ${sinGuarda.map((e) => e.to).join(', ')}`,
        })
      }
    }
    // Unión de decisión: varias entradas, una salida sin guarda.
    if (n.type === 'merge' && sal.length > 1) {
      issues.push({ kind: 'semantica', detail: `la unión "${n.id}" solo puede tener una salida` })
    }
    if (n.type === 'fork' && sal.length < 2) {
      issues.push({ kind: 'semantica', detail: `la bifurcación "${n.id}" necesita al menos dos salidas` })
    }
    if (n.type === 'join' && ent < 2) {
      issues.push({ kind: 'semantica', detail: `la unión "${n.id}" necesita al menos dos entradas` })
    }
    // Un nodo de acción sin salida ni final es un flujo que se corta a medias.
    if ((n.type === 'action' || n.type === 'sendSignal') && sal.length === 0) {
      issues.push({ kind: 'semantica', detail: `la acción "${n.id}" no lleva a ningún sitio` })
    }
  }

  const conInicial = model.nodes.some((n) => n.type === 'initial')
  if (!conInicial) issues.push({ kind: 'semantica', detail: 'la actividad no declara nodo inicial' })

  // Nodos que se salen de su calle: rompe la lectura de la partición, que es
  // justo lo que el diagrama afirma sobre quién ejecuta cada acción.
  const porId = new Map(l.nodes.map((n) => [n.id, n]))
  for (const p of l.particiones) {
    for (const n of model.nodes.filter((x) => x.particion === p.id)) {
      const placed = porId.get(n.id)!
      if ((n.abarca ?? 1) > 1) continue
      if (placed.cx - placed.w / 2 < p.x1 - 1 || placed.cx + placed.w / 2 > p.x2 + 1) {
        issues.push({ kind: 'fuera-de-particion', detail: `"${n.id}" se sale de la partición "${p.id}"` })
      }
    }
  }

  return issues
}
