// Motor de layout de diagramas de despliegue UML 2.5.1.
//
// Este es el diagrama que en el enunciado se pide como "diagrama de red". UML
// no tiene ninguno con ese nombre: sus 14 tipos no incluyen una vista de red, y
// el elemento que representa una máquina, un entorno de ejecución y el enlace
// físico entre ellos es el diagrama de despliegue. Así que se entrega como
// despliegue —nodos «device» y «executionEnvironment», artefactos desplegados y
// caminos de comunicación con su protocolo— que es lo que la notación permite
// afirmar sin inventarse símbolos.
//
// Mermaid tampoco tiene este diagrama: no hay caja tridimensional, ni
// artefactos, ni estereotipos. El SVG se genera aquí.
//
// Módulo PURO: sin Astro, sin BD.

import { wrap, type Pt } from './bpmn-layout'

export type { Pt }

/**
 * Estereotipo del nodo. UML distingue el hardware del entorno que corre encima,
 * y la distinción no es cosmética: un «device» es algo que se puede desenchufar,
 * un «executionEnvironment» algo que se puede reiniciar.
 */
export type UmlNodoEstereotipo = 'device' | 'executionEnvironment'

/** Elemento contenido en un nodo: otro nodo anidado o un artefacto desplegado. */
export type UmlContenido =
  | { tipo: 'nodo'; label: string; estereotipo: UmlNodoEstereotipo; detalle?: string }
  | { tipo: 'artefacto'; label: string; detalle?: string }

export interface UmlNodo {
  id: string
  label: string
  estereotipo: UmlNodoEstereotipo
  col: number
  fila: number
  /** Columnas que ocupa. Un nodo que aloja a varios se dibuja abarcándolos. */
  span?: number
  contenido?: UmlContenido[]
}

export interface UmlCamino {
  from: string
  to: string
  /**
   * Protocolo del camino de comunicación, impreso como estereotipo. Un camino
   * sin protocolo no dice nada que no dijera ya un diagrama de cajas: es
   * obligatorio y los tests lo exigen.
   */
  protocolo: string
  /** Nota breve sobre qué viaja por ahí. */
  detalle?: string
  /** El tráfico va en los dos sentidos (webhooks de vuelta, por ejemplo). */
  bidireccional?: boolean
}

export interface UmlDeploymentModel {
  id: string
  titulo: string
  desc: string
  origen: string
  nodos: UmlNodo[]
  caminos: UmlCamino[]
  nota?: string
}

export const GEO = {
  colW: 248,
  colGap: 26,
  filaGap: 96,
  padX: 26,
  padY: 26,
  /** Cabecera del nodo: estereotipo + nombre. */
  headerH: 40,
  /** Alto de cada elemento contenido. */
  elemH: 30,
  elemGap: 7,
  padInterior: 10,
  /** Profundidad de la caja tridimensional. */
  prof: 11,
} as const

export interface PlacedContenido {
  tipo: 'nodo' | 'artefacto'
  label: string
  detalle?: string
  estereotipo?: UmlNodoEstereotipo
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedNodo extends UmlNodo {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  elementos: PlacedContenido[]
}

export interface PlacedCamino extends UmlCamino {
  a: Pt
  b: Pt
  at: Pt
  align: 'start' | 'middle' | 'end'
  lines: string[]
}

export interface DeploymentLayout {
  w: number
  h: number
  nodos: PlacedNodo[]
  caminos: PlacedCamino[]
}

// Sin métricas de fuente en el servidor, el texto se mide por caracteres, con
// holgura: el cálculo sirve para apartar etiquetas del camino que rotulan.
const CHAR_W = 5.9
const LINE_H = 11

interface Caja {
  x1: number
  x2: number
  y1: number
  y2: number
}

function cajaEtiqueta(at: Pt, align: 'start' | 'middle' | 'end', lines: string[]): Caja {
  const w = Math.max(...lines.map((l) => l.length)) * CHAR_W
  const h = lines.length * LINE_H
  const x1 = align === 'start' ? at.x : align === 'end' ? at.x - w : at.x - w / 2
  return { x1, x2: x1 + w, y1: at.y - h / 2, y2: at.y + h / 2 }
}

const cajasSeCortan = (a: Caja, b: Caja): boolean => a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2

/** ¿El segmento atraviesa la caja? Muestreo: basta para detectar el choque. */
function cortaCaja(a: Pt, b: Pt, c: Caja): boolean {
  const pasos = 40
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    if (x > c.x1 && x < c.x2 && y > c.y1 && y < c.y2) return true
  }
  return false
}

const anchoNodo = (n: UmlNodo): number => (n.span ?? 1) * GEO.colW + ((n.span ?? 1) - 1) * GEO.colGap

const altoNodo = (n: UmlNodo): number => {
  const k = n.contenido?.length ?? 0
  if (k === 0) return GEO.headerH + GEO.padInterior
  return GEO.headerH + GEO.padInterior + k * GEO.elemH + (k - 1) * GEO.elemGap + GEO.padInterior
}

/** Punto del borde del nodo en dirección a `hacia`. */
function borde(n: PlacedNodo, hacia: Pt): Pt {
  const dx = hacia.x - n.cx
  const dy = hacia.y - n.cy
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: n.cx, y: n.cy }
  const escala = Math.min(
    Math.abs(dx) < 0.001 ? Infinity : n.w / 2 / Math.abs(dx),
    Math.abs(dy) < 0.001 ? Infinity : n.h / 2 / Math.abs(dy),
  )
  return { x: n.cx + dx * escala, y: n.cy + dy * escala }
}

export function layout(model: UmlDeploymentModel): DeploymentLayout {
  const { colW, colGap, filaGap, padX, padY, headerH, elemH, elemGap, padInterior, prof } = GEO

  // Cada fila mide lo que su nodo más alto: con alturas variables, una rejilla
  // de paso fijo dejaría huecos enormes bajo las filas de nodos pequeños.
  const filas = [...new Set(model.nodos.map((n) => n.fila))].sort((a, b) => a - b)
  const altoDeFila = new Map(filas.map((f) => [f, Math.max(...model.nodos.filter((n) => n.fila === f).map(altoNodo))]))
  const yDeFila = new Map<number, number>()
  let acumulado = padY + prof
  for (const f of filas) {
    yDeFila.set(f, acumulado)
    acumulado += (altoDeFila.get(f) ?? 0) + filaGap
  }

  const nodos: PlacedNodo[] = model.nodos.map((n) => {
    const w = anchoNodo(n)
    const h = altoNodo(n)
    const x = padX + n.col * (colW + colGap)
    const y = yDeFila.get(n.fila)!

    const elementos: PlacedContenido[] = (n.contenido ?? []).map((c, i) => ({
      tipo: c.tipo,
      label: c.label,
      detalle: c.detalle,
      estereotipo: c.tipo === 'nodo' ? c.estereotipo : undefined,
      x: x + padInterior,
      y: y + headerH + padInterior + i * (elemH + elemGap),
      w: w - padInterior * 2,
      h: elemH,
    }))

    return { ...n, x, y, w, h, cx: x + w / 2, cy: y + h / 2, elementos }
  })

  const porId = new Map(nodos.map((n) => [n.id, n]))
  const cajasOcupadas: Caja[] = nodos.map((n) => ({ x1: n.x, x2: n.x + n.w, y1: n.y - GEO.prof, y2: n.y + n.h }))

  // La geometría de TODOS los caminos se calcula antes de rotular ninguno: un
  // rótulo colocado mirando solo a los caminos ya trazados acabaría bajo el
  // siguiente, y el protocolo es justo el dato que este diagrama aporta.
  const trazos: [Pt, Pt][] = model.caminos.map((c) => {
    const na = porId.get(c.from)
    const nb = porId.get(c.to)
    if (!na || !nb) throw new Error(`Camino ${c.from}→${c.to}: nodo inexistente`)
    return [borde(na, { x: nb.cx, y: nb.cy }), borde(nb, { x: na.cx, y: na.cy })]
  })

  const caminos: PlacedCamino[] = model.caminos.map((c, indice) => {
    const [a, b] = trazos[indice]
    const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const dx = b.x - a.x
    const dy = b.y - a.y
    const largoCamino = Math.hypot(dx, dy) || 1
    const dir = { x: dx / largoCamino, y: dy / largoCamino }
    const perp = { x: -dir.y, y: dir.x }
    const lines = wrap(`«${c.protocolo}»${c.detalle ? ` ${c.detalle}` : ''}`, 30, 2)

    // La etiqueta busca sitio en vez de sentarse a una distancia fija: los
    // caminos aquí son largos y diagonales, y el texto se escribe horizontal,
    // así que una separación fija deja el rótulo cruzado por su propia línea o
    // pisando el nodo que conecta.
    const candidatos: { at: Pt; align: 'start' | 'middle' | 'end'; caja: Caja; coste: number }[] = []
    for (const signo of [perp.y < 0 ? 1 : -1, perp.y < 0 ? -1 : 1]) {
      for (let paso = 0; paso < 10; paso++) {
        for (const corrida of [0, 40, -40, 80, -80]) {
          const off = signo * (11 + paso * 9)
          const at = { x: medio.x + perp.x * off + dir.x * corrida, y: medio.y + perp.y * off + dir.y * corrida }
          const align = perp.x * signo > 0.4 ? 'start' : perp.x * signo < -0.4 ? 'end' : 'middle'
          candidatos.push({ at, align, caja: cajaEtiqueta(at, align, lines), coste: paso * 10 + Math.abs(corrida) * 0.3 })
        }
      }
    }
    candidatos.sort((x, y) => x.coste - y.coste)
    const libre = (caja: Caja) =>
      !cajasOcupadas.some((k) => cajasSeCortan(caja, k)) && !trazos.some(([p, q]) => cortaCaja(p, q, caja))
    const elegido = candidatos.find((k) => libre(k.caja)) ?? candidatos[0]
    cajasOcupadas.push(elegido.caja)

    return { ...c, a, b, at: elegido.at, align: elegido.align, lines }
  })

  const w = nodos.reduce((max, n) => Math.max(max, n.x + n.w), 0) + padX + prof
  const h = nodos.reduce((max, n) => Math.max(max, n.y + n.h), 0) + padY

  return { w, h, nodos, caminos }
}

// ── Verificación ────────────────────────────────────────────────────────────

export interface LayoutIssue {
  kind: 'overlap' | 'camino-cruza-nodo' | 'semantica' | 'etiqueta-encimada'
  detail: string
}

type Box = Caja

const bbox = (n: PlacedNodo): Box => ({ x1: n.x, x2: n.x + n.w, y1: n.y, y2: n.y + n.h })
const grow = (b: Box, m: number): Box => ({ x1: b.x1 - m, x2: b.x2 + m, y1: b.y1 - m, y2: b.y2 + m })
const overlap = (a: Box, b: Box): boolean => a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2

function segmentoCruza(a: Pt, b: Pt, box: Box): boolean {
  const pasos = 60
  for (let i = 1; i < pasos; i++) {
    const t = i / pasos
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    if (x > box.x1 && x < box.x2 && y > box.y1 && y < box.y2) return true
  }
  return false
}

export function findLayoutIssues(model: UmlDeploymentModel): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const l = layout(model)

  for (let i = 0; i < l.nodos.length; i++) {
    for (let j = i + 1; j < l.nodos.length; j++) {
      if (overlap(grow(bbox(l.nodos[i]), 8), bbox(l.nodos[j]))) {
        issues.push({ kind: 'overlap', detail: `"${l.nodos[i].id}" y "${l.nodos[j].id}" se solapan` })
      }
    }
  }

  for (const c of l.caminos) {
    for (const n of l.nodos) {
      if (n.id === c.from || n.id === c.to) continue
      if (segmentoCruza(c.a, c.b, grow(bbox(n), 3))) {
        issues.push({ kind: 'camino-cruza-nodo', detail: `el camino ${c.from}–${c.to} cruza "${n.id}"` })
      }
    }
  }

  // Rótulos de protocolo: ni sobre un nodo ni unos sobre otros. Es el dato que
  // justifica el diagrama, así que no puede quedar tapado.
  const etiquetas = l.caminos.map((c) => ({ id: `${c.from}–${c.to}`, caja: cajaEtiqueta(c.at, c.align, c.lines) }))
  for (let i = 0; i < etiquetas.length; i++) {
    for (let j = i + 1; j < etiquetas.length; j++) {
      if (cajasSeCortan(etiquetas[i].caja, etiquetas[j].caja)) {
        issues.push({ kind: 'etiqueta-encimada', detail: `los rótulos de ${etiquetas[i].id} y ${etiquetas[j].id} se enciman` })
      }
    }
    for (const n of l.nodos) {
      if (cajasSeCortan(etiquetas[i].caja, bbox(n))) {
        issues.push({ kind: 'etiqueta-encimada', detail: `el rótulo de ${etiquetas[i].id} cae sobre "${n.id}"` })
      }
    }
    for (const c of l.caminos) {
      if (cortaCaja(c.a, c.b, etiquetas[i].caja)) {
        issues.push({ kind: 'etiqueta-encimada', detail: `el camino ${c.from}–${c.to} atraviesa el rótulo de ${etiquetas[i].id}` })
      }
    }
  }

  const ids = new Set(model.nodos.map((n) => n.id))
  for (const c of model.caminos) {
    if (!ids.has(c.from)) issues.push({ kind: 'semantica', detail: `camino con origen inexistente: ${c.from}` })
    if (!ids.has(c.to)) issues.push({ kind: 'semantica', detail: `camino con destino inexistente: ${c.to}` })
    // Un camino de comunicación sin protocolo es una raya entre dos cajas: la
    // información que aporta el diagrama está justo en el estereotipo.
    if (!c.protocolo.trim()) {
      issues.push({ kind: 'semantica', detail: `el camino ${c.from}–${c.to} no declara protocolo` })
    }
  }

  // Un nodo desconectado no está desplegado en ninguna parte.
  for (const n of model.nodos) {
    if (!model.caminos.some((c) => c.from === n.id || c.to === n.id)) {
      issues.push({ kind: 'semantica', detail: `el nodo "${n.id}" no tiene ningún camino de comunicación` })
    }
  }

  // Un nodo vacío no despliega nada: o le falta el artefacto, o sobra el nodo.
  for (const n of model.nodos) {
    if (!n.contenido || n.contenido.length === 0) {
      issues.push({ kind: 'semantica', detail: `el nodo "${n.id}" no despliega ningún artefacto` })
    }
  }

  return issues
}
