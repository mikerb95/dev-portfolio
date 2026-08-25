// Motor de layout del diagrama de red de /docs/diagrama-red.
//
// Este diagrama NO es UML y no pretende serlo: UML 2.5.1 no tiene vista de red,
// y esa carencia ya se resolvió por el lado correcto en el diagrama de
// despliegue (nodos, artefactos y caminos con protocolo). Lo que falta ahí es
// otra pregunta, la que se hace en operación y no en diseño: qué zona de
// confianza puede hablar con cuál, por qué puerto, y qué control atraviesa el
// tráfico al cruzar la frontera. El despliegue dice DÓNDE corre cada cosa; este
// dice QUÉ puede alcanzar a qué y qué lo filtra.
//
// Por eso la notación es propia y explícita, no un UML disfrazado: zonas de
// confianza con nivel numérico, hosts dentro de ellas, y flujos dirigidos con
// protocolo, puerto y controles. La regla dura del modelo -y lo que este motor
// verifica- es que ningún flujo entre a una zona más confiable saltándose un
// nivel: Internet no habla con la base de datos, habla con el borde.
//
// Módulo PURO: sin Astro, sin BD. La geometría genérica (corte de texto, tipo
// Pt) se reutiliza del motor BPMN.

import { wrap, type Pt } from './bpmn-layout'

export type { Pt }

/**
 * Nivel de confianza de la zona. Más alto es más confiable. No es decorativo:
 * la diferencia de nivel entre los extremos de un flujo es lo que decide si el
 * tráfico es legal o si el diagrama está describiendo un agujero.
 */
export type NivelConfianza = 0 | 1 | 2 | 3

export interface RedZona {
  id: string
  label: string
  /** Qué se asume de quien está dentro. Se imprime bajo el título. */
  nota?: string
  nivel: NivelConfianza
  /** Columna de la rejilla global donde arranca la banda. */
  col: number
  /** Columnas que ocupa. */
  span: number
  /**
   * Columnas de la rejilla INTERNA. Por defecto, las que ocupen sus hosts. Se
   * declara cuando la zona tiene menos hosts que columnas y se quiere que
   * queden centrados en vez de apilados contra el margen izquierdo.
   */
  cols?: number
}

export interface RedHost {
  id: string
  /** Zona a la que pertenece. Un host sin zona no existe en este diagrama. */
  zona: string
  label: string
  /** Papel del host: «cliente», «perímetro», «cómputo», «datos», «tercero». */
  rol: string
  /** Columna dentro de la zona (rejilla propia, no la global). */
  col: number
  /** Fila dentro de la zona. Por defecto la primera. */
  fila?: number
  span?: number
  /** Hasta dos líneas de detalle: qué expone, qué corre. */
  detalle?: string[]
}

export interface RedFlujo {
  from: string
  to: string
  /** Protocolo del enlace. Obligatorio: sin él esto es una raya entre cajas. */
  protocolo: string
  /**
   * Puerto de destino. Obligatorio en todo flujo que cruza una frontera de
   * zona, que es donde el dato importa; dentro de la misma zona sobra.
   */
  puerto?: string
  /**
   * Controles que atraviesa el tráfico. Obligatorio al cruzar frontera: una
   * flecha que entra a una zona más confiable sin nada que la filtre es
   * exactamente el hallazgo que este diagrama existe para hacer visible.
   */
  controles?: string[]
  detalle?: string
  /** El tráfico vuelve por el mismo enlace (respuesta de la aplicación). */
  bidireccional?: boolean
  /**
   * Desvío perpendicular del trazo, en píxeles. Se usa solo cuando la recta
   * pasaría por encima de un host ajeno: es un escape geométrico, no semántica.
   */
  curva?: number
}

export interface RedModel {
  id: string
  titulo: string
  desc: string
  origen: string
  nota?: string
  zonas: RedZona[]
  hosts: RedHost[]
  flujos: RedFlujo[]
}

export const GEO = {
  colW: 206,
  colGap: 22,
  padX: 26,
  padY: 26,
  /** Separación vertical entre bandas de zona. Es donde viven los rótulos. */
  filaGap: 78,
  zonaTituloH: 34,
  zonaPad: 14,
  hostGapX: 14,
  hostGapY: 12,
  /** Cabecera del host: rol + nombre. */
  hostHeaderH: 32,
  detalleH: 13,
  hostPadY: 9,
} as const

export interface PlacedZona extends RedZona {
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedHost extends RedHost {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

export interface PlacedFlujo extends RedFlujo {
  /** Número de referencia, correlativo con la tabla de controles. */
  num: number
  a: Pt
  b: Pt
  /** Punto de control de la cuadrática. Igual al medio si el trazo es recto. */
  ctrl: Pt
  at: Pt
  align: 'start' | 'middle' | 'end'
  lines: string[]
  /** El flujo cruza una frontera de zona. */
  cruzaFrontera: boolean
}

export interface RedLayout {
  w: number
  h: number
  zonas: PlacedZona[]
  hosts: PlacedHost[]
  flujos: PlacedFlujo[]
}

// Sin métricas de fuente en el servidor, el texto se mide por caracteres con
// holgura: basta para apartar un rótulo de lo que taparía.
const CHAR_W = 5.9
const LINE_H = 11

interface Caja {
  x1: number
  x2: number
  y1: number
  y2: number
}

const cajasSeCortan = (a: Caja, b: Caja): boolean => a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2

function cajaEtiqueta(at: Pt, align: 'start' | 'middle' | 'end', lines: string[]): Caja {
  const w = Math.max(...lines.map((l) => l.length)) * CHAR_W
  const h = lines.length * LINE_H
  const x1 = align === 'start' ? at.x : align === 'end' ? at.x - w : at.x - w / 2
  return { x1, x2: x1 + w, y1: at.y - h / 2, y2: at.y + h / 2 }
}

/**
 * Puntos de la traza. Con `curva` el trazo es una cuadrática, así que no basta
 * mirar los extremos: todo lo que verifica cruces muestrea esta polilínea.
 */
export function puntosTraza(a: Pt, ctrl: Pt, b: Pt, pasos = 24): Pt[] {
  if (ctrl.x === (a.x + b.x) / 2 && ctrl.y === (a.y + b.y) / 2) return [a, b]
  const pts: Pt[] = []
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    const u = 1 - t
    pts.push({
      x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y,
    })
  }
  return pts
}

/** ¿La polilínea atraviesa la caja? Muestreo: basta para detectar el choque. */
function trazaCortaCaja(pts: Pt[], c: Caja, incluirExtremos = true): boolean {
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s]
    const b = pts[s + 1]
    const pasos = 24
    const desde = incluirExtremos ? 0 : 1
    const hasta = incluirExtremos ? pasos : pasos - 1
    for (let i = desde; i <= hasta; i++) {
      const t = i / pasos
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      if (x > c.x1 && x < c.x2 && y > c.y1 && y < c.y2) return true
    }
  }
  return false
}

const altoHost = (h: RedHost): number => GEO.hostHeaderH + (h.detalle?.length ?? 0) * GEO.detalleH + GEO.hostPadY

/** Franja de texto de la zona: título a la izquierda, nivel a la derecha, nota debajo. */
const cabeceraDeZona = (z: PlacedZona): Caja => ({ x1: z.x, x2: z.x + z.w, y1: z.y, y2: z.y + GEO.zonaTituloH })

/** Punto del borde del host en dirección a `hacia`. */
function borde(h: PlacedHost, hacia: Pt): Pt {
  const dx = hacia.x - h.cx
  const dy = hacia.y - h.cy
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: h.cx, y: h.cy }
  const escala = Math.min(
    Math.abs(dx) < 0.001 ? Infinity : h.w / 2 / Math.abs(dx),
    Math.abs(dy) < 0.001 ? Infinity : h.h / 2 / Math.abs(dy),
  )
  return { x: h.cx + dx * escala, y: h.cy + dy * escala }
}

export function layout(model: RedModel): RedLayout {
  const { colW, colGap, padX, padY, filaGap, zonaTituloH, zonaPad, hostGapX, hostGapY } = GEO

  const hostsDeZona = (zonaId: string) => model.hosts.filter((h) => h.zona === zonaId)

  // Alto de cada zona: depende de cuántas filas internas tenga y de lo alto que
  // sea el host más alto de cada una. Un paso fijo dejaría zanjas bajo las zonas
  // de un solo host.
  const altoZona = (z: RedZona): number => {
    const hs = hostsDeZona(z.id)
    if (hs.length === 0) return zonaTituloH + zonaPad * 2
    const filas = [...new Set(hs.map((h) => h.fila ?? 0))].sort((a, b) => a - b)
    const suma = filas.reduce((acc, f) => acc + Math.max(...hs.filter((h) => (h.fila ?? 0) === f).map(altoHost)), 0)
    return zonaTituloH + zonaPad + suma + (filas.length - 1) * hostGapY + zonaPad
  }

  const fila = filasDeZonas(model)
  const filas = [...new Set([...fila.values()])].sort((a, b) => a - b)
  const yDeFila = new Map<number, number>()
  let acumulado = padY
  for (const f of filas) {
    yDeFila.set(f, acumulado)
    const alto = Math.max(...model.zonas.filter((z) => fila.get(z.id) === f).map(altoZona))
    acumulado += alto + filaGap
  }

  const zonas: PlacedZona[] = model.zonas.map((z) => ({
    ...z,
    x: padX + z.col * (colW + colGap),
    y: yDeFila.get(fila.get(z.id)!)!,
    w: z.span * colW + (z.span - 1) * colGap,
    h: altoZona(z),
  }))

  const zonaPorId = new Map(zonas.map((z) => [z.id, z]))

  const hosts: PlacedHost[] = model.hosts.map((h) => {
    const z = zonaPorId.get(h.zona)
    if (!z) throw new Error(`Host ${h.id}: zona inexistente "${h.zona}"`)
    const hs = hostsDeZona(z.id)
    const cols = z.cols ?? Math.max(...hs.map((k) => k.col + (k.span ?? 1)))
    const innerW = z.w - zonaPad * 2
    const hcolW = (innerW - (cols - 1) * hostGapX) / cols
    const span = h.span ?? 1
    const fila = h.fila ?? 0
    const filasPrevias = [...new Set(hs.map((k) => k.fila ?? 0))].filter((f) => f < fila).sort((a, b) => a - b)
    const yOffset = filasPrevias.reduce(
      (acc, f) => acc + Math.max(...hs.filter((k) => (k.fila ?? 0) === f).map(altoHost)) + hostGapY,
      0,
    )

    const x = z.x + zonaPad + h.col * (hcolW + hostGapX)
    const y = z.y + zonaTituloH + zonaPad + yOffset
    const w = span * hcolW + (span - 1) * hostGapX
    const alto = altoHost(h)
    return { ...h, x, y, w, h: alto, cx: x + w / 2, cy: y + alto / 2 }
  })

  const hostPorId = new Map(hosts.map((h) => [h.id, h]))
  const cajasOcupadas: Caja[] = [
    ...hosts.map((h) => ({ x1: h.x, x2: h.x + h.w, y1: h.y, y2: h.y + h.h })),
    // La cabecera de la zona (título, nivel y nota) es texto, no decoración:
    // sin reservarla, los rótulos de los flujos que llegan desde arriba
    // aterrizan justo encima de ella.
    ...zonas.map(cabeceraDeZona),
  ]

  // La geometría de TODOS los trazos se calcula antes de rotular ninguno: un
  // rótulo colocado mirando solo a los trazos ya dibujados acabaría bajo el
  // siguiente, y el protocolo y el puerto son justo lo que este diagrama aporta.
  const trazos: { a: Pt; ctrl: Pt; b: Pt; pts: Pt[] }[] = model.flujos.map((f) => {
    const ha = hostPorId.get(f.from)
    const hb = hostPorId.get(f.to)
    if (!ha || !hb) throw new Error(`Flujo ${f.from}→${f.to}: host inexistente`)
    const medio = { x: (ha.cx + hb.cx) / 2, y: (ha.cy + hb.cy) / 2 }
    const dx = hb.cx - ha.cx
    const dy = hb.cy - ha.cy
    const largo = Math.hypot(dx, dy) || 1
    const perp = { x: -dy / largo, y: dx / largo }
    const desvio = f.curva ?? 0
    // El control se desvía el DOBLE: una cuadrática pasa por la mitad de la
    // distancia a su punto de control, así que `curva` es la separación real.
    const ctrl = { x: medio.x + perp.x * desvio * 2, y: medio.y + perp.y * desvio * 2 }
    const a = borde(ha, ctrl)
    const b = borde(hb, ctrl)
    return { a, ctrl, b, pts: puntosTraza(a, ctrl, b) }
  })

  const flujos: PlacedFlujo[] = model.flujos.map((f, indice) => {
    const { a, ctrl, b, pts } = trazos[indice]
    const ha = hostPorId.get(f.from)!
    const hb = hostPorId.get(f.to)!
    const cruzaFrontera = ha.zona !== hb.zona

    // Punto medio real de la traza, no de la cuerda: con desvío no coinciden.
    const medio = pts.length === 2 ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : pts[Math.floor(pts.length / 2)]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const largo = Math.hypot(dx, dy) || 1
    const dir = { x: dx / largo, y: dy / largo }
    const perp = { x: -dir.y, y: dir.x }
    // Un flujo interno se rotula solo con su número: su traza es corta y todo
    // su entorno está ocupado por los hosts que conecta, así que un rótulo
    // largo acaba buscando sitio a cien píxeles de la línea que nombra. El
    // protocolo se lee en la tabla, que es donde está el resto del detalle.
    const texto = cruzaFrontera ? `${indice + 1} «${f.protocolo}» ${f.puerto ?? ''}`.trim() : `${indice + 1}`
    const lines = wrap(texto, 24, 2)

    // Un flujo interno lleva su número encima de la propia traza, con halo del
    // color del fondo: es un solo carácter, la línea queda recortada bajo él, y
    // así el rótulo no puede acabar lejos de lo que nombra. Buscarle hueco no
    // sirve aquí, porque todo su entorno son los dos hosts que conecta.
    if (!cruzaFrontera) {
      const caja = cajaEtiqueta(medio, 'middle', lines)
      cajasOcupadas.push(caja)
      return { ...f, num: indice + 1, a, b, ctrl, at: medio, align: 'middle' as const, lines, cruzaFrontera }
    }

    // El rótulo busca sitio en vez de sentarse a una distancia fija: los trazos
    // son largos y diagonales y el texto se escribe horizontal, así que una
    // separación constante deja el número cruzado por su propia línea.
    const candidatos: { at: Pt; align: 'start' | 'middle' | 'end'; caja: Caja; coste: number }[] = []
    for (const signo of [perp.y < 0 ? 1 : -1, perp.y < 0 ? -1 : 1]) {
      for (let paso = 0; paso < 12; paso++) {
        for (const corrida of [0, 34, -34, 68, -68, 102, -102]) {
          const off = signo * (10 + paso * 8)
          const at = { x: medio.x + perp.x * off + dir.x * corrida, y: medio.y + perp.y * off + dir.y * corrida }
          const align = perp.x * signo > 0.4 ? 'start' : perp.x * signo < -0.4 ? 'end' : 'middle'
          candidatos.push({ at, align, caja: cajaEtiqueta(at, align, lines), coste: paso * 10 + Math.abs(corrida) * 0.28 })
        }
      }
    }
    candidatos.sort((x, y) => x.coste - y.coste)
    const libre = (caja: Caja) =>
      !cajasOcupadas.some((k) => cajasSeCortan(caja, k)) && !trazos.some((t) => trazaCortaCaja(t.pts, caja))
    const elegido = candidatos.find((k) => libre(k.caja)) ?? candidatos[0]
    cajasOcupadas.push(elegido.caja)

    return { ...f, num: indice + 1, a, b, ctrl, at: elegido.at, align: elegido.align, lines, cruzaFrontera }
  })

  const w = zonas.reduce((max, z) => Math.max(max, z.x + z.w), 0) + padX
  const h = zonas.reduce((max, z) => Math.max(max, z.y + z.h), 0) + padY

  return { w, h, zonas, hosts, flujos }
}

/**
 * Fila vertical de cada zona. Se deduce del orden declarado y de las columnas:
 * una zona baja a la fila siguiente solo si se pisa en columnas con alguna
 * anterior. Así dos zonas hermanas (datos y terceros, por ejemplo) quedan lado
 * a lado sin repetir en el modelo un número de fila que ya está implícito.
 */
function filasDeZonas(model: RedModel): Map<string, number> {
  const fila = new Map<string, number>()
  for (const z of model.zonas) {
    let f = 0
    for (const previa of model.zonas) {
      if (previa.id === z.id) break
      const sePisan = previa.col < z.col + z.span && z.col < previa.col + previa.span
      if (sePisan) f = Math.max(f, fila.get(previa.id)! + 1)
    }
    fila.set(z.id, f)
  }
  return fila
}

// ── Verificación ────────────────────────────────────────────────────────────

export interface RedIssue {
  kind: 'overlap' | 'host-fuera-de-zona' | 'traza-cruza' | 'etiqueta-encimada' | 'semantica' | 'confianza'
  detail: string
}

const bboxZona = (z: PlacedZona): Caja => ({ x1: z.x, x2: z.x + z.w, y1: z.y, y2: z.y + z.h })
const bboxHost = (h: PlacedHost): Caja => ({ x1: h.x, x2: h.x + h.w, y1: h.y, y2: h.y + h.h })
const grow = (b: Caja, m: number): Caja => ({ x1: b.x1 - m, x2: b.x2 + m, y1: b.y1 - m, y2: b.y2 + m })

export function findLayoutIssues(model: RedModel): RedIssue[] {
  const issues: RedIssue[] = []

  // ── Semántica: se comprueba antes del layout, que lanza si algo no existe.
  const idsZona = new Set<string>()
  for (const z of model.zonas) {
    if (idsZona.has(z.id)) issues.push({ kind: 'semantica', detail: `zona duplicada: ${z.id}` })
    idsZona.add(z.id)
    if (!model.hosts.some((h) => h.zona === z.id)) {
      issues.push({ kind: 'semantica', detail: `la zona "${z.id}" no contiene ningún host` })
    }
  }

  const idsHost = new Set<string>()
  for (const h of model.hosts) {
    if (idsHost.has(h.id)) issues.push({ kind: 'semantica', detail: `host duplicado: ${h.id}` })
    idsHost.add(h.id)
    if (!idsZona.has(h.zona)) issues.push({ kind: 'semantica', detail: `el host "${h.id}" declara una zona inexistente: ${h.zona}` })
    // Un host que no habla con nadie no está en la red, está en el dibujo.
    if (!model.flujos.some((f) => f.from === h.id || f.to === h.id)) {
      issues.push({ kind: 'semantica', detail: `el host "${h.id}" no participa en ningún flujo` })
    }
  }

  const zonaDe = new Map(model.hosts.map((h) => [h.id, h.zona]))
  const nivelDe = new Map(model.zonas.map((z) => [z.id, z.nivel]))

  for (const f of model.flujos) {
    const etiqueta = `${f.from}→${f.to}`
    if (!idsHost.has(f.from)) issues.push({ kind: 'semantica', detail: `flujo con origen inexistente: ${f.from}` })
    if (!idsHost.has(f.to)) issues.push({ kind: 'semantica', detail: `flujo con destino inexistente: ${f.to}` })
    if (!idsHost.has(f.from) || !idsHost.has(f.to)) continue
    if (!f.protocolo.trim()) issues.push({ kind: 'semantica', detail: `el flujo ${etiqueta} no declara protocolo` })

    const za = zonaDe.get(f.from)!
    const zb = zonaDe.get(f.to)!
    if (za === zb) continue

    // Cruzar frontera es lo que este diagrama documenta: sin puerto ni control,
    // la flecha no dice nada que no dijera ya el diagrama de despliegue.
    if (!f.puerto?.trim()) {
      issues.push({ kind: 'semantica', detail: `el flujo ${etiqueta} cruza de "${za}" a "${zb}" sin declarar puerto` })
    }
    if (!f.controles?.length) {
      issues.push({ kind: 'semantica', detail: `el flujo ${etiqueta} cruza de "${za}" a "${zb}" sin declarar ningún control` })
    }

    // La regla dura: entrar a una zona más confiable se hace de un nivel en un
    // nivel. Un salto mayor es tráfico que se salta el perímetro, y el sitio
    // donde eso se ve es este diagrama y ningún otro.
    const na = nivelDe.get(za)!
    const nb = nivelDe.get(zb)!
    const entradas: [number, number][] = f.bidireccional ? [[na, nb], [nb, na]] : [[na, nb]]
    for (const [origen, destino] of entradas) {
      if (destino > origen + 1) {
        issues.push({
          kind: 'confianza',
          detail: `el flujo ${etiqueta} entra a confianza ${destino} desde ${origen}: se salta ${destino - origen - 1} nivel(es) de perímetro`,
        })
      }
    }
  }

  if (issues.some((i) => i.kind === 'semantica')) return issues

  // ── Geometría
  const l = layout(model)

  for (let i = 0; i < l.zonas.length; i++) {
    for (let j = i + 1; j < l.zonas.length; j++) {
      if (cajasSeCortan(grow(bboxZona(l.zonas[i]), 6), bboxZona(l.zonas[j]))) {
        issues.push({ kind: 'overlap', detail: `las zonas "${l.zonas[i].id}" y "${l.zonas[j].id}" se solapan` })
      }
    }
  }

  const zonaPorId = new Map(l.zonas.map((z) => [z.id, z]))
  for (const h of l.hosts) {
    const z = zonaPorId.get(h.zona)!
    const dentro = h.x >= z.x && h.x + h.w <= z.x + z.w && h.y >= z.y && h.y + h.h <= z.y + z.h
    if (!dentro) issues.push({ kind: 'host-fuera-de-zona', detail: `el host "${h.id}" se sale de la zona "${z.id}"` })
  }

  for (let i = 0; i < l.hosts.length; i++) {
    for (let j = i + 1; j < l.hosts.length; j++) {
      if (cajasSeCortan(grow(bboxHost(l.hosts[i]), 5), bboxHost(l.hosts[j]))) {
        issues.push({ kind: 'overlap', detail: `los hosts "${l.hosts[i].id}" y "${l.hosts[j].id}" se solapan` })
      }
    }
  }

  const hostPorId = new Map(l.hosts.map((h) => [h.id, h]))
  for (const f of l.flujos) {
    const pts = puntosTraza(f.a, f.ctrl, f.b)
    for (const h of l.hosts) {
      if (h.id === f.from || h.id === f.to) continue
      if (trazaCortaCaja(pts, grow(bboxHost(h), 3))) {
        issues.push({ kind: 'traza-cruza', detail: `el flujo ${f.from}–${f.to} pasa por encima del host "${h.id}"` })
      }
    }
    // Atravesar una zona ajena es afirmar un camino que no existe: el tráfico
    // entraría a esa zona sin control declarado.
    const za = hostPorId.get(f.from)!.zona
    const zb = hostPorId.get(f.to)!.zona
    for (const z of l.zonas) {
      if (z.id === za || z.id === zb) continue
      if (trazaCortaCaja(pts, bboxZona(z))) {
        issues.push({ kind: 'traza-cruza', detail: `el flujo ${f.from}–${f.to} atraviesa la zona "${z.id}"` })
      }
    }
  }

  const etiquetas = l.flujos.map((f) => ({ id: `${f.from}–${f.to}`, caja: cajaEtiqueta(f.at, f.align, f.lines) }))
  for (let i = 0; i < etiquetas.length; i++) {
    for (let j = i + 1; j < etiquetas.length; j++) {
      if (cajasSeCortan(etiquetas[i].caja, etiquetas[j].caja)) {
        issues.push({ kind: 'etiqueta-encimada', detail: `los rótulos de ${etiquetas[i].id} y ${etiquetas[j].id} se enciman` })
      }
    }
    for (const h of l.hosts) {
      if (cajasSeCortan(etiquetas[i].caja, bboxHost(h))) {
        issues.push({ kind: 'etiqueta-encimada', detail: `el rótulo de ${etiquetas[i].id} cae sobre el host "${h.id}"` })
      }
    }
    for (const z of l.zonas) {
      if (cajasSeCortan(etiquetas[i].caja, cabeceraDeZona(z))) {
        issues.push({
          kind: 'etiqueta-encimada',
          detail: `el rótulo de ${etiquetas[i].id} cae sobre la cabecera de la zona "${z.id}"`,
        })
      }
    }
    for (const f of l.flujos) {
      if (trazaCortaCaja(puntosTraza(f.a, f.ctrl, f.b), etiquetas[i].caja)) {
        issues.push({ kind: 'etiqueta-encimada', detail: `el flujo ${f.from}–${f.to} atraviesa el rótulo de ${etiquetas[i].id}` })
      }
    }
  }

  return issues
}
