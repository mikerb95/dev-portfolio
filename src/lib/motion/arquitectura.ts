// Motion del trazador de peticiones de /architecture.
//
// Un punto de luz recorre el diagrama de capas siguiendo el guion que el
// servidor calculó con las funciones del middleware (src/lib/motion/trazado.ts),
// y a la vez se encienden los pasos de la lista de texto. Cada pieza que pisa
// toma el color de lo que hizo: dejar pasar, anotar, cortar o estar rota.
//
// En escritorio, el scroll pasa los casos de uno en uno y cada uno lanza su
// recorrido; en pantallas pequeñas, unas pestañas. Romper una pieza vuelve a
// pintar las listas (misma función que usó el servidor) y relanza el caso.
//
// Con movimiento reducido no hay viaje: el recorrido se pinta ya terminado.
//
// Módulo solo de navegador. Del guion solo importa tipos: el módulo que lo
// calcula trae el clasificador del micro-SIEM y no debe llegar al bundle.
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import type { CasoId, FalloId, Fallos, Guiones, NodoId, Pasada } from './trazado'
import { pasadasHtml, rotuloStatus, tonoStatus, type TextosTrazado } from './trazado-html'

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin)

type Punto = { x: number; y: number }

/** Piezas que cada interruptor deja rotas en el diagrama. */
const ROTAS: Record<FalloId, NodoId[]> = { sensor: ['siem'], turso: ['bases', 'lecturas'] }

export function montarTrazador(raiz: HTMLElement, opciones: { reducido: boolean }) {
  const { guiones, textos } = JSON.parse(raiz.dataset.datos ?? '{}') as { guiones: Guiones; textos: TextosTrazado }
  if (!guiones || !textos) return

  const $ = <T extends Element>(sel: string) => raiz.querySelector<T>(sel)!
  const diagrama = $<HTMLElement>('[data-diagrama]')
  const svg = $<SVGSVGElement>('[data-trazo]')
  const linea = $<SVGPathElement>('[data-trazo-linea]')
  const viejo = $<SVGPathElement>('[data-trazo-viejo]')
  const paquete = $<SVGCircleElement>('[data-paquete]')
  const halo = $<SVGCircleElement>('[data-paquete-halo]')
  const consola = {
    quien: $<HTMLElement>('[data-consola-quien]'),
    etiqueta: $<HTMLElement>('[data-consola-etiqueta]'),
    peticion: $<HTMLElement>('[data-consola-peticion]'),
    status: $<HTMLElement>('[data-consola-status]'),
    nota: $<HTMLElement>('[data-consola-nota]'),
  }
  const nodos = new Map<string, HTMLElement>()
  raiz.querySelectorAll<HTMLElement>('[data-nodo]').forEach((n) => nodos.set(n.dataset.nodo!, n))
  const casos = new Map<string, HTMLElement>()
  raiz.querySelectorAll<HTMLElement>('[data-caso]').forEach((c) => casos.set(c.dataset.caso!, c))
  const tabs = [...raiz.querySelectorAll<HTMLButtonElement>('[data-tab]')]
  const botonesFallo = [...raiz.querySelectorAll<HTMLButtonElement>('[data-fallo]')]
  const externos = [...raiz.querySelectorAll<HTMLElement>('[data-externo]')]

  let actual: CasoId = 'visitante'
  let fallos: Fallos = { sensor: false, turso: false }
  let tl: gsap.core.Timeline | null = null
  let empezado = false
  // Mientras un enlace "Verlo pasar" desplaza la página, los casos que cruza
  // el scroll no deben lanzar sus recorridos.
  let quietoHasta = 0

  raiz.classList.add('tz-vivo')

  const clave = () => (['sensor', 'turso'] as const).filter((k) => fallos[k]).join('+')
  const pasadasDe = (c: CasoId) => guiones[c][clave()]

  // ── Geometría ──────────────────────────────────────────────────────────
  // offsetLeft/Top sumados hasta el diagrama: medidas de maquetación, ajenas
  // a los transforms de las entradas (con getBoundingClientRect, un nodo que
  // entra desplazado deja el trazo torcido para siempre).
  function centro(el: HTMLElement): Punto {
    let x = el.offsetWidth / 2
    let y = el.offsetHeight / 2
    let n: HTMLElement | null = el
    while (n && n !== diagrama) {
      x += n.offsetLeft
      y += n.offsetTop
      n = n.offsetParent as HTMLElement | null
    }
    return { x, y }
  }

  function tramo(a: Punto, b: Punto): string {
    // Dentro de la misma capa, recto: la línea solo asoma en el hueco entre
    // piezas. Entre capas, una curva que sale y llega en vertical.
    if (Math.abs(b.y - a.y) < 8) return ` L ${b.x} ${b.y}`
    const m = (b.y - a.y) / 2
    return ` C ${a.x} ${a.y + m} ${b.x} ${b.y - m} ${b.x} ${b.y}`
  }

  /** Puntos del recorrido; quien no es un navegador entra desde fuera, por arriba. */
  function puntos(p: Pasada): Punto[] {
    const ps = p.pasos.map((paso) => centro(nodos.get(paso.nodo)!))
    if (p.pasos[0]?.nodo !== 'html') ps.unshift({ x: ps[0].x, y: -26 })
    return ps
  }

  function trazo(ps: Punto[]): { d: string; largos: number[] } {
    let d = `M ${ps[0].x} ${ps[0].y}`
    const largos = [0]
    for (let i = 1; i < ps.length; i++) {
      d += tramo(ps[i - 1], ps[i])
      linea.setAttribute('d', d)
      largos.push(linea.getTotalLength())
    }
    return { d, largos }
  }

  function ajustarLienzo() {
    svg.setAttribute('viewBox', `0 0 ${diagrama.offsetWidth} ${diagrama.offsetHeight}`)
  }

  // ── Estado visual ──────────────────────────────────────────────────────
  function limpiarDiagrama() {
    nodos.forEach((n) => n.removeAttribute('data-estado'))
    externos.forEach((e) => e.classList.remove('tz-tocado'))
    linea.setAttribute('d', '')
    viejo.setAttribute('d', '')
    gsap.set([paquete, halo], { attr: { cx: -40, cy: -40 }, opacity: 0 })
  }

  function pintarRotas() {
    nodos.forEach((n) => n.classList.remove('tz-roto'))
    for (const f of ['sensor', 'turso'] as const) {
      if (fallos[f]) ROTAS[f].forEach((id) => nodos.get(id)?.classList.add('tz-roto'))
    }
    externos.forEach((e) => e.classList.toggle('tz-roto', e.dataset.externo === 'turso' && fallos.turso))
    botonesFallo.forEach((b) => b.setAttribute('aria-pressed', String(fallos[b.dataset.fallo as FalloId])))
  }

  function pintarListas() {
    casos.forEach((el, c) => {
      el.querySelector('[data-pasadas]')!.innerHTML = pasadasHtml(pasadasDe(c as CasoId), textos)
    })
  }

  function marcarActivo(c: CasoId) {
    casos.forEach((el, id) => el.classList.toggle('tz-activo', id === c))
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.tab === c)))
    consola.quien.textContent = casos.get(c)?.querySelector('.tz-caso-titulo')?.textContent ?? ''
  }

  const pasoLi = (ip: number, i: number) =>
    casos.get(actual)!.querySelector<HTMLElement>(`[data-pasada="${ip}"] [data-i="${i}"]`)
  const finalP = (ip: number) => casos.get(actual)!.querySelector<HTMLElement>(`[data-pasada="${ip}"] .tz-final`)

  function abrirPasada(p: Pasada) {
    consola.etiqueta.textContent = p.etiqueta ? textos.pasadas[p.etiqueta] : ''
    consola.peticion.textContent = `${p.metodo} ${p.ruta}`
    consola.status.textContent = '···'
    consola.status.dataset.tono = 'desvio'
    consola.nota.textContent = ''
    nodos.forEach((n) => n.removeAttribute('data-estado'))
    externos.forEach((e) => e.classList.remove('tz-tocado'))
  }

  function marcarPaso(p: Pasada, ip: number, i: number, animar: boolean) {
    const paso = p.pasos[i]
    const nodo = nodos.get(paso.nodo)!
    nodo.dataset.estado = paso.estado
    casos.get(actual)!.querySelectorAll('.tz-ahora').forEach((li) => li.classList.remove('tz-ahora'))
    const li = pasoLi(ip, i)
    li?.classList.add('tz-hecho', 'tz-ahora')
    consola.nota.textContent = textos.notas[paso.nota]
    if (animar) gsap.fromTo(nodo, { scale: 1.09 }, { scale: 1, duration: 0.45, ease: 'back.out(2)', clearProps: 'transform' })
  }

  function cerrarPasada(p: Pasada, ip: number, animar: boolean) {
    const rotulo = rotuloStatus(p, textos.sinCodigo)
    consola.status.dataset.tono = tonoStatus(p.status)
    if (animar) gsap.to(consola.status, { duration: 0.5, scrambleText: { text: rotulo, chars: '0123456789', speed: 0.6 } })
    else consola.status.textContent = rotulo
    consola.nota.textContent = textos.finales[p.final]
    finalP(ip)?.classList.add('tz-hecho')
    casos.get(actual)!.querySelectorAll('.tz-ahora').forEach((li) => li.classList.remove('tz-ahora'))
    externos.forEach((e) => e.classList.toggle('tz-tocado', p.externos.includes(e.dataset.externo as never)))
  }

  // ── Recorrido ──────────────────────────────────────────────────────────
  function jugar(c: CasoId, instantaneo = opciones.reducido) {
    tl?.kill()
    actual = c
    empezado = true
    marcarActivo(c)
    limpiarDiagrama()
    ajustarLienzo()
    const bloque = casos.get(c)!
    casos.forEach((el) => {
      el.classList.remove('tz-corriendo')
      el.querySelectorAll('.tz-hecho, .tz-ahora').forEach((x) => x.classList.remove('tz-hecho', 'tz-ahora'))
    })
    diagrama.classList.add('tz-recorriendo')
    const pasadas = pasadasDe(c)
    const trazos = pasadas.map((p) => trazo(puntos(p)))

    if (instantaneo) {
      pasadas.forEach((p, ip) => {
        abrirPasada(p)
        p.pasos.forEach((_, i) => marcarPaso(p, ip, i, false))
        cerrarPasada(p, ip, false)
      })
      viejo.setAttribute('d', trazos.slice(0, -1).map((t) => t.d).join(' '))
      linea.setAttribute('d', trazos[trazos.length - 1].d)
      gsap.set(linea, { strokeDasharray: 'none', strokeDashoffset: 0 })
      return
    }

    bloque.classList.add('tz-corriendo')
    tl = gsap.timeline()
    pasadas.forEach((p, ip) => {
      const { d, largos } = trazos[ip]
      const total = largos[largos.length - 1] || 1
      const avance = { v: 0 }
      const dibujar = () => {
        gsap.set(linea, { strokeDashoffset: total - avance.v })
        const pt = linea.getPointAtLength(avance.v)
        gsap.set([paquete, halo], { attr: { cx: pt.x, cy: pt.y } })
      }
      tl!.call(() => {
        abrirPasada(p)
        if (ip > 0) viejo.setAttribute('d', trazos.slice(0, ip).map((t) => t.d).join(' '))
        linea.setAttribute('d', d)
        gsap.set(linea, { strokeDasharray: total, strokeDashoffset: total })
        avance.v = 0
        dibujar()
      })
      tl!.to([paquete, halo], { opacity: 1, duration: 0.2 })
      // Quien entra desde fuera recorre primero el tramo hasta la primera pieza.
      const desfase = largos.length - p.pasos.length
      p.pasos.forEach((paso, i) => {
        const hasta = largos[i + desfase]
        const tramoLargo = hasta - avance.v
        if (i + desfase > 0) {
          tl!.to(avance, {
            v: hasta,
            duration: Math.min(0.85, 0.3 + tramoLargo / 420),
            ease: 'power1.inOut',
            onUpdate: dibujar,
          })
        }
        tl!.call(() => marcarPaso(p, ip, i, true))
        // Pausa sobre la pieza para leer qué hizo; más larga donde algo pasa.
        tl!.to({}, { duration: paso.estado === 'pasa' ? 0.42 : 0.95 })
      })
      const ultimo = p.pasos[p.pasos.length - 1]
      if (ultimo.estado === 'corta' || ultimo.estado === 'falla') {
        tl!.fromTo(halo, { attr: { r: 11 }, opacity: 0.9 }, { attr: { r: 34 }, opacity: 0, duration: 0.7, ease: 'expo.out' })
        tl!.to(paquete, { opacity: 0, duration: 0.3 }, '<')
      } else {
        tl!.to([paquete, halo], { opacity: 0, duration: 0.4 })
      }
      tl!.call(() => cerrarPasada(p, ip, true))
      if (ip < pasadas.length - 1) tl!.to({}, { duration: 1.6 })
    })
    tl.call(() => bloque.classList.remove('tz-corriendo'))
  }

  function activar(c: CasoId) {
    if (Date.now() < quietoHasta) return
    if (c === actual && empezado) return
    jugar(c)
  }

  function cambiarFallos(nuevos: Fallos) {
    fallos = nuevos
    pintarRotas()
    pintarListas()
  }

  // ── Controles ──────────────────────────────────────────────────────────
  raiz.querySelectorAll<HTMLButtonElement>('[data-jugar]').forEach((b) =>
    b.addEventListener('click', () => jugar(b.dataset.jugar as CasoId))
  )
  tabs.forEach((t) => t.addEventListener('click', () => jugar(t.dataset.tab as CasoId)))
  botonesFallo.forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.dataset.fallo as FalloId
      cambiarFallos({ ...fallos, [f]: !fallos[f] })
      jugar(actual)
    })
  )

  // Enlaces "Verlo pasar" de las decisiones: fijan los fallos del caso y lo
  // lanzan; el desplazamiento lo hace el ancla (Lenis o el navegador).
  document.querySelectorAll<HTMLAnchorElement>('[data-ver-caso]').forEach((a) =>
    a.addEventListener('click', () => {
      const f = a.dataset.verFallo as FalloId | undefined
      cambiarFallos({ sensor: f === 'sensor', turso: f === 'turso' })
      quietoHasta = Date.now() + 1800
      jugar(a.dataset.verCaso as CasoId)
    })
  )

  // ── Arranque ───────────────────────────────────────────────────────────
  // El primer recorrido espera a las fuentes: medir con la fuente de
  // respaldo deja el trazo corrido unos píxeles respecto a las piezas.
  const arrancar = () => {
    if (!empezado) document.fonts.ready.then(() => !empezado && jugar(actual))
  }
  ScrollTrigger.create({ trigger: raiz, start: 'top 75%', onEnter: arrancar })

  if (!opciones.reducido) {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 1024px)', () => {
      casos.forEach((el, c) => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 58%',
          end: 'bottom 58%',
          onToggle: (s) => s.isActive && activar(c as CasoId),
        })
      })
    })
  }

  // Si cambia el ancho, las piezas se reacomodan: el recorrido en curso se
  // pinta terminado con las medidas nuevas en vez de seguir por las viejas.
  let ancho = diagrama.offsetWidth
  let espera = 0
  new ResizeObserver(() => {
    if (diagrama.offsetWidth === ancho) return
    ancho = diagrama.offsetWidth
    clearTimeout(espera)
    espera = window.setTimeout(() => empezado && jugar(actual, true), 150)
  }).observe(diagrama)
}
