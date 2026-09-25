// El osciloscopio del hero de /engineering (InstrumentoVisita.astro).
//
// Mide la visita actual con las mismas APIs que usa la telemetría del sitio
// (web-vitals + Navigation/Resource Timing), la dibuja como una traza y la
// repite a velocidad de lectura: la carga real dura un segundo y medio, y
// verla ocurrir en tiempo real sería no verla. El eje sigue siendo el tiempo
// REAL de la carga; lo único que se ralentiza es la reproducción.
//
// Lo que se mide se publica con `alMedir` para que los medidores de la
// sección de Web Vitals pongan el punto "tú" en su escala.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'
import { formatVital, rateVital, type VitalMetric } from '../vitals'
import {
  bytesHasta,
  enEscala,
  fasesCarga,
  masRapidaQue,
  senalTransferencia,
  trazoSenal,
  ventanaTraza,
  type ClaveFase,
  type Fase,
} from './medicion'

gsap.registerPlugin(ScrambleTextPlugin)

type Textos = Record<string, string> & { fases: Record<ClaveFase, string> }
type Datos = { tablas: Partial<Record<VitalMetric, number[]>>; locale: string; textos: Textos }
type Recurso = { inicio: number; fin: number; bytes: number }

const COLOR_FASE: Record<ClaveFase, string> = {
  red: '#a78bff',
  servidor: '#00f2ff',
  descarga: '#9bfaff',
  render: '#c9ff5b',
}
const MARCAS: VitalMetric[] = ['TTFB', 'FCP', 'LCP']
const SVG = 'http://www.w3.org/2000/svg'
// Franja inferior reservada a las fases y al eje de tiempo.
const PIE = 30

// ── Lo medido, compartido con el resto de la página ──────────────────────

const medidas: Partial<Record<VitalMetric, number>> = {}
const oyentes = new Set<(m: VitalMetric, v: number) => void>()

/** Se entera de cada métrica de esta visita, incluidas las que ya llegaron. */
export function alMedir(cb: (m: VitalMetric, v: number) => void): void {
  oyentes.add(cb)
  for (const [m, v] of Object.entries(medidas)) cb(m as VitalMetric, v)
}

function publicar(m: Metric) {
  const clave = m.name as VitalMetric
  medidas[clave] = m.value
  oyentes.forEach((cb) => cb(clave, m.value))
}

// ── Montaje ───────────────────────────────────────────────────────────────

export function montarInstrumento(raiz: HTMLElement, opciones: { reducido: boolean }): void {
  const datosEl = raiz.querySelector('[data-instrumento-datos]')
  const pantalla = raiz.querySelector<HTMLElement>('[data-pantalla]')
  const svg = raiz.querySelector<SVGSVGElement>('[data-svg]')
  if (!datosEl?.textContent || !pantalla || !svg) return
  const datos = JSON.parse(datosEl.textContent) as Datos
  const tx = datos.textos
  const nf = new Intl.NumberFormat(datos.locale, { maximumFractionDigits: 0 })

  const q = <T extends Element>(sel: string) => raiz.querySelector<T>(sel)!
  const estado = q<HTMLElement>('[data-estado]')
  const recorte = q<SVGRectElement>('[data-recorte]')
  const area = q<SVGPathElement>('[data-area]')
  const traza = q<SVGPathElement>('[data-traza]')
  const halo = q<SVGPathElement>('[data-traza-halo]')
  const gFases = q<SVGGElement>('[data-fases]')
  const gMarcas = q<SVGGElement>('[data-marcas]')
  const haz = q<SVGLineElement>('[data-haz]')
  const cursor = q<SVGLineElement>('[data-cursor]')
  const ejes = q<HTMLElement>('[data-ejes]')
  const lectura = q<HTMLElement>('[data-lectura]')
  const leyenda = q<HTMLElement>('[data-leyenda]')

  raiz.dataset.fase = 'midiendo'

  // Todas las métricas, con cada cambio: LCP puede mejorar de candidato, CLS
  // crece y INP solo existe tras una interacción. `reportAllChanges` hace que
  // lleguen en cuanto se conocen y no al salir de la página.
  onTTFB(publicar, { reportAllChanges: true })
  onFCP(publicar, { reportAllChanges: true })
  onLCP(publicar, { reportAllChanges: true })
  onCLS(publicar, { reportAllChanges: true })
  onINP(publicar, { reportAllChanges: true })

  let dibujado = false
  let T = 1000
  let fases: Fase[] = []
  let recursos: Recurso[] = []
  let tl: gsap.core.Timeline | null = null

  const etiquetaRating = (m: VitalMetric, v: number) => {
    const r = rateVital(m, v)
    return (r === 'good' ? tx.good : r === 'poor' ? tx.poor : tx.needsImprovement).toLowerCase()
  }
  const segundos = (ms: number) =>
    ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString(datos.locale, { maximumFractionDigits: 2 })} s`
  const interp = (s: string, v: Record<string, string | number>) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

  // Pie: INP y CLS se actualizan solos, antes y después de la traza.
  const pieInp = q<HTMLElement>('[data-inp]')
  const pieCls = q<HTMLElement>('[data-cls]')
  alMedir((m, v) => {
    if (m === 'INP') pieInp.textContent = interp(tx.inpListo, { value: formatVital('INP', v), rating: etiquetaRating('INP', v) })
    if (m === 'CLS') pieCls.textContent = interp(tx.cls, { value: formatVital('CLS', v) })
    if (dibujado && MARCAS.includes(m)) {
      // Un candidato de LCP que llega tarde corrige su marca y su fila sin
      // repetir la función entera.
      pintarMarcas(false)
      pintarFila(m, false)
    }
  })

  // ── Geometría ──

  function medirCarga() {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    fases = nav ? fasesCarga(nav) : []
    const lista: Recurso[] = []
    if (nav) {
      lista.push({ inicio: nav.responseStart, fin: nav.responseEnd, bytes: nav.transferSize || nav.encodedBodySize || 0 })
    }
    for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
      lista.push({ inicio: r.startTime, fin: r.responseEnd || r.startTime + r.duration, bytes: r.transferSize || r.encodedBodySize || 0 })
    }
    T = ventanaTraza(medidas.LCP, medidas.FCP, nav?.loadEventEnd || nav?.domContentLoadedEventEnd)
    recursos = lista.filter((r) => r.inicio <= T)
  }

  let W = 0
  let H = 0
  const x = (t: number) => (Math.min(t, T) / T) * W

  function pintarBase() {
    const caja = pantalla!.getBoundingClientRect()
    W = Math.max(1, Math.round(caja.width))
    H = Math.max(1, Math.round(caja.height))
    svg!.setAttribute('viewBox', `0 0 ${W} ${H}`)
    const alto = H - PIE
    const senal = senalTransferencia(recursos, T, Math.max(60, Math.round(W / 3)))
    const d = trazoSenal(senal, W, alto)
    traza.setAttribute('d', d)
    halo.setAttribute('d', d)
    area.setAttribute('d', `${d} L${W} ${alto} L0 ${alto} Z`)
    recorte.setAttribute('height', String(H))
    for (const l of [haz, cursor]) {
      l.setAttribute('y1', '0')
      l.setAttribute('y2', String(alto))
    }

    // Fases como una barra segmentada bajo la traza.
    gFases.replaceChildren(
      ...fases.map((f) => {
        const r = document.createElementNS(SVG, 'rect')
        r.setAttribute('x', x(f.inicio).toFixed(1))
        r.setAttribute('y', String(alto + 3))
        r.setAttribute('width', Math.max(2, x(f.fin) - x(f.inicio) - 1.5).toFixed(1))
        r.setAttribute('height', '4')
        r.setAttribute('rx', '2')
        r.setAttribute('fill', COLOR_FASE[f.clave])
        r.setAttribute('fill-opacity', '0.75')
        r.dataset.fase = f.clave
        return r
      }),
    )

    // Eje de tiempo con cinco marcas.
    ejes.replaceChildren(
      ...[0, 0.25, 0.5, 0.75, 1].map((k) => {
        const s = document.createElement('span')
        s.style.left = `${k * 100}%`
        s.textContent = k === 0 ? '0' : segundos(T * k)
        return s
      }),
    )

    leyenda.replaceChildren(
      ...fases.map((f) => {
        const s = document.createElement('span')
        const i = document.createElement('i')
        i.style.background = COLOR_FASE[f.clave]
        s.append(i, `${tx.fases[f.clave]} ${segundos(f.fin - f.inicio)}`)
        return s
      }),
    )
    // El total de recursos va al final de la leyenda y no a la cabecera: ahí
    // partía el título en tres líneas.
    const total = document.createElement('span')
    total.className = 'inst-total'
    total.textContent = interp(tx.recursos, { n: recursos.length, kb: nf.format(recursos.reduce((a, r) => a + r.bytes, 0) / 1024) })
    leyenda.append(total)
  }

  function pintarMarcas(ocultas: boolean) {
    const alto = H - PIE
    const presentes = MARCAS.filter((m) => medidas[m] != null).sort((a, b) => medidas[a]! - medidas[b]!)
    // Hasta tres renglones de etiquetas: cada una baja al primero donde no
    // pisa a la anterior. El ancho se estima por caracteres (la fuente es
    // monoespaciada), sin medir el DOM en cada repintado.
    const finRenglon = [-1e9, -1e9, -1e9]
    gMarcas.replaceChildren(
      ...presentes.map((m) => {
        const v = medidas[m]!
        const px = x(v)
        const ancho = `${m} ${formatVital(m, v)}`.length * 6.2
        const inicio = px > W - 90 ? px - 5 - ancho : px + 5
        let fila = finRenglon.findIndex((fin) => inicio > fin + 8)
        if (fila < 0) fila = finRenglon.indexOf(Math.min(...finRenglon))
        finRenglon[fila] = inicio + ancho
        const g = document.createElementNS(SVG, 'g')
        g.classList.add('inst-marca')
        g.dataset.metrica = m
        const color = m === 'LCP' ? '#00f2ff' : '#c4c4cc'
        const l = document.createElementNS(SVG, 'line')
        l.setAttribute('x1', px.toFixed(1))
        l.setAttribute('x2', px.toFixed(1))
        l.setAttribute('y1', String(14 + fila * 13))
        l.setAttribute('y2', String(alto))
        l.setAttribute('stroke', color)
        const t = document.createElementNS(SVG, 'text')
        const derecha = px > W - 90
        t.setAttribute('x', (derecha ? px - 5 : px + 5).toFixed(1))
        t.setAttribute('y', String(22 + fila * 13))
        t.setAttribute('text-anchor', derecha ? 'end' : 'start')
        t.setAttribute('fill', color)
        t.textContent = `${m} ${formatVital(m, v)}`
        g.append(l, t)
        if (ocultas) g.style.opacity = '0'
        return g
      }),
    )
  }

  function pintarFila(m: VitalMetric, animar: boolean) {
    const fila = raiz.querySelector<HTMLElement>(`[data-fila="${m}"]`)
    const v = medidas[m]
    if (!fila || v == null) return
    const valor = fila.querySelector<HTMLElement>('[data-valor]')!
    const tu = fila.querySelector<HTMLElement>('[data-tu]')!
    const rank = fila.querySelector<HTMLElement>('[data-rank]')!
    const texto = formatVital(m, v)
    valor.className = `inst-val ${rateVital(m, v)}`
    const pos = enEscala(v, Number(fila.dataset.tope)) * 100
    const tabla = datos.tablas[m]
    if (tabla && tabla.length > 1) {
      const fuerte = document.createElement('strong')
      fuerte.textContent = interp(tx.masRapida, { pct: masRapidaQue(tabla, v) })
      rank.replaceChildren(fuerte)
    }
    if (animar) {
      gsap.to(valor, { duration: 0.8, scrambleText: { text: texto, chars: '0123456789', speed: 0.5 } })
      gsap.fromTo(tu, { left: '0%', opacity: 0 }, { left: `${pos}%`, opacity: 1, duration: 1.2, ease: 'expo.out' })
    } else {
      valor.textContent = texto
      gsap.set(tu, { left: `${pos}%`, opacity: 1 })
    }
  }

  // ── Reproducción ──

  function reproducir() {
    tl?.kill()
    pintarMarcas(true)
    const dur = Math.min(3.2, Math.max(1.8, (T / 1000) * 0.9))
    const rects = Array.from(gFases.children) as SVGRectElement[]
    gsap.set(rects, { scaleX: 0, transformOrigin: '0% 50%' })
    gsap.set(haz, { opacity: 1 })
    const barrido = { px: 0 }
    tl = gsap.timeline()
    tl.to(barrido, {
      px: W,
      duration: dur,
      ease: 'none',
      onUpdate: () => {
        recorte.setAttribute('width', barrido.px.toFixed(1))
        haz.setAttribute('x1', barrido.px.toFixed(1))
        haz.setAttribute('x2', barrido.px.toFixed(1))
      },
    })
    for (const f of fases) {
      const r = rects.find((el) => el.dataset.fase === f.clave)
      if (!r) continue
      tl.to(r, { scaleX: 1, duration: Math.max(0.05, (dur * (f.fin - f.inicio)) / T), ease: 'none' }, (dur * f.inicio) / T)
    }
    for (const g of Array.from(gMarcas.children) as SVGGElement[]) {
      const m = g.dataset.metrica as VitalMetric
      const v = medidas[m]
      if (v == null) continue
      const en = (dur * Math.min(v, T)) / T
      tl.fromTo(g, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, en)
      tl.call(() => pintarFila(m, true), [], en)
    }
    tl.to(haz, { opacity: 0.18, duration: 0.6 }, dur)
    tl.call(() => {
      raiz.dataset.fase = 'listo'
      estado.textContent = tx.listo
    }, [], dur)
  }

  function finalQuieto() {
    tl?.kill()
    recorte.setAttribute('width', String(W))
    pintarMarcas(false)
    MARCAS.forEach((m) => pintarFila(m, false))
    gsap.set(haz, { opacity: 0 })
    raiz.dataset.fase = 'listo'
    estado.textContent = tx.listo
  }

  // ── Lectura bajo el cursor ──

  const alMover = (ev: PointerEvent) => {
    if (!dibujado) return
    const caja = pantalla!.getBoundingClientRect()
    const px = Math.max(0, Math.min(W, ev.clientX - caja.left))
    const t = (px / W) * T
    const fase = fases.find((f) => t >= f.inicio && t < f.fin)
    cursor.setAttribute('x1', px.toFixed(1))
    cursor.setAttribute('x2', px.toFixed(1))
    cursor.style.opacity = '1'
    // Fuera de toda fase (tras el evento load) la lectura no inventa una.
    lectura.textContent = interp(fase ? tx.lectura : tx.lectura.replace(/ · \{fase\}/, ''), {
      t: segundos(t),
      fase: fase ? tx.fases[fase.clave] : '',
      kb: nf.format(bytesHasta(recursos, t) / 1024),
    })
    lectura.classList.add('visible')
  }
  const alSalir = () => {
    cursor.style.opacity = '0'
    lectura.classList.remove('visible')
  }
  pantalla.addEventListener('pointermove', alMover, { passive: true })
  pantalla.addEventListener('pointerleave', alSalir)
  if (!opciones.reducido) {
    pantalla.addEventListener('click', () => dibujado && reproducir())
    pantalla.title = tx.repetir
  }

  // ── Arranque: cuando la carga terminó de verdad ──

  const dibujar = () => {
    medirCarga()
    pintarBase()
    dibujado = true
    if (opciones.reducido) finalQuieto()
    else reproducir()
  }

  // loadEventEnd solo tiene valor después de que termine el evento load, y el
  // LCP puede tardar un poco más: se espera un respiro y, si aún no hay LCP,
  // un tope corto. Mejor una traza sin LCP que un instrumento que no arranca.
  const tras = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const cargada =
    document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }))
  void cargada
    .then(() => tras(250))
    .then(async () => {
      for (let i = 0; i < 12 && medidas.LCP == null; i++) await tras(125)
    })
    .then(dibujar)
    .catch(() => {
      // Sin Performance API utilizable: la pantalla vuelve a su texto explicativo.
      delete raiz.dataset.fase
    })

  new ResizeObserver(() => {
    if (!dibujado) return
    const antes = W
    const caja = pantalla.getBoundingClientRect()
    if (Math.round(caja.width) === antes) return
    pintarBase()
    finalQuieto()
  }).observe(pantalla)
}
