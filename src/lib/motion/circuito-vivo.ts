// Motor del circuito de operación del hero de /tools (el guion vive en
// circuito.ts). Mide los nodos, dibuja los cables con el conector ortogonal y
// reproduce los escenarios en bucle: paquetes que corren por los cables,
// estados que cambian de color, lecturas que se descifran y una bitácora que
// se escribe al ritmo del guion.
//
//   · Fuera de pantalla o con la pestaña oculta, el escenario se detiene.
//   · Con el cursor encima, el tiempo va a un cuarto: se puede leer sin que la
//     escena cambie debajo. Tras un clic en un escenario no se frena hasta que
//     el cursor sale (si no, frenaría justo lo que el clic lanzó).
//   · Con movimiento reducido se dibujan los cables y las pestañas solo
//     cambian la bitácora, que se muestra ya escrita.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import {
  DUR_VIAJE,
  ESCENARIOS,
  cables,
  conector,
  lineasHasta,
  mmss,
  rutaRedondeada,
  type Caja,
  type NodoId,
  type Paso,
  type Punto,
  type Tono,
} from './circuito'

gsap.registerPlugin(ScrambleTextPlugin)

const SVG = 'http://www.w3.org/2000/svg'
const FILAS = 4
const COLOR: Record<Tono, string> = {
  neutro: '#9a9aa6',
  dato: '#00f2ff',
  ok: '#c9ff5b',
  alerta: '#fbbf24',
  error: '#ff6b3d',
}

type Textos = { id: string; nombre: string; lineas: string[] }[]

export function montarCircuito(raiz: HTMLElement, opciones: { reducido: boolean }): void {
  const mapa = raiz.querySelector<HTMLElement>('[data-mapa]')
  const svg = raiz.querySelector<SVGSVGElement>('[data-cables]')
  const bitacora = raiz.querySelector<HTMLOListElement>('[data-bitacora]')
  if (!mapa || !svg || !bitacora) return

  const textos: Textos = JSON.parse(raiz.dataset.escenarios ?? '[]')
  const lecturas: Record<string, string> = JSON.parse(raiz.dataset.lecturas ?? '{}')
  const nombres: Record<string, string> = JSON.parse(raiz.dataset.nodos ?? '{}')
  const botones = [...raiz.querySelectorAll<HTMLButtonElement>('[data-esc]')]

  const nodos = new Map<NodoId, HTMLElement>()
  raiz.querySelectorAll<HTMLElement>('[data-nodo]').forEach((el) => nodos.set(el.dataset.nodo as NodoId, el))

  // ── Cables ─────────────────────────────────────────────────────────────
  const pares = cables()
  const trazos = new Map<string, { puntos: Punto[]; el: SVGPathElement }>()
  const clave = (a: NodoId, b: NodoId) => (a < b ? `${a}|${b}` : `${b}|${a}`)

  // Medidas de maquetación (offset*), no de pantalla: la pieza entra al hero
  // inclinada y desplazada, y un getBoundingClientRect tomado en ese momento
  // deja los cables torcidos respecto a los nodos para siempre.
  const caja = (el: HTMLElement): Caja => {
    let x = 0
    let y = 0
    let n: HTMLElement | null = el
    while (n && n !== mapa) {
      x += n.offsetLeft
      y += n.offsetTop
      n = n.offsetParent as HTMLElement | null
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight }
  }

  function medir() {
    svg!.setAttribute('viewBox', `0 0 ${mapa!.offsetWidth} ${mapa!.offsetHeight}`)
    for (const [a, b] of pares) {
      const ea = nodos.get(a)
      const eb = nodos.get(b)
      if (!ea || !eb) continue
      const puntos = conector(caja(ea), caja(eb))
      const k = clave(a, b)
      let t = trazos.get(k)
      if (!t) {
        const el = document.createElementNS(SVG, 'path')
        el.setAttribute('class', 'co-cable')
        svg!.appendChild(el)
        t = { puntos, el }
        trazos.set(k, t)
      }
      t.puntos = puntos
      t.el.setAttribute('d', rutaRedondeada(puntos, 10))
    }
  }

  /** Puntos del cable en el sentido del viaje. */
  function ruta(de: NodoId, a: NodoId): Punto[] | null {
    const t = trazos.get(clave(de, a))
    if (!t) return null
    return de < a ? t.puntos : [...t.puntos].reverse()
  }

  medir()
  // Las fuentes cambian el ancho de los nodos; hasta que cargan, los cables
  // apuntarían a cajas que ya no están ahí.
  document.fonts?.ready.then(medir).catch(() => {})

  // ── Bitácora ───────────────────────────────────────────────────────────
  function linea(esc: number, n: number, tono: Tono, nodo: NodoId, t: number): HTMLLIElement {
    const li = document.createElement('li')
    li.className = 'co-linea'
    li.dataset.tono = tono
    const partes: [string, string][] = [
      ['co-linea-t', mmss(t)],
      ['co-linea-nodo', nombres[nodo] ?? nodo],
      ['co-linea-txt', textos[esc]?.lineas[n] ?? ''],
    ]
    for (const [cls, txt] of partes) {
      const s = document.createElement('span')
      s.className = cls
      s.textContent = txt
      li.appendChild(s)
    }
    return li
  }

  /** La bitácora completa de un escenario, ya escrita (movimiento reducido). */
  function bitacoraFinal(esc: number) {
    const pasos = ESCENARIOS[esc].pasos
    const tDe = (n: number) => pasos.find((p) => p.tipo === 'log' && p.linea === n)?.t ?? 0
    bitacora!.replaceChildren(
      ...lineasHasta(ESCENARIOS[esc], Infinity)
        .slice(-FILAS)
        .map((l) => linea(esc, l.linea, l.tono, l.nodo, tDe(l.linea))),
    )
  }

  function marcar(esc: number) {
    botones.forEach((b, i) => b.setAttribute('aria-pressed', i === esc ? 'true' : 'false'))
  }

  if (opciones.reducido) {
    botones.forEach((b, i) =>
      b.addEventListener('click', () => {
        marcar(i)
        bitacoraFinal(i)
      }),
    )
    new ResizeObserver(medir).observe(mapa)
    return
  }

  raiz.dataset.vivo = ''

  function escribir(esc: number, p: Extract<Paso, { tipo: 'log' }>) {
    const li = linea(esc, p.linea, p.tono, p.nodo, p.t)
    bitacora!.appendChild(li)
    const filas = [...bitacora!.children] as HTMLElement[]
    // Todas suben una fila a la vez; la nueva entra desde abajo y su texto
    // llega descifrándose, como una línea que se está imprimiendo.
    gsap.fromTo(filas, { y: 22 }, { y: 0, duration: 0.4, ease: 'power3.out' })
    gsap.fromTo(li, { opacity: 0 }, { opacity: 1, duration: 0.3 })
    const txt = li.querySelector<HTMLElement>('.co-linea-txt')
    if (txt) {
      const final = txt.textContent ?? ''
      txt.textContent = ''
      gsap.to(txt, { duration: 0.7, scrambleText: { text: final, chars: 'lowerCase', speed: 1 }, ease: 'none' })
    }
    while (bitacora!.children.length > FILAS + 1) bitacora!.firstElementChild?.remove()
  }

  // ── Estados ────────────────────────────────────────────────────────────
  function fijarLectura(el: HTMLElement, texto: string, animar = true) {
    const lec = el.querySelector<HTMLElement>('[data-lectura]')
    if (!lec || lec.textContent === texto) return
    gsap.killTweensOf(lec)
    if (animar) gsap.to(lec, { duration: 0.45, scrambleText: { text: texto, chars: 'lowerCase', speed: 0.8 } })
    else lec.textContent = texto
  }

  function estado(p: Extract<Paso, { tipo: 'estado' }>) {
    const el = nodos.get(p.nodo)
    if (!el) return
    el.dataset.estado = p.estado
    const base = el.querySelector<HTMLElement>('[data-lectura]')?.dataset.base ?? ''
    const texto = p.estado === 'reposo' ? base : (p.crudo ?? (p.lectura ? lecturas[p.lectura] : undefined) ?? base)
    fijarLectura(el, texto)
  }

  function reposo() {
    nodos.forEach((el) => {
      el.dataset.estado = 'reposo'
      fijarLectura(el, el.querySelector<HTMLElement>('[data-lectura]')?.dataset.base ?? '', false)
    })
    svg!.querySelectorAll('.co-viaje').forEach((g) => g.remove())
    trazos.forEach((t) => t.el.classList.remove('is-luz'))
  }

  // ── Viajes ─────────────────────────────────────────────────────────────
  function viaje(p: Extract<Paso, { tipo: 'viaje' }>): gsap.core.Timeline | null {
    const puntos = ruta(p.de, p.a)
    if (!puntos) return null
    const color = COLOR[p.tono]
    const dur = p.dur ?? DUR_VIAJE
    const g = document.createElementNS(SVG, 'g')
    g.setAttribute('class', 'co-viaje')
    g.style.opacity = '0'
    const traza = document.createElementNS(SVG, 'path')
    traza.setAttribute('class', 'co-traza')
    traza.setAttribute('d', rutaRedondeada(puntos, 10))
    traza.setAttribute('stroke', color)
    const halo = document.createElementNS(SVG, 'circle')
    halo.setAttribute('r', '9')
    halo.setAttribute('fill', color)
    halo.setAttribute('opacity', '0.18')
    const punto = document.createElementNS(SVG, 'circle')
    punto.setAttribute('r', '3.2')
    punto.setAttribute('fill', color)
    g.append(traza, halo, punto)
    svg!.appendChild(g)

    const largo = traza.getTotalLength()
    traza.style.strokeDasharray = `${largo}`
    traza.style.strokeDashoffset = `${largo}`
    const avance = { d: 0 }
    const colocar = () => {
      const q = traza.getPointAtLength(avance.d)
      for (const c of [halo, punto]) {
        c.setAttribute('cx', `${q.x}`)
        c.setAttribute('cy', `${q.y}`)
      }
    }
    colocar()
    const cable = trazos.get(clave(p.de, p.a))?.el
    const destino = nodos.get(p.a)

    const tl = gsap.timeline()
    tl.set(g, { opacity: 1 })
      .call(() => cable?.classList.add('is-luz'))
      .to(traza, { strokeDashoffset: 0, duration: dur, ease: 'power1.inOut' }, 0)
      .to(avance, { d: largo, duration: dur, ease: 'power1.inOut', onUpdate: colocar }, 0)
    if (p.frena) {
      // Frenada: el paquete choca contra la capa y se deshace en un anillo;
      // lo que no pasa no sigue corriendo hacia las rutas.
      tl.to(halo, { attr: { r: 20 }, opacity: 0, duration: 0.5, ease: 'power2.out' }, dur).to(
        punto,
        { attr: { r: 0 }, duration: 0.3 },
        dur,
      )
    } else {
      tl.to([halo, punto], { opacity: 0, duration: 0.3 }, dur)
    }
    if (destino)
      tl.fromTo(
        destino,
        { boxShadow: `0 0 0 0 ${color}66` },
        { boxShadow: `0 0 0 8px ${color}00`, duration: 0.6, ease: 'power2.out', clearProps: 'boxShadow' },
        dur,
      )
    tl.to(g, { opacity: 0, duration: 0.7 }, dur + 0.15)
      .call(() => cable?.classList.remove('is-luz'), [], dur + 0.4)
      .call(() => g.remove())
    return tl
  }

  // ── Escenarios ─────────────────────────────────────────────────────────
  let actual = 0
  let tl: gsap.core.Timeline | null = null
  let visible = true
  let lento = false
  let ignorarCursor = false
  let siguiente: gsap.core.Tween | null = null

  function construir(esc: number): gsap.core.Timeline {
    const def = ESCENARIOS[esc]
    const barra = botones[esc]?.querySelector<HTMLElement>('[data-esc-progreso]')
    const t = gsap.timeline({
      paused: true,
      onUpdate: () => barra && gsap.set(barra, { scaleX: t.progress() }),
      onComplete: () => {
        siguiente = gsap.delayedCall(0.9, () => jugar((esc + 1) % ESCENARIOS.length))
      },
    })
    for (const p of def.pasos) {
      if (p.tipo === 'viaje') {
        // Los viajes se construyen al llegar su momento, con la geometría
        // vigente: si la ventana cambió de tamaño, el paquete sigue el cable
        // redibujado, no el de hace diez segundos.
        t.call(
          () => {
            const v = viaje(p)
            if (v) {
              v.timeScale(t.timeScale())
              vuelo.add(v)
              v.eventCallback('onComplete', () => vuelo.delete(v))
            }
          },
          [],
          p.t,
        )
      } else if (p.tipo === 'estado') t.call(() => estado(p), [], p.t)
      else t.call(() => escribir(esc, p), [], p.t)
    }
    t.to({}, { duration: Math.max(0, def.duracion - (def.pasos.at(-1)?.t ?? 0)) })
    return t
  }

  // Viajes en curso: viven fuera de la línea del escenario (se crean en su
  // momento), así que el freno y la pausa se les aplican a mano.
  const vuelo = new Set<gsap.core.Timeline>()

  function jugar(esc: number) {
    siguiente?.kill()
    tl?.kill()
    vuelo.forEach((v) => v.kill())
    vuelo.clear()
    reposo()
    botones.forEach((b) => {
      const barra = b.querySelector<HTMLElement>('[data-esc-progreso]')
      if (barra) gsap.set(barra, { scaleX: 0 })
    })
    actual = esc
    marcar(esc)
    if (bitacora!.children.length) gsap.to(bitacora!.children, { opacity: 0.25, duration: 0.3 })
    tl = construir(esc)
    tl.timeScale(lento ? 0.25 : 1)
    if (visible) tl.play()
  }

  function velocidad(v: number) {
    if (!tl) return
    gsap.to(tl, { timeScale: v, duration: 0.4 })
    vuelo.forEach((x) => gsap.to(x, { timeScale: v, duration: 0.4 }))
  }

  function pausar(p: boolean) {
    if (!tl) return
    if (p) {
      tl.pause()
      siguiente?.pause()
      vuelo.forEach((v) => v.pause())
    } else {
      tl.resume()
      siguiente?.resume()
      vuelo.forEach((v) => v.resume())
    }
  }

  botones.forEach((b, i) =>
    b.addEventListener('click', () => {
      ignorarCursor = true
      lento = false
      jugar(i)
    }),
  )

  raiz.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || ignorarCursor) return
    lento = true
    velocidad(0.25)
  })
  raiz.addEventListener('pointerleave', () => {
    ignorarCursor = false
    if (!lento) return
    lento = false
    velocidad(1)
  })

  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting && document.visibilityState === 'visible'
      pausar(!visible)
    },
    { threshold: 0.15 },
  ).observe(raiz)
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible'
    pausar(!visible)
  })
  new ResizeObserver(medir).observe(mapa)

  // ── Pista bajo el cursor ───────────────────────────────────────────────
  const tip = raiz.querySelector<HTMLElement>('[data-tip-caja]')
  const tipTexto = raiz.querySelector<HTMLElement>('[data-tip-texto]')
  function mostrarTip(el: HTMLElement) {
    if (!tip || !tipTexto || !el.dataset.tip) return
    tipTexto.textContent = el.dataset.tip
    const r = caja(el)
    gsap.set(tip, { visibility: 'visible' })
    const w = tip.offsetWidth
    const h = tip.offsetHeight
    // Centrada sobre el nodo, pero siempre dentro del mapa: una pista que se
    // sale abre scroll horizontal en móvil.
    const x = Math.min(Math.max(0, r.x + r.w / 2 - w / 2), mapa!.offsetWidth - w)
    const arriba = r.y - h - 10
    const y = arriba >= -40 ? arriba : r.y + r.h + 10
    gsap.fromTo(tip, { x, y: y + 6, opacity: 0 }, { x, y, opacity: 1, duration: 0.25, ease: 'power2.out' })
    const id = el.dataset.nodo as NodoId
    trazos.forEach((t, k) => t.el.classList.toggle('is-luz', k.split('|').includes(id)))
    el.classList.add('is-foco')
  }
  function ocultarTip(el: HTMLElement) {
    if (tip) gsap.to(tip, { opacity: 0, duration: 0.2, onComplete: () => gsap.set(tip, { visibility: 'hidden' }) })
    trazos.forEach((t) => t.el.classList.remove('is-luz'))
    el.classList.remove('is-foco')
  }
  raiz.querySelectorAll<HTMLElement>('.co-herramienta').forEach((el) => {
    el.addEventListener('pointerenter', () => mostrarTip(el))
    el.addEventListener('pointerleave', () => ocultarTip(el))
    el.addEventListener('focus', () => mostrarTip(el))
    el.addEventListener('blur', () => ocultarTip(el))
  })

  // Arranca vacía y se escribe sola: la bitácora del servidor es para quien
  // no ejecuta el script.
  bitacora.replaceChildren()
  jugar(actual)
}
