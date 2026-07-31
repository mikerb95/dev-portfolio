// Motor de layout de diagramas de comunicación UML 2.5.1.
//
// Mermaid no tiene este diagrama: ni una aproximación. Y es el que peor se
// sustituye por otro, porque su aportación no es la información —la misma que
// la de un diagrama de secuencia— sino el ÉNFASIS: la secuencia enseña el
// tiempo, la comunicación enseña la estructura de enlaces. Por eso estos
// modelos se derivan de las MISMAS interacciones que ya están en
// /docs/diagrama-secuencia, con los mismos participantes: si un mensaje aparece
// aquí y no allí, uno de los dos diagramas está mintiendo.
//
// Módulo PURO: sin Astro, sin BD.

import { wrap, type Pt } from './bpmn-layout'

export type { Pt }

/** Estereotipo del objeto. Se imprime entre comillas angulares, como el estándar. */
export type UmlEstereotipo = 'actor' | 'boundary' | 'control' | 'entity' | 'external'

export interface UmlObjeto {
  id: string
  /** Nombre de la instancia. Vacío = objeto anónimo, se imprime ":Clase". */
  nombre?: string
  clase: string
  estereotipo?: UmlEstereotipo
  /** Posición en la rejilla; admite medios pasos para separar visualmente. */
  col: number
  fila: number
}

export interface UmlMensaje {
  /**
   * Número de secuencia decimal: "1", "1.1", "2.3.1". Es lo único que ordena el
   * diagrama —aquí no hay eje de tiempo—, así que la numeración no es
   * decorativa: es la semántica.
   */
  seq: string
  from: string
  to: string
  label: string
  /** `reply` se dibuja con línea discontinua, como el retorno en UML. */
  kind?: 'sync' | 'async' | 'reply'
}

export interface UmlCommunicationModel {
  id: string
  titulo: string
  desc: string
  /** Diagrama de secuencia equivalente, para poder contrastar ambos. */
  equivaleA: string
  origen: string
  objetos: UmlObjeto[]
  mensajes: UmlMensaje[]
  nota?: string
}

export const GEO = {
  colW: 258,
  filaH: 132,
  padX: 96,
  padY: 74,
  boxH: 42,
  boxMinW: 128,
  /** Separación del primer mensaje respecto de su enlace. */
  msgOffset: 15,
  /** Cuánto se aparta cada mensaje adicional del mismo enlace. */
  msgPaso: 17,
  /** Media longitud de la flecha del mensaje. */
  msgLargo: 18,
} as const

const CHAR_W = 6.5

/** Etiqueta del objeto tal como se imprime: subrayada y con la clase detrás. */
export const etiquetaObjeto = (o: UmlObjeto): string => `${o.nombre ?? ''}:${o.clase}`

export interface PlacedObjeto extends UmlObjeto {
  cx: number
  cy: number
  w: number
  h: number
  etiqueta: string
}

export interface PlacedMensaje extends UmlMensaje {
  /** Punto de partida y de llegada de la flecha corta del mensaje. */
  a: Pt
  b: Pt
  /** Ancla del texto "seq: label", ya apartado del enlace. */
  at: Pt
  align: 'start' | 'middle' | 'end'
  lines: string[]
}

export interface PlacedEnlace {
  a: Pt
  b: Pt
  /** ids de los dos objetos que une, para poder auditarlo en los tests. */
  entre: [string, string]
}

export interface CommunicationLayout {
  w: number
  h: number
  objetos: PlacedObjeto[]
  enlaces: PlacedEnlace[]
  mensajes: PlacedMensaje[]
}

const len = (p: Pt): number => Math.hypot(p.x, p.y) || 1
const norm = (p: Pt): Pt => ({ x: p.x / len(p), y: p.y / len(p) })

// Sin métricas de fuente en el servidor, el tamaño del texto se estima por
// caracteres, holgado a propósito: el cálculo sirve para apartar etiquetas, y
// quedarse corto las deja encima de la línea.
const CHAR_W_MSG = 5.9
const LINE_H_MSG = 11

interface Caja {
  x1: number
  x2: number
  y1: number
  y2: number
}

/** Caja que ocupará el texto de un mensaje, según su anclaje. */
function cajaEtiqueta(at: Pt, align: 'start' | 'middle' | 'end', lines: string[]): Caja {
  const w = Math.max(...lines.map((l) => l.length)) * CHAR_W_MSG
  const h = lines.length * LINE_H_MSG
  const x1 = align === 'start' ? at.x : align === 'end' ? at.x - w : at.x - w / 2
  return { x1, x2: x1 + w, y1: at.y - h / 2, y2: at.y + h / 2 }
}

const cortaCaja = (a: Pt, b: Pt, c: Caja): boolean => {
  const pasos = 30
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    if (x > c.x1 && x < c.x2 && y > c.y1 && y < c.y2) return true
  }
  return false
}

const cajasSeCortan = (a: Caja, b: Caja): boolean => a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2

/**
 * Punto donde la recta que va del centro de la caja hacia `hacia` corta el
 * borde. El enlace UML une los bordes de los objetos, no sus centros: una línea
 * que nace dentro de la caja se lee como si la atravesara.
 */
function borde(o: PlacedObjeto, hacia: Pt): Pt {
  const dx = hacia.x - o.cx
  const dy = hacia.y - o.cy
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: o.cx, y: o.cy }
  // Se escala el vector hasta que toca la primera de las dos caras.
  const escala = Math.min(
    Math.abs(dx) < 0.001 ? Infinity : o.w / 2 / Math.abs(dx),
    Math.abs(dy) < 0.001 ? Infinity : o.h / 2 / Math.abs(dy),
  )
  return { x: o.cx + dx * escala, y: o.cy + dy * escala }
}

/** Clave estable de un enlace: no tiene dirección, un enlace se dibuja una vez. */
const claveEnlace = (a: string, b: string): string => [a, b].sort().join('~')

export function layout(model: UmlCommunicationModel): CommunicationLayout {
  const { colW, filaH, padX, padY, boxH, boxMinW } = GEO

  const objetos: PlacedObjeto[] = model.objetos.map((o) => {
    const etiqueta = etiquetaObjeto(o)
    const w = Math.max(boxMinW, Math.round(etiqueta.length * CHAR_W) + 28)
    return { ...o, etiqueta, w, h: boxH, cx: padX + o.col * colW, cy: padY + o.fila * filaH }
  })

  const porId = new Map(objetos.map((o) => [o.id, o]))
  const centro = {
    x: objetos.reduce((s, o) => s + o.cx, 0) / (objetos.length || 1),
    y: objetos.reduce((s, o) => s + o.cy, 0) / (objetos.length || 1),
  }

  // Un enlace por pareja, con sus mensajes en el orden en que se declararon.
  const porEnlace = new Map<string, UmlMensaje[]>()
  for (const m of model.mensajes) {
    if (m.from === m.to) continue
    const k = claveEnlace(m.from, m.to)
    porEnlace.set(k, [...(porEnlace.get(k) ?? []), m])
  }

  // Los enlaces se colocan TODOS antes que los mensajes: una etiqueta que se
  // aparta tiene que poder comprobar que no aterriza sobre un enlace que
  // todavía no se había calculado.
  const enlaces: PlacedEnlace[] = []
  for (const clave of porEnlace.keys()) {
    const [idA, idB] = clave.split('~')
    const oa = porId.get(idA)
    const ob = porId.get(idB)
    if (!oa || !ob) throw new Error(`Enlace ${clave}: objeto inexistente`)
    enlaces.push({ a: borde(oa, { x: ob.cx, y: ob.cy }), b: borde(ob, { x: oa.cx, y: oa.cy }), entre: [idA, idB] })
  }

  const cajasOcupadas: Caja[] = objetos.map(
    (o): Caja => ({ x1: o.cx - o.w / 2, x2: o.cx + o.w / 2, y1: o.cy - o.h / 2, y2: o.cy + o.h / 2 }),
  )
  // Toda la geometría de trazos —enlaces y flechas de mensaje— se calcula ANTES
  // de colocar ninguna etiqueta. Si se hicieran mensaje a mensaje, un rótulo ya
  // colocado podría acabar bajo la flecha de un mensaje posterior, que es
  // exactamente lo que no puede pasar: el texto tiene que poder leerse.
  const segmentos: [Pt, Pt][] = enlaces.map((e) => [e.a, e.b])

  interface Pendiente {
    m: UmlMensaje
    a: Pt
    b: Pt
    lines: string[]
    dir: Pt
    perp: Pt
    medio: Pt
    haciaFuera: number
    i: number
  }
  const pendientes: Pendiente[] = []

  for (const [clave, lista] of porEnlace) {
    const [idA, idB] = clave.split('~')
    const oa = porId.get(idA)!
    const ob = porId.get(idB)!

    const pa = borde(oa, { x: ob.cx, y: ob.cy })
    const pb = borde(ob, { x: oa.cx, y: oa.cy })

    const dir = norm({ x: pb.x - pa.x, y: pb.y - pa.y })
    const perp = { x: -dir.y, y: dir.x }
    const medio = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
    // Los mensajes se apartan del enlace hacia AFUERA del diagrama: hacia
    // dentro acabarían encima de los enlaces del centro, que es la zona más
    // poblada del dibujo.
    const haciaFuera = perp.x * (medio.x - centro.x) + perp.y * (medio.y - centro.y) >= 0 ? 1 : -1

    lista.forEach((m, i) => {
      const off = haciaFuera * (GEO.msgOffset + i * GEO.msgPaso)
      const base = { x: medio.x + perp.x * off, y: medio.y + perp.y * off }
      // La flecha apunta en el sentido real del mensaje, no en el del enlace.
      const signo = m.from === idA ? 1 : -1
      const a = { x: base.x - dir.x * GEO.msgLargo * signo, y: base.y - dir.y * GEO.msgLargo * signo }
      const b = { x: base.x + dir.x * GEO.msgLargo * signo, y: base.y + dir.y * GEO.msgLargo * signo }
      segmentos.push([a, b])
      pendientes.push({ m, a, b, lines: wrap(`${m.seq}: ${m.label}`, 34, 2), dir, perp, medio, haciaFuera, i })
    })
  }

  /** ¿La caja de una etiqueta choca con algo ya dibujado? */
  const chocaConAlgo = (caja: Caja): boolean =>
    cajasOcupadas.some((c) => cajasSeCortan(caja, c)) || segmentos.some(([p, q]) => cortaCaja(p, q, caja))

  const mensajes: PlacedMensaje[] = []
  for (const { m, a, b, lines, dir, perp, medio, haciaFuera, i } of pendientes) {
    {
      // Colocación de la etiqueta por búsqueda, no por desplazamiento fijo.
      //
      // Apartarla en perpendicular no basta y no es cuestión de apartarla más:
      // el texto se escribe horizontal aunque el enlace sea diagonal, y en un
      // enlace vertical alejarse en perpendicular mueve la etiqueta a lo largo
      // de su propio ancho, así que puede no despejar nunca. Se prueban
      // posiciones ordenadas por cuánto se alejan de la ideal —primero el lado
      // natural y sin correr, luego más lejos, luego corrida a lo largo del
      // enlace y por último el lado contrario— y gana la primera libre.
      const candidatos: { at: Pt; align: 'start' | 'middle' | 'end'; caja: Caja; coste: number }[] = []
      for (const lado of [haciaFuera, -haciaFuera]) {
        for (let paso = 0; paso < 14; paso++) {
          for (const corrida of [0, 32, -32, 64, -64]) {
            const offPerp = lado * (GEO.msgOffset + i * GEO.msgPaso + 13 + paso * 9)
            const at = {
              x: medio.x + perp.x * offPerp + dir.x * corrida,
              y: medio.y + perp.y * offPerp + dir.y * corrida,
            }
            const desplazamientoX = perp.x * offPerp
            const align = desplazamientoX > 6 ? 'start' : desplazamientoX < -6 ? 'end' : 'middle'
            candidatos.push({
              at,
              align,
              caja: cajaEtiqueta(at, align, lines),
              coste: paso * 10 + Math.abs(corrida) * 0.35 + (lado === haciaFuera ? 0 : 22),
            })
          }
        }
      }
      candidatos.sort((x, y) => x.coste - y.coste)
      const elegido = candidatos.find((c) => !chocaConAlgo(c.caja)) ?? candidatos[0]

      // La etiqueta ya colocada pasa a ser un obstáculo para las siguientes.
      cajasOcupadas.push(elegido.caja)

      mensajes.push({ ...m, a, b, at: elegido.at, align: elegido.align, lines })
    })
  }

  // Mensajes reflexivos: no tienen enlace propio, se dibujan como un lazo sobre
  // la esquina superior derecha del objeto.
  for (const m of model.mensajes.filter((x) => x.from === x.to)) {
    const o = porId.get(m.from)
    if (!o) throw new Error(`Mensaje reflexivo ${m.seq}: objeto inexistente`)
    const a = { x: o.cx + o.w / 2 - 16, y: o.cy - o.h / 2 }
    const b = { x: o.cx + o.w / 2, y: o.cy - o.h / 2 + 14 }
    const lines = wrap(`${m.seq}: ${m.label}`, 30, 2)

    // La etiqueta del lazo también busca sitio: la esquina superior derecha del
    // objeto es la posición natural, pero es justo por donde suelen salir sus
    // enlaces, así que se prueban las cuatro esquinas alejándose.
    const esquinas = [
      { dx: 1, dy: -1, align: 'start' as const },
      { dx: -1, dy: -1, align: 'end' as const },
      { dx: 1, dy: 1, align: 'start' as const },
      { dx: -1, dy: 1, align: 'end' as const },
    ]
    const candidatos = esquinas.flatMap((e) =>
      Array.from({ length: 8 }, (_, paso) => {
        const at = { x: o.cx + e.dx * (o.w / 2 + 16 + paso * 8), y: o.cy + e.dy * (o.h / 2 + 12 + paso * 8) }
        return { at, align: e.align, caja: cajaEtiqueta(at, e.align, lines) }
      }),
    )
    const elegido = candidatos.find((c) => !chocaConAlgo(c.caja)) ?? candidatos[0]
    cajasOcupadas.push(elegido.caja)

    mensajes.push({ ...m, a, b, at: elegido.at, align: elegido.align, lines })
  }

  const w = objetos.reduce((max, o) => Math.max(max, o.cx + o.w / 2), 0) + padX
  const h = objetos.reduce((max, o) => Math.max(max, o.cy + o.h / 2), 0) + padY

  return { w, h, objetos, enlaces, mensajes }
}

// ── Verificación ────────────────────────────────────────────────────────────

export interface LayoutIssue {
  kind: 'overlap' | 'enlace-cruza-objeto' | 'numeracion' | 'semantica' | 'etiqueta-encimada'
  detail: string
}

type Box = Caja

const bbox = (o: PlacedObjeto): Box => ({
  x1: o.cx - o.w / 2,
  x2: o.cx + o.w / 2,
  y1: o.cy - o.h / 2,
  y2: o.cy + o.h / 2,
})

const grow = (b: Box, m: number): Box => ({ x1: b.x1 - m, x2: b.x2 + m, y1: b.y1 - m, y2: b.y2 + m })
const overlap = (a: Box, b: Box): boolean => a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2

/** ¿El segmento a→b atraviesa la caja? Muestreo: basta para detectar el choque. */
function segmentoCruza(a: Pt, b: Pt, box: Box): boolean {
  const pasos = 40
  for (let i = 1; i < pasos; i++) {
    const t = i / pasos
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    if (x > box.x1 && x < box.x2 && y > box.y1 && y < box.y2) return true
  }
  return false
}

export function findLayoutIssues(model: UmlCommunicationModel): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const l = layout(model)

  for (let i = 0; i < l.objetos.length; i++) {
    for (let j = i + 1; j < l.objetos.length; j++) {
      if (overlap(grow(bbox(l.objetos[i]), 16), bbox(l.objetos[j]))) {
        issues.push({ kind: 'overlap', detail: `"${l.objetos[i].id}" y "${l.objetos[j].id}" se solapan` })
      }
    }
  }

  for (const e of l.enlaces) {
    for (const o of l.objetos) {
      if (e.entre.includes(o.id)) continue
      if (segmentoCruza(e.a, e.b, grow(bbox(o), 4))) {
        issues.push({ kind: 'enlace-cruza-objeto', detail: `el enlace ${e.entre.join('–')} cruza "${o.id}"` })
      }
    }
  }

  // Etiquetas: ni sobre un objeto, ni unas sobre otras, ni sobre un enlace que
  // no sea el suyo. Es donde más se degrada este diagrama, porque los mensajes
  // se acumulan alrededor del objeto más conectado.
  const etiquetas = l.mensajes.map((m) => ({ seq: m.seq, caja: cajaEtiqueta(m.at, m.align, m.lines) }))
  for (let i = 0; i < etiquetas.length; i++) {
    for (let j = i + 1; j < etiquetas.length; j++) {
      if (cajasSeCortan(etiquetas[i].caja, etiquetas[j].caja)) {
        issues.push({ kind: 'etiqueta-encimada', detail: `los mensajes ${etiquetas[i].seq} y ${etiquetas[j].seq} se enciman` })
      }
    }
    for (const o of l.objetos) {
      if (cajasSeCortan(etiquetas[i].caja, bbox(o))) {
        issues.push({ kind: 'etiqueta-encimada', detail: `el mensaje ${etiquetas[i].seq} cae sobre el objeto "${o.id}"` })
      }
    }
    for (const e of l.enlaces) {
      if (cortaCaja(e.a, e.b, etiquetas[i].caja)) {
        issues.push({ kind: 'etiqueta-encimada', detail: `el enlace ${e.entre.join('–')} atraviesa la etiqueta del mensaje ${etiquetas[i].seq}` })
      }
    }
  }

  const ids = new Set(model.objetos.map((o) => o.id))
  for (const m of model.mensajes) {
    if (!ids.has(m.from)) issues.push({ kind: 'semantica', detail: `mensaje ${m.seq}: origen "${m.from}" no existe` })
    if (!ids.has(m.to)) issues.push({ kind: 'semantica', detail: `mensaje ${m.seq}: destino "${m.to}" no existe` })
  }

  // La numeración decimal ES el orden del diagrama: sin eje de tiempo, un
  // número repetido o un nivel huérfano dejan la interacción sin lectura única.
  const vistos = new Set<string>()
  for (const m of model.mensajes) {
    if (vistos.has(m.seq)) issues.push({ kind: 'numeracion', detail: `número de secuencia repetido: ${m.seq}` })
    vistos.add(m.seq)
    if (!/^\d+(\.\d+)*$/.test(m.seq)) {
      issues.push({ kind: 'numeracion', detail: `número de secuencia mal formado: "${m.seq}"` })
    }
  }
  for (const m of model.mensajes) {
    const partes = m.seq.split('.')
    if (partes.length < 2) continue
    const padre = partes.slice(0, -1).join('.')
    if (!vistos.has(padre)) {
      issues.push({ kind: 'numeracion', detail: `el mensaje ${m.seq} no tiene padre ${padre}` })
    }
  }
  if (model.mensajes.length > 0 && !vistos.has('1')) {
    issues.push({ kind: 'numeracion', detail: 'la interacción no arranca en el mensaje 1' })
  }

  // Un objeto sin ningún mensaje no participa: o sobra, o falta un mensaje.
  for (const o of model.objetos) {
    if (!model.mensajes.some((m) => m.from === o.id || m.to === o.id)) {
      issues.push({ kind: 'semantica', detail: `el objeto "${o.id}" no participa en ningún mensaje` })
    }
  }

  return issues
}
