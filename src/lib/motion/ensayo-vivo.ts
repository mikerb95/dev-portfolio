// Motor del banco de ensayo del hero de /lab (el guion vive en ensayo.ts).
// Mide las piezas, reproduce cada experimento como una línea de tiempo de GSAP
// y pasa al siguiente al terminar:
//   · fichas que salen del emisor, esperan en cada defensa y siguen o se
//     descartan según lo que decidió el modelo
//   · arcos sobre la máquina de estados: verde si la transición se aplicó,
//     rojo punteado con ✕ si la máquina la negó, ámbar si quedó dentro de una
//     transacción que nunca hizo COMMIT
//   · el registro (pagos, estado, versión, eventos) se descifra al cambiar
//   · el sello entra al final, pero su texto es el de las corridas reales
//
// Fuera de pantalla o con la pestaña oculta se detiene; con el cursor encima
// el tiempo va más lento para poder leer (salvo justo después de un clic, que
// frenaría lo que el clic lanzó). Con movimiento reducido no hay fichas: las
// pestañas enseñan el experimento ya resuelto.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import {
  EXPERIMENTOS,
  cuadroFinal,
  guionDe,
  type Arco,
  type Estado,
  type Guion,
  type Lectura,
  type Registro,
} from './ensayo'

gsap.registerPlugin(ScrambleTextPlugin)

const SVG = 'http://www.w3.org/2000/svg'
const LENTO = 0.35
const VIAJE = 0.6
const LEER = 0.35

type Textos = {
  lecturas: Record<string, string>
  estados: Record<string, string>
  de: string
  baseGuarda: Record<string, string>
  baseEmisor: Record<string, string>
}
type Exp = { id: string; nombre: string; esperado: string; sello: string; selloTexto: string; corridasTexto: string }
type Caja = { x: number; y: number; w: number; h: number }
type Punto = { x: number; y: number }

export function montarBanco(raiz: HTMLElement, opciones: { reducido: boolean }): void {
  const mapa = raiz.querySelector<HTMLElement>('[data-mapa]')
  const trazos = raiz.querySelector<SVGSVGElement>('[data-trazos]')
  const fichas = raiz.querySelector<HTMLElement>('[data-fichas]')
  const registroEl = raiz.querySelector<HTMLElement>('[data-registro]')
  if (!mapa || !trazos || !fichas || !registroEl) return

  const textos: Textos = JSON.parse(raiz.dataset.textos ?? '{}')
  const exps: Exp[] = JSON.parse(raiz.dataset.experimentos ?? '[]')
  const botones = [...raiz.querySelectorAll<HTMLButtonElement>('[data-exp]')]
  const nombreEl = raiz.querySelector<HTMLElement>('[data-exp-nombre]')
  const esperadoEl = raiz.querySelector<HTMLElement>('[data-esperado]')
  const selloEl = raiz.querySelector<HTMLElement>('[data-sello]')
  const corridasEl = raiz.querySelector<HTMLElement>('[data-corridas]')

  const emisores = new Map<string, HTMLElement>()
  raiz.querySelectorAll<HTMLElement>('[data-emisor]').forEach((el) => emisores.set(el.dataset.emisor!, el))
  const guardas = new Map<string, HTMLElement>()
  raiz.querySelectorAll<HTMLElement>('[data-guarda]').forEach((el) => guardas.set(el.dataset.guarda!, el))
  const estados = new Map<string, HTMLElement>()
  raiz.querySelectorAll<HTMLElement>('[data-estado-id]').forEach((el) => estados.set(el.dataset.estadoId!, el))
  const celdas = new Map<string, HTMLElement>()
  registroEl.querySelectorAll<HTMLElement>('[data-reg]').forEach((el) => celdas.set(el.dataset.reg!, el))

  // ── Textos ─────────────────────────────────────────────────────────────
  const texto = (l: Lectura) => {
    const vars: Record<string, string | number> = { ...(l.vars ?? {}) }
    for (const k of ['de', 'a']) {
      const v = vars[k]
      if (typeof v === 'string' && textos.estados[v]) vars[k] = textos.estados[v]
    }
    return (textos.lecturas[l.clave] ?? l.clave).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
  }
  const valores = (r: Registro) => ({
    pagos: String(r.pagos),
    estado: r.estado ? textos.estados[r.estado] : '-',
    version: `v${r.version}`,
    eventos: `${r.aplicados} ${textos.de} ${r.recibidos}`,
  })

  // ── Medidas ────────────────────────────────────────────────────────────
  // offset* y no getBoundingClientRect: la pieza entra al hero desplazada e
  // inclinada, y una medida tomada en ese momento deja todo corrido.
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
  /** ¿Flujo de arriba abajo (móvil)? Se decide por la maquetación real, no por el ancho. */
  const vertical = () => {
    const e = emisores.get('navegador')
    const g = guardas.get('llave')
    return !!e && !!g && caja(g).y > caja(e).y + caja(e).h
  }
  const colEmisores = raiz.querySelector<HTMLElement>('.be-emisores')
  const colGuardas = raiz.querySelector<HTMLElement>('.be-guardas')
  const colMaquina = raiz.querySelector<HTMLElement>('.be-maquina')
  /**
   * Punto de una ficha junto a una pieza. En escritorio las fichas viajan por
   * carriles: el hueco entre columnas, a la altura de la pieza. Así nunca
   * tapan el texto de una defensa. En móvil (flujo de arriba abajo) se sientan
   * sobre el borde de la pieza, que es por donde entra el flujo.
   */
  const ancla = (el: HTMLElement, lado: 'entrada' | 'salida'): Punto => {
    const c = caja(el)
    if (vertical()) return { x: c.x + c.w / 2, y: lado === 'entrada' ? c.y : c.y + c.h }
    const carril = (izq: HTMLElement | null, der: HTMLElement | null) => {
      if (!izq || !der) return lado === 'entrada' ? c.x : c.x + c.w
      const a = caja(izq)
      return (a.x + a.w + caja(der).x) / 2
    }
    const x = el.closest('.be-maquina')
      ? carril(colGuardas, colMaquina)
      : el.closest('.be-guardas') && lado === 'salida'
        ? carril(colGuardas, colMaquina)
        : carril(colEmisores, colGuardas)
    return { x, y: c.y + c.h / 2 }
  }

  // ── Arcos de la máquina de estados ─────────────────────────────────────
  function rutaArco(de: Estado, a: Estado): { d: string; medio: Punto; fin: Punto; ang: number } | null {
    const ea = estados.get(de)
    const eb = estados.get(a)
    if (!ea || !eb) return null
    const ca = caja(ea)
    const cb = caja(eb)
    if (vertical()) {
      // Estados en fila: el arco sale por abajo y se curva hacia abajo.
      const p0 = { x: ca.x + ca.w / 2, y: ca.y + ca.h }
      const p1 = { x: cb.x + cb.w / 2, y: cb.y + cb.h }
      const hondo = 14 + Math.abs(p1.x - p0.x) * 0.12
      const c = { x: (p0.x + p1.x) / 2, y: Math.max(p0.y, p1.y) + hondo }
      return { d: `M${p0.x},${p0.y} Q${c.x},${c.y} ${p1.x},${p1.y}`, medio: { x: c.x, y: (p0.y + c.y) / 2 + 3 }, fin: p1, ang: Math.atan2(p1.y - c.y, p1.x - c.x) }
    }
    // Estados en columna: el arco sale por la derecha y se curva hacia fuera.
    const p0 = { x: ca.x + ca.w, y: ca.y + ca.h / 2 }
    const p1 = { x: cb.x + cb.w, y: cb.y + cb.h / 2 }
    const ancho = 12 + Math.abs(p1.y - p0.y) * 0.22
    const c = { x: Math.max(p0.x, p1.x) + ancho, y: (p0.y + p1.y) / 2 }
    return { d: `M${p0.x},${p0.y} Q${c.x},${c.y} ${p1.x},${p1.y}`, medio: { x: (p0.x + c.x) / 2 + 4, y: c.y }, fin: p1, ang: Math.atan2(p1.y - c.y, p1.x - c.x) }
  }

  type ArcoEl = { g: SVGGElement; path: SVGPathElement; largo: number }
  function dibujarArco(arco: Arco, tipo: 'aplicada' | 'frenada' | 'tentativa'): ArcoEl | null {
    const r = rutaArco(arco.de, arco.a)
    if (!r) return null
    const g = document.createElementNS(SVG, 'g')
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('class', 'be-arco')
    path.setAttribute('d', r.d)
    path.dataset.tipo = tipo
    g.appendChild(path)
    if (tipo === 'frenada') {
      const x = document.createElementNS(SVG, 'text')
      x.setAttribute('class', 'be-arco-x')
      x.setAttribute('x', String(r.medio.x))
      x.setAttribute('y', String(r.medio.y + 4))
      x.setAttribute('text-anchor', 'middle')
      x.textContent = '✕'
      g.appendChild(x)
    } else {
      // Punta de flecha: un triángulo orientado con la tangente del final.
      const p = document.createElementNS(SVG, 'path')
      p.setAttribute('class', 'be-arco-punta')
      p.dataset.tipo = tipo
      p.setAttribute('d', 'M0,0 L-7,-3.5 L-7,3.5 Z')
      p.setAttribute('transform', `translate(${r.fin.x},${r.fin.y}) rotate(${(r.ang * 180) / Math.PI})`)
      g.appendChild(p)
    }
    trazos!.appendChild(g)
    return { g, path, largo: path.getTotalLength() }
  }

  function medirLienzo() {
    trazos!.setAttribute('viewBox', `0 0 ${mapa!.offsetWidth} ${mapa!.offsetHeight}`)
  }

  // ── Estado de la pieza ─────────────────────────────────────────────────
  function limpiar() {
    trazos!.replaceChildren()
    fichas!.replaceChildren()
    mapa!.classList.remove('is-caida')
    registroEl!.removeAttribute('data-tentativo')
    for (const [id, el] of guardas) {
      el.removeAttribute('data-v')
      lectura(el, textos.baseGuarda[id], false)
    }
    for (const [id, el] of emisores) {
      el.removeAttribute('data-v')
      lectura(el, textos.baseEmisor[id], false)
    }
    for (const el of estados.values()) {
      el.removeAttribute('data-actual')
      el.removeAttribute('data-tentativo')
    }
  }

  function lectura(el: HTMLElement, valor: string, animar: boolean) {
    const l = el.querySelector<HTMLElement>('[data-lectura]')
    if (!l || l.textContent === valor) return
    gsap.killTweensOf(l)
    if (animar && !opciones.reducido) gsap.to(l, { duration: 0.5, scrambleText: { text: valor, chars: 'lowerCase', speed: 0.8 } })
    else l.textContent = valor
  }

  function registrar(r: Registro, animar: boolean) {
    const v = valores(r)
    for (const [k, el] of celdas) {
      const nuevo = v[k as keyof typeof v]
      if (el.textContent === nuevo) continue
      gsap.killTweensOf(el)
      // Solo el estado se descifra (es una palabra que cambia por otra); las
      // cifras cambian de golpe con un destello: un "1 de55" de paso en la
      // celda de eventos se leería como un dato, aunque dure un instante.
      if (animar && k === 'estado') {
        gsap.to(el, { duration: 0.35, scrambleText: { text: nuevo, chars: 'lowerCase', speed: 0.9 } })
      } else {
        el.textContent = nuevo
        if (animar) gsap.fromTo(el, { color: '#00f2ff' }, { color: '#e7e7ec', duration: 0.9, ease: 'power2.out', clearProps: 'color' })
      }
    }
    if (r.tentativo) registroEl!.setAttribute('data-tentativo', '')
    else registroEl!.removeAttribute('data-tentativo')
  }

  function marcarActual(s: Estado | null) {
    for (const [id, el] of estados) {
      if (id === s) el.setAttribute('data-actual', '')
      else el.removeAttribute('data-actual')
    }
  }

  function cabecera(i: number) {
    const e = exps[i]
    if (!e) return
    if (nombreEl) nombreEl.textContent = e.nombre
    if (esperadoEl) esperadoEl.textContent = e.esperado
    if (selloEl) {
      selloEl.textContent = e.selloTexto
      selloEl.dataset.tipo = e.sello
    }
    if (corridasEl) corridasEl.textContent = e.corridasTexto
    botones.forEach((b, j) => b.setAttribute('aria-pressed', j === i ? 'true' : 'false'))
  }

  /** El experimento resuelto, sin animar: lo mismo que pinta el servidor. */
  function cuadro(g: Guion) {
    limpiar()
    const c = cuadroFinal(g)
    for (const [id, l] of Object.entries(g.emisores)) {
      const el = emisores.get(id)
      if (el && l) {
        el.dataset.v = 'activo'
        lectura(el, texto(l), false)
      }
    }
    for (const [id, f] of Object.entries(c.guardas)) {
      const el = guardas.get(id)
      if (!el || !f) continue
      el.dataset.v = f.veredicto
      lectura(el, texto(f.lectura), false)
    }
    medirLienzo()
    for (const a of c.arcos) dibujarArco(a, a.aplicada ? 'aplicada' : 'frenada')
    marcarActual(c.actual)
    registrar(c.registro, false)
  }

  // ── Reproducción ───────────────────────────────────────────────────────
  let actual = 0
  let vuelta = 0
  let tl: gsap.core.Timeline | null = null
  let visible = false
  let encima = false
  let clicHasta = 0

  function construir(g: Guion): gsap.core.Timeline {
    const t = gsap.timeline({ paused: true })
    const posiciones = new Map<string, Punto>()
    const ultimo = new Map<string, number>()
    const fichaDe = new Map<string, HTMLElement>()
    const arcoTentativo: { el: ArcoEl | null } = { el: null }
    // Fichas que siguen en juego: una absorbida o descartada ya no se mueve,
    // aunque su defensa siga escribiendo (el ROLLBACK después de la caída).
    const vivas = new Set<string>()

    // Dos fichas en la misma pieza a la vez se reparten a los lados del punto.
    const ocupado = (token: string, p: Punto) => {
      for (const [otro, q] of posiciones) if (otro !== token && Math.hypot(q.x - p.x, q.y - p.y) < 4) return true
      return false
    }
    const destino = (token: string, p: Punto): Punto => {
      if (!ocupado(token, p)) return p
      return vertical() ? { x: p.x + 38, y: p.y } : { x: p.x, y: p.y + 13 }
    }

    const mover = (token: string, p: Punto, hasta: number) => {
      const el = fichaDe.get(token)
      if (!el) return
      const desde = (ultimo.get(token) ?? 0) + LEER
      const inicio = Math.max(desde, hasta - VIAJE)
      const dur = Math.max(0.15, hasta - inicio)
      const q = destino(token, p)
      posiciones.set(token, q)
      t.to(el, { x: q.x, y: q.y, duration: dur, ease: 'power2.inOut' }, Math.min(inicio, hasta - 0.15))
      ultimo.set(token, hasta)
    }

    for (const paso of g.pasos) {
      const at = paso.t
      switch (paso.tipo) {
        case 'sale': {
          const origen = emisores.get(paso.emisor)
          if (!origen) break
          const el = document.createElement('span')
          el.className = 'be-ficha'
          el.textContent = paso.etiqueta
          fichas!.appendChild(el)
          fichaDe.set(paso.token, el)
          vivas.add(paso.token)
          const p = destino(paso.token, ancla(origen, 'salida'))
          posiciones.set(paso.token, p)
          ultimo.set(paso.token, at - LEER)
          t.set(el, { x: p.x, y: p.y, xPercent: -50, yPercent: -50 }, 0)
          t.set(origen, { attr: { 'data-v': 'activo' } }, at)
          t.fromTo(el, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, at)
          break
        }
        case 'guarda': {
          const gd = guardas.get(paso.guarda)
          if (!gd) break
          if (vivas.has(paso.token)) mover(paso.token, ancla(gd, 'entrada'), at)
          t.call(() => {
            gd.dataset.v = paso.veredicto
            lectura(gd, texto(paso.lectura), true)
            const f = fichaDe.get(paso.token)
            if (f && paso.veredicto === 'aviso') f.dataset.tono = 'aviso'
            else if (f && f.dataset.tono === 'aviso') delete f.dataset.tono
          }, undefined, at)
          t.fromTo(gd, { scale: 1 }, { scale: 1.035, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.out' }, at)
          break
        }
        case 'transicion': {
          const destinoEl = estados.get(paso.a)
          if (paso.aplicada && destinoEl) mover(paso.token, ancla(destinoEl, 'entrada'), at + 0.4)
          if (!paso.de) {
            // Nace el pago: el estado inicial se enciende al llegar la ficha.
            t.call(() => marcarActual(paso.a), undefined, at + 0.4)
            break
          }
          const tipo = paso.tentativa ? 'tentativa' : paso.aplicada ? 'aplicada' : 'frenada'
          const de = paso.de
          t.call(() => {
            const a = dibujarArco({ de, a: paso.a, aplicada: paso.aplicada }, tipo)
            if (!a) return
            if (tipo === 'tentativa') arcoTentativo.el = a
            if (tipo === 'aplicada') {
              // Se dibuja de punta a punta; las otras dos ya son punteadas y
              // un trazo que crece no se leería: entran con un fundido.
              gsap.fromTo(a.path, { strokeDasharray: a.largo, strokeDashoffset: a.largo }, {
                strokeDashoffset: 0,
                duration: 0.5,
                ease: 'power2.out',
                onComplete: () => a.path.removeAttribute('style'),
              })
            } else {
              gsap.from(a.path, { opacity: 0, duration: 0.4 })
            }
            gsap.from(a.g.querySelectorAll('.be-arco-x, .be-arco-punta'), { opacity: 0, scale: 0.4, transformOrigin: 'center', duration: 0.3, delay: 0.35 })
            if (tipo === 'aplicada') marcarActual(paso.a)
            if (tipo === 'tentativa') destinoEl?.setAttribute('data-tentativo', '')
          }, undefined, at + 0.35)
          break
        }
        case 'vuelve': {
          const el = fichaDe.get(paso.token)
          const origen = emisores.get(paso.emisor)
          if (!el || !origen) break
          const etiqueta = paso.etiqueta
          t.call(() => {
            el.textContent = etiqueta
            el.dataset.tono = 'ok'
          }, undefined, Math.max((ultimo.get(paso.token) ?? 0) + LEER, at - VIAJE))
          mover(paso.token, ancla(origen, 'salida'), at)
          t.to(el, { opacity: 0, duration: 0.4 }, at + 0.9)
          break
        }
        case 'absorbe': {
          const el = fichaDe.get(paso.token)
          if (el) t.to(el, { scale: 0.2, opacity: 0, duration: 0.35, ease: 'power2.in' }, at)
          posiciones.delete(paso.token)
          vivas.delete(paso.token)
          break
        }
        case 'descarta': {
          const el = fichaDe.get(paso.token)
          if (!el) break
          t.call(() => {
            el.dataset.tono = 'error'
          }, undefined, at)
          t.to(el, { y: '+=14', opacity: 0, duration: 0.6, ease: 'power2.in' }, at + 0.25)
          posiciones.delete(paso.token)
          vivas.delete(paso.token)
          break
        }
        case 'caida': {
          t.call(() => mapa!.classList.add('is-caida'), undefined, at)
          t.to(mapa!.querySelector('[data-maquina]'), { x: 3, duration: 0.05, repeat: 5, yoyo: true, ease: 'none' }, at)
          t.call(() => mapa!.classList.remove('is-caida'), undefined, at + 0.6)
          break
        }
        case 'revierte': {
          t.call(() => {
            const a = arcoTentativo.el
            if (a) gsap.to(a.g, { opacity: 0, duration: 0.45, onComplete: () => a.g.remove() })
            estados.get(paso.de)?.removeAttribute('data-tentativo')
            marcarActual(paso.a)
          }, undefined, at)
          break
        }
        case 'registro': {
          const r = paso.registro
          t.call(() => registrar(r, true), undefined, at)
          break
        }
        case 'fin': {
          if (selloEl) t.fromTo(selloEl, { opacity: 0, scale: 1.6, rotation: -14 }, { opacity: 1, scale: 1, rotation: -4, duration: 0.45, ease: 'back.out(2.2)' }, at)
          break
        }
      }
    }
    t.to({}, { duration: 0.01 }, g.duracion)
    return t
  }

  const progreso = (i: number) => botones[i]?.querySelector<HTMLElement>('[data-exp-progreso]')

  function reproducir(i: number) {
    tl?.kill()
    botones.forEach((_, j) => {
      const p = progreso(j)
      if (p) gsap.set(p, { scaleX: 0 })
    })
    actual = i
    const g = guionDe(EXPERIMENTOS[i], vuelta++)
    cabecera(i)
    if (opciones.reducido) {
      cuadro(g)
      return
    }
    limpiar()
    medirLienzo()
    // Los emisores dicen desde el principio qué van a mandar.
    for (const [id, l] of Object.entries(g.emisores)) {
      const el = emisores.get(id)
      if (el && l) lectura(el, texto(l), false)
    }
    registrar(g.inicial, false)
    marcarActual(g.inicial.estado)
    if (selloEl) gsap.set(selloEl, { opacity: 0 })
    tl = construir(g)
    const barra = progreso(i)
    if (barra) tl.fromTo(barra, { scaleX: 0 }, { scaleX: 1, duration: g.duracion, ease: 'none' }, 0)
    tl.eventCallback('onComplete', () => reproducir((actual + 1) % EXPERIMENTOS.length))
    tl.timeScale(encima && performance.now() > clicHasta ? LENTO : 1)
    if (visible && !document.hidden) tl.play()
  }

  // ── Interacción ────────────────────────────────────────────────────────
  botones.forEach((b, i) =>
    b.addEventListener('click', () => {
      clicHasta = performance.now() + 4000
      reproducir(i)
    }),
  )
  // Flechas entre pestañas, como en un grupo de pestañas.
  raiz.querySelector('.be-tabs')?.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key
    if (k !== 'ArrowRight' && k !== 'ArrowLeft') return
    const i = botones.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const j = (i + (k === 'ArrowRight' ? 1 : -1) + botones.length) % botones.length
    botones[j].focus()
    clicHasta = performance.now() + 4000
    reproducir(j)
  })

  if (opciones.reducido) return

  raiz.dataset.vivo = ''
  raiz.addEventListener('pointerenter', () => {
    encima = true
    if (performance.now() > clicHasta) tl?.timeScale(LENTO)
  })
  raiz.addEventListener('pointerleave', () => {
    encima = false
    tl?.timeScale(1)
  })
  // Pasado el margen del clic, si el cursor sigue encima, se vuelve a frenar.
  raiz.addEventListener('pointermove', () => {
    if (encima && performance.now() > clicHasta && tl && tl.timeScale() !== LENTO) tl.timeScale(LENTO)
  }, { passive: true })

  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting
      if (!tl) return
      if (visible && !document.hidden) tl.play()
      else tl.pause()
    },
    { threshold: 0.15 },
  )
  io.observe(raiz)
  document.addEventListener('visibilitychange', () => {
    if (!tl) return
    if (document.hidden) tl.pause()
    else if (visible) tl.play()
  })

  // Un cambio de maquetación (fuentes, rotar el celular) mueve todas las
  // piezas: se vuelve a empezar el experimento en curso con medidas nuevas.
  let ancho = mapa.offsetWidth
  let espera = 0
  new ResizeObserver(() => {
    if (Math.abs(mapa.offsetWidth - ancho) < 2) return
    ancho = mapa.offsetWidth
    clearTimeout(espera)
    espera = window.setTimeout(() => reproducir(actual), 200)
  }).observe(mapa)

  reproducir(0)
  document.fonts?.ready.then(() => reproducir(actual)).catch(() => {})
}
