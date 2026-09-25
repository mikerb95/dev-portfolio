// Motion de las secciones de /engineering (bajo el hero). Cada pieza anima
// DESDE cero HASTA el estado que ya pintó el servidor, así que sin JS, con
// movimiento reducido o si algo falla a medio montar, lo que queda en pantalla
// es el dato completo:
//   · medidores de Web Vitals: el histograma sube, la aguja del p75 barre la
//     escala y el punto "tú" cae donde midió el instrumento del hero
//   · pipeline: un paquete de luz recorre las etapas del último run y cada una
//     pasa por pendiente, en curso y lista
//   · tira de 90 días: las barras se levantan detrás de un barrido, y bajo el
//     cursor se lee el día
//   · fuentes: las vistas previas solo se animan mientras están en pantalla
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { enEscala } from './medicion'
import { alMedir } from './instrumento'
import type { VitalMetric } from '../vitals'

gsap.registerPlugin(ScrollTrigger)

export function montarSecciones(opciones: { reducido: boolean }): void {
  const { reducido } = opciones
  const pasos: [string, () => void, () => void][] = [
    ['medidores', () => medidores(reducido), () => gsap.set('.medidor-barras span, [data-aguja]', { clearProps: 'all' })],
    ['pipeline', () => pipeline(reducido), restaurarPipeline],
    ['tira', () => tira(reducido), () => gsap.set('.tira-barra, [data-runs] span', { clearProps: 'transform' })],
    ['fuentes', fuentes, () => {}],
  ]
  // Fail-open por pieza: una que falla no se lleva a las demás, y devuelve a su
  // sitio lo que pudo quedar escondido.
  for (const [nombre, montar, restaurar] of pasos) {
    try {
      montar()
    } catch (err) {
      console.warn(`[engineering] ${nombre} sin motion tras un fallo`, err)
      try {
        restaurar()
      } catch {
        // nada más que hacer: el marcado del servidor ya es el estado final
      }
    }
  }
}

// ── Medidores ──────────────────────────────────────────────────────────────

function medidores(reducido: boolean) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-medidor]'))

  // El punto "tú" llega del instrumento del hero, cuando se mide cada métrica
  // (INP solo existe tras una interacción, y puede llegar mucho después).
  alMedir((m: VitalMetric, v: number) => {
    const card = cards.find((c) => c.dataset.medidor === m)
    const tu = card?.querySelector<HTMLElement>('[data-tu]')
    if (!card || !tu) return
    const pos = `${enEscala(v, Number(card.dataset.tope)) * 100}%`
    if (reducido || tu.dataset.puesto) {
      gsap.set(tu, { left: pos, opacity: 1 })
    } else {
      tu.dataset.puesto = '1'
      gsap.fromTo(tu, { left: pos, opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.7, ease: 'bounce.out', delay: 0.4 })
    }
  })

  if (reducido) return
  for (const card of cards) {
    const barras = card.querySelectorAll<HTMLElement>('.medidor-barras span')
    const aguja = card.querySelector<HTMLElement>('[data-aguja]')
    const destino = aguja?.style.left ?? '0%'
    // Estado inicial fijado ANTES de crear el disparador: un from() dentro de
    // onEnter pinta un fotograma con las barras llenas antes de vaciarlas.
    gsap.set(barras, { scaleY: 0, transformOrigin: '50% 100%' })
    if (aguja) gsap.set(aguja, { left: '0%', opacity: 0 })
    ScrollTrigger.create({
      trigger: card,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(barras, { scaleY: 1, duration: 0.9, ease: 'expo.out', stagger: 0.022, delay: 0.15 })
        if (aguja) gsap.to(aguja, { left: destino, opacity: 1, duration: 1.5, ease: 'expo.inOut', delay: 0.35 })
      },
    })
  }
}

// ── Pipeline ───────────────────────────────────────────────────────────────

/** Riel y avance van de centro a centro de nodo, en fila (escritorio) o en columna (móvil). */
function geometriaPipe(pipe: HTMLElement) {
  const nodos = Array.from(pipe.querySelectorAll<HTMLElement>('.pipe-nodo'))
  const base = pipe.getBoundingClientRect()
  const centros = nodos.map((n) => {
    const r = n.getBoundingClientRect()
    return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }
  })
  const primero = centros[0]
  const ultimo = centros.at(-1)
  if (!primero || !ultimo) return { centros, vertical: false }
  const vertical = Math.abs(ultimo.y - primero.y) > Math.abs(ultimo.x - primero.x)
  for (const sel of ['.pipe-riel', '[data-pipe-avance]']) {
    const el = pipe.querySelector<HTMLElement>(sel)
    if (!el) continue
    Object.assign(el.style, vertical
      ? { left: `${primero.x}px`, top: `${primero.y}px`, width: '', height: `${ultimo.y - primero.y}px`, right: 'auto' }
      : { left: `${primero.x}px`, top: `${primero.y}px`, width: `${ultimo.x - primero.x}px`, height: '', right: 'auto' })
  }
  pipe.classList.toggle('vertical', vertical)
  return { centros, vertical }
}

function restaurarPipeline() {
  document.querySelectorAll<HTMLElement>('[data-etapa]').forEach((e) => delete e.dataset.estado)
  gsap.set('[data-pipe-avance], [data-pipe-rollback]', { clearProps: 'transform,opacity' })
  gsap.set('[data-pipe-paquete]', { opacity: 0 })
}

function pipeline(reducido: boolean) {
  const pipe = document.querySelector<HTMLElement>('[data-pipe]')
  if (!pipe) return
  let geo = geometriaPipe(pipe)
  new ResizeObserver(() => {
    geo = geometriaPipe(pipe)
  }).observe(pipe)
  if (reducido) return

  const etapas = Array.from(pipe.querySelectorAll<HTMLElement>('[data-etapa]'))
  const avance = pipe.querySelector<HTMLElement>('[data-pipe-avance]')!
  const paquete = pipe.querySelector<HTMLElement>('[data-pipe-paquete]')!
  const rollback = pipe.querySelector<HTMLElement>('[data-pipe-rollback]')
  const eje = () => (geo.vertical ? 'scaleY' : 'scaleX')

  etapas.forEach((e) => (e.dataset.estado = 'pendiente'))
  gsap.set(avance, { scaleX: 0, scaleY: 0, transformOrigin: '0% 0%' })
  if (rollback) gsap.set(rollback, { opacity: 0 })

  ScrollTrigger.create({
    trigger: pipe,
    start: 'top 78%',
    once: true,
    onEnter: () => {
      const { centros, vertical } = geo
      const n = centros.length
      const tl = gsap.timeline()
      gsap.set(avance, vertical ? { scaleX: 1, scaleY: 0 } : { scaleX: 0, scaleY: 1 })
      gsap.set(paquete, { x: centros[0]!.x, y: centros[0]!.y, opacity: 1 })
      const TRAMO = 0.7
      etapas.forEach((etapa, i) => {
        const t = i * TRAMO
        tl.call(() => (etapa.dataset.estado = 'corriendo'), [], t)
        tl.call(() => (etapa.dataset.estado = 'listo'), [], t + TRAMO * 0.75)
        if (i < n - 1) {
          const sig = centros[i + 1]!
          tl.to(paquete, { x: sig.x, y: sig.y, duration: TRAMO, ease: 'power2.inOut' }, t + TRAMO * 0.4)
          tl.to(avance, { [eje()]: (i + 1) / (n - 1), duration: TRAMO, ease: 'power2.inOut' }, t + TRAMO * 0.4)
        }
      })
      const fin = (n - 1) * TRAMO + TRAMO
      tl.to(paquete, { scale: 2.4, opacity: 0, duration: 0.6, ease: 'power2.out' }, fin)
      if (rollback) tl.to(rollback, { opacity: 1, duration: 0.6 }, fin + 0.1)
    },
  })

  const runs = document.querySelectorAll<HTMLElement>('[data-runs] span')
  gsap.set(runs, { scaleY: 0, transformOrigin: '50% 100%' })
  ScrollTrigger.create({
    trigger: '[data-runs]',
    start: 'top 92%',
    once: true,
    onEnter: () => gsap.to(runs, { scaleY: 1, duration: 0.8, ease: 'expo.out', stagger: 0.03 }),
  })
}

// ── Tira de 90 días ────────────────────────────────────────────────────────

function tira(reducido: boolean) {
  const tiraEl = document.querySelector<HTMLElement>('[data-tira]')
  const lectura = document.querySelector<HTMLElement>('[data-tira-lectura]')
  if (!tiraEl) return
  const dias = Array.from(tiraEl.querySelectorAll<HTMLElement>('.tira-dia'))
  const porDefecto = lectura?.textContent ?? ''

  // Lectura bajo el cursor (también con movimiento reducido: no es animación).
  let activa: HTMLElement | null = null
  tiraEl.addEventListener(
    'pointermove',
    (e) => {
      const r = tiraEl.getBoundingClientRect()
      const i = Math.min(dias.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * dias.length)))
      const dia = dias[i]!
      if (dia === activa) return
      activa?.classList.remove('activa')
      activa = dia
      dia.classList.add('activa')
      if (lectura) lectura.textContent = dia.dataset.lectura ?? ''
    },
    { passive: true },
  )
  tiraEl.addEventListener('pointerleave', () => {
    activa?.classList.remove('activa')
    activa = null
    if (lectura) lectura.textContent = porDefecto
  })

  if (reducido) return
  const barras = dias.map((d) => d.querySelector<HTMLElement>('.tira-barra')!)
  const barrido = tiraEl.querySelector<HTMLElement>('[data-tira-barrido]')
  gsap.set(barras, { scaleY: 0, transformOrigin: '50% 100%' })
  ScrollTrigger.create({
    trigger: tiraEl,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      const dur = 1.6
      gsap.to(barras, { scaleY: 1, duration: 0.7, ease: 'expo.out', stagger: { each: dur / barras.length } })
      if (barrido) {
        gsap.fromTo(
          barrido,
          { left: '0%', opacity: 1 },
          { left: '100%', duration: dur, ease: 'none', onComplete: () => void gsap.to(barrido, { opacity: 0, duration: 0.4 }) },
        )
      }
    },
  })
}

// ── Fuentes: animación solo en pantalla ────────────────────────────────────

function fuentes() {
  const vistas = document.querySelectorAll<HTMLElement>('.fuente-vista')
  const io = new IntersectionObserver((entradas) => {
    for (const en of entradas) en.target.classList.toggle('en-vista', en.isIntersecting)
  })
  vistas.forEach((v) => io.observe(v))
}
