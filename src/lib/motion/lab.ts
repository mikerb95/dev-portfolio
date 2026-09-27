// Motion de las secciones de /lab bajo el hero. Cada pieza anima DESDE cero
// HASTA el estado que ya pintó el servidor: sin JS, con movimiento reducido o
// si algo falla a medio montar, lo que queda en pantalla es el dato completo.
//   · pipeline: una luz recorre cada corrida etapa por etapa; los rollbacks
//     vuelven por su desvío
//   · hallazgos: todos arrancan en "abiertos" y viajan a donde terminaron
//   · carga: la escalera sube escalón por escalón, el p95 la sigue, el quiebre
//     sacude su escalón y al final aparece cuánto tardó en volver
//   · analizador: las 12 pruebas corren en paralelo y llegan en desorden
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Flip } from 'gsap/Flip'

gsap.registerPlugin(ScrollTrigger, Flip)

export function montarSecciones(opciones: { reducido: boolean }): void {
  if (opciones.reducido) return
  const piezas: [string, () => void, () => void][] = [
    ['pista', pista, restaurarPista],
    ['ciclo', ciclo, restaurarCiclo],
    ['escalera', escaleraCarga, restaurarEscalera],
    ['analizador', analizador, restaurarAnalizador],
  ]
  // Fail-open por pieza: una que falla no se lleva a las demás, y devuelve a
  // su sitio lo que pudo quedar escondido.
  for (const [nombre, montar, restaurar] of piezas) {
    try {
      montar()
    } catch (err) {
      console.warn(`[lab] ${nombre} sin motion tras un fallo`, err)
      try {
        restaurar()
      } catch {
        // el marcado del servidor ya es el estado final
      }
    }
  }
}

/**
 * Dispara `fn` la primera vez que `trigger` cruza `start`. Sin `once: true` a
 * propósito (ver motion-reveal.ts): ScrollTrigger se autodestruye con esa
 * opción y, si ocurre dentro del refresh de otro trigger, deja colgado el
 * bucle interno y el resto de las secciones nunca entra.
 */
function alEntrar(trigger: Element, start: string, fn: () => void) {
  let hecho = false
  ScrollTrigger.create({
    trigger,
    start,
    onEnter: () => {
      if (hecho) return
      hecho = true
      fn()
    },
  })
}

// ── Pipeline ───────────────────────────────────────────────────────────────

const ETAPAS = ['calidad', 'deploy', 'health'] as const

function pista() {
  const lista = document.querySelector<HTMLElement>('[data-pista]')
  if (!lista) return
  const filas = [...lista.querySelectorAll<HTMLElement>('.pp-fila')]
  if (!filas.length) return

  // Estado inicial: la pista apagada. Se fija ANTES de crear el trigger, o se
  // vería un fotograma de la pista completa antes de apagarse.
  for (const f of filas) {
    gsap.set(f.querySelector('[data-riel]'), { scaleX: 0 })
    f.querySelectorAll<HTMLElement>('.pp-nodo').forEach((n) => n.setAttribute('data-apagado', ''))
    const desvio = f.querySelector('.pp-desvio')
    if (desvio) gsap.set(desvio, { clipPath: 'inset(0% 0% -200% 100%)' })
    gsap.set(f.querySelectorAll('.pp-badge, .pp-meta, .pp-cuando'), { opacity: 0 })
  }

  alEntrar(lista, 'top 78%', () => {
    const tl = gsap.timeline()
    // La más reciente arriba sale primero; las demás, escalonadas como un
    // historial que se reproduce.
    filas.forEach((f, i) => {
      const t0 = i * 0.11
      const chispa = f.querySelector<HTMLElement>('[data-chispa]')
      const riel = f.querySelector('[data-riel]')
      const nodo = (e: string) => f.querySelector<HTMLElement>(`.pp-nodo[data-etapa="${e}"]`)
      const desenlace = f.dataset.desenlace
      const TRAMO = 0.34
      tl.set(chispa, { left: '0%', opacity: 1, background: '#ffffff' }, t0)
      ETAPAS.forEach((e, k) => {
        tl.call(() => nodo(e)?.removeAttribute('data-apagado'), undefined, t0 + k * TRAMO)
        tl.fromTo(nodo(e), { scale: 1.8 }, { scale: 1, duration: 0.35, ease: 'back.out(2)' }, t0 + k * TRAMO)
      })
      tl.to(chispa, { left: '100%', duration: TRAMO * 2, ease: 'none' }, t0)
      tl.to(riel, { scaleX: 1, duration: TRAMO * 2, ease: 'none' }, t0)
      const fin = t0 + TRAMO * 2
      if (desenlace === 'ok') {
        tl.to(chispa, { opacity: 0, duration: 0.25 }, fin)
      } else {
        // En el health check la luz se vuelve roja; en un rollback sigue por
        // el desvío de vuelta a la versión anterior.
        tl.set(chispa, { background: '#ff6b3d' }, fin)
        const desvio = f.querySelector('.pp-desvio')
        if (desvio) {
          tl.to(desvio, { clipPath: 'inset(0% 0% -200% 0%)', duration: 0.6, ease: 'power2.inOut' }, fin + 0.05)
          tl.to(chispa, { left: '0%', duration: 0.6, ease: 'power2.inOut' }, fin + 0.05)
          // El desvío baja ~11 px en su punto medio (la curva del SVG).
          tl.to(chispa, { y: 11, duration: 0.3, ease: 'sine.out', yoyo: true, repeat: 1 }, fin + 0.05)
          tl.to(chispa, { opacity: 0, duration: 0.25 }, fin + 0.65)
        } else {
          tl.to(chispa, { opacity: 0, duration: 0.35 }, fin + 0.15)
        }
      }
      tl.to(f.querySelectorAll('.pp-badge, .pp-meta, .pp-cuando'), { opacity: 1, duration: 0.4, stagger: 0.05, clearProps: 'opacity' }, fin - 0.1)
    })
  })
}

function restaurarPista() {
  document.querySelectorAll('[data-pista] [data-apagado]').forEach((n) => n.removeAttribute('data-apagado'))
  gsap.set('[data-pista] [data-riel], [data-pista] .pp-desvio, [data-pista] .pp-badge, [data-pista] .pp-meta, [data-pista] .pp-cuando', { clearProps: 'all' })
}

// ── Hallazgos ──────────────────────────────────────────────────────────────

function ciclo() {
  const raiz = document.querySelector<HTMLElement>('[data-ciclo]')
  const abiertos = raiz?.querySelector<HTMLElement>('[data-caja="open"] [data-puntos]')
  if (!raiz || !abiertos) return
  const puntos = [...raiz.querySelectorAll<HTMLElement>('.ch-punto')]
  const cifras = [...raiz.querySelectorAll<HTMLElement>('[data-ciclo-n]')]
  const total = cifras.reduce((s, el) => s + Number(el.dataset.cicloN), 0)
  const viajan = puntos.filter((p) => p.dataset.destino !== 'open')
  if (!viajan.length) return

  // Punto de partida: todos abiertos, como nace cada hallazgo en la base.
  for (const p of viajan) abiertos.appendChild(p)
  for (const el of cifras) el.textContent = el.closest('[data-caja="open"]') ? String(total) : '0'

  alEntrar(raiz, 'top 75%', () => {
    const estado = Flip.getState(viajan)
    for (const p of viajan) {
      raiz.querySelector(`[data-caja="${p.dataset.destino}"] [data-puntos]`)?.appendChild(p)
      p.setAttribute('data-vuelo', '')
    }
    const DUR = 0.9
    const PASO = Math.min(0.08, 1.6 / viajan.length)
    const tl = Flip.from(estado, { duration: DUR, ease: 'power3.inOut', stagger: PASO })
    viajan.forEach((p, i) => tl.call(() => p.removeAttribute('data-vuelo'), undefined, i * PASO + DUR))
    // Las cifras bajan y suben al ritmo de los puntos, hasta el valor real.
    const fin = (viajan.length - 1) * PASO + DUR
    for (const el of cifras) {
      const destino = Number(el.dataset.cicloN)
      const o = { v: Number(el.textContent) }
      tl.to(o, { v: destino, duration: fin, ease: 'none', onUpdate: () => (el.textContent = String(Math.round(o.v))) }, 0)
    }
  })
}

function restaurarCiclo() {
  const raiz = document.querySelector<HTMLElement>('[data-ciclo]')
  if (!raiz) return
  raiz.querySelectorAll<HTMLElement>('.ch-punto').forEach((p) => {
    p.removeAttribute('data-vuelo')
    raiz.querySelector(`[data-caja="${p.dataset.destino}"] [data-puntos]`)?.appendChild(p)
  })
  raiz.querySelectorAll<HTMLElement>('[data-ciclo-n]').forEach((el) => (el.textContent = el.dataset.cicloN ?? ''))
}

// ── Pruebas de carga ───────────────────────────────────────────────────────

function escaleraCarga() {
  const fig = document.querySelector<HTMLElement>('[data-escalera]')
  if (!fig) return
  const svgs = [...fig.querySelectorAll<SVGSVGElement>('.ec-svg')]
  const preparados = svgs.map((svg) => {
    const barras = [...svg.querySelectorAll<SVGRectElement>('rect[data-of], rect[data-sv]')]
    for (const r of barras) gsap.set(r, { attr: { y: Number(r.dataset.y) + Number(r.dataset.h), height: 0 } })
    const linea = svg.querySelector<SVGPathElement>('[data-p95]')
    const largo = linea?.getTotalLength() ?? 0
    if (linea) gsap.set(linea, { strokeDasharray: largo, strokeDashoffset: largo })
    gsap.set(svg.querySelectorAll('[data-pt], [data-quiebre], [data-sostiene], [data-recupera]'), { opacity: 0 })
    return { svg, linea, largo }
  })

  alEntrar(fig, 'top 72%', () => {
    for (const { svg, linea } of preparados) {
      const escalones = [...svg.querySelectorAll<SVGGElement>('[data-escalon]')]
      const PASO = 0.42
      const tl = gsap.timeline()
      escalones.forEach((g, i) => {
        const t0 = i * PASO
        const of = g.querySelector<SVGRectElement>('rect[data-of]')
        const sv = g.querySelector<SVGRectElement>('rect[data-sv]')
        if (of) tl.to(of, { attr: { y: Number(of.dataset.y), height: Number(of.dataset.h) }, duration: 0.4, ease: 'power3.out' }, t0)
        if (sv) tl.to(sv, { attr: { y: Number(sv.dataset.y), height: Number(sv.dataset.h) }, duration: 0.5, ease: 'power3.out' }, t0 + 0.12)
        tl.to(svg.querySelector(`[data-pt="${i}"]`), { opacity: 1, duration: 0.2 }, t0 + 0.3)
        if (g.dataset.estado === 'roto' && !g.previousElementSibling?.matches('[data-estado="roto"]')) {
          // El primer escalón roto: la marca del quiebre entra y el escalón
          // se sacude, como el sistema cuando deja de responder.
          tl.to(svg.querySelector('[data-quiebre]'), { opacity: 1, duration: 0.25 }, t0 + 0.3)
          tl.to(g, { x: 2.5, duration: 0.05, repeat: 7, yoyo: true, ease: 'none' }, t0 + 0.3)
          if (sv) tl.fromTo(sv, { attr: { 'fill-opacity': 1 } }, { attr: { 'fill-opacity': 0.85 }, duration: 0.6 }, t0 + 0.3)
        }
      })
      const total = escalones.length * PASO
      if (linea) tl.to(linea, { strokeDashoffset: 0, duration: total, ease: 'none' }, 0.3)
      tl.to(svg.querySelector('[data-sostiene]'), { opacity: 1, duration: 0.3 }, 0.5)
      const recupera = svg.querySelector('[data-recupera]')
      const arco = recupera?.querySelector<SVGPathElement>('.ec-recupera-arco')
      tl.to(recupera, { opacity: 1, duration: 0.3 }, total + 0.35)
      if (arco) {
        const l = arco.getTotalLength()
        tl.fromTo(arco, { strokeDasharray: `0 ${l}` }, { strokeDasharray: `${l} 0`, duration: 0.8, ease: 'power2.out', clearProps: 'strokeDasharray' }, total + 0.4)
      }
    }
  })
}

function restaurarEscalera() {
  document.querySelectorAll<SVGElement>('[data-escalera] rect[data-of], [data-escalera] rect[data-sv]').forEach((r) => {
    r.setAttribute('y', r.dataset.y ?? '0')
    r.setAttribute('height', r.dataset.h ?? '0')
  })
  gsap.set('[data-escalera] [data-p95], [data-escalera] [data-pt], [data-escalera] [data-quiebre], [data-escalera] [data-sostiene], [data-escalera] [data-recupera]', { clearProps: 'all' })
}

// ── Analizador de sitios ───────────────────────────────────────────────────

/**
 * Bucle de las 12 pruebas: todas arrancan a la vez y terminan en desorden,
 * cada una con su tiempo (por eso las tarjetas del analizador real aparecen
 * una a una). Solo mientras el panel está en pantalla.
 */
function analizador() {
  const panel = document.querySelector<HTMLElement>('[data-analizador]')
  if (!panel) return
  const pruebas = [...panel.querySelectorAll<HTMLElement>('[data-an-prueba]')]
  const cuenta = panel.querySelector<HTMLElement>('[data-an-cuenta]')
  const plantilla = cuenta?.textContent ?? ''
  // El texto del servidor ya dice "12/12": se reescribe solo el primer número.
  const escribir = (n: number) => {
    if (cuenta) cuenta.textContent = plantilla.replace(/^\d+/, String(n))
  }
  let tl: gsap.core.Timeline | null = null

  const vuelta = () => {
    tl?.kill()
    tl = gsap.timeline({ onComplete: vuelta })
    let hechas = 0
    tl.call(() => {
      hechas = 0
      escribir(0)
      for (const p of pruebas) {
        p.removeAttribute('data-hecha')
        p.setAttribute('data-corre', '')
      }
    })
    // Tiempos repartidos entre 0,4 y 3 s, barajados en cada vuelta.
    const tiempos = pruebas.map(() => 0.4 + Math.random() * 2.6)
    pruebas.forEach((p, i) => {
      tl!.call(() => {
        p.removeAttribute('data-corre')
        p.setAttribute('data-hecha', '')
        escribir(++hechas)
      }, undefined, tiempos[i])
      tl!.fromTo(p, { scale: 1.08 }, { scale: 1, duration: 0.3, ease: 'power2.out' }, tiempos[i])
    })
    tl.to({}, { duration: 2.2 }, Math.max(...tiempos))
  }

  ScrollTrigger.create({
    trigger: panel,
    start: 'top 90%',
    end: 'bottom 10%',
    onToggle: (st) => {
      if (st.isActive) {
        if (!tl) vuelta()
        else tl.play()
      } else tl?.pause()
    },
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) tl?.pause()
    else if (tl && ScrollTrigger.isInViewport(panel)) tl.play()
  })
}

function restaurarAnalizador() {
  document.querySelectorAll<HTMLElement>('[data-analizador] [data-an-prueba]').forEach((p) => {
    p.removeAttribute('data-corre')
    p.setAttribute('data-hecha', '')
    p.style.removeProperty('transform')
  })
}
