// Huellas en SVG dibujadas en el navegador para el tablero de
// /lab/fingerprint: una por dispositivo que entra a la sala y las de la
// comprobación de defensas. Mismo marcado y mismas clases que
// components/lab/HuellaCrestas.astro (que la pinta desde el servidor).
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { LIENZO, YEMA, crestas } from './fingerprint-sala'
import type { ParametrosHuella } from './huella'

const NS = 'http://www.w3.org/2000/svg'
let contador = 0

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

export type HuellaSvg = {
  svg: SVGSVGElement
  /** Redibuja las crestas con otros parámetros (sin animar). */
  pintar: (p: ParametrosHuella) => void
  /** Dibuja las crestas del centro hacia afuera, como si se fueran leyendo. */
  dibujar: (opciones?: { retraso?: number; duracion?: number }) => gsap.core.Tween | null
  /** Barrido de lectura y destello: "este dispositivo ya lo conozco". */
  reconocer: () => gsap.core.Timeline | null
}

export function crearHuellaSvg(p: ParametrosHuella, opciones: { etiqueta?: string; anillos?: number } = {}): HuellaSvg {
  const anillos = opciones.anillos ?? 15
  const uid = `hc-${++contador}`
  const svg = el('svg', { class: 'hc', viewBox: `0 0 ${LIENZO.ancho} ${LIENZO.alto}` })
  if (opciones.etiqueta) {
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', opciones.etiqueta)
  } else {
    svg.setAttribute('aria-hidden', 'true')
  }
  const clip = el('clipPath', { id: uid })
  clip.appendChild(el('ellipse', { cx: String(YEMA.cx), cy: String(YEMA.cy), rx: String(YEMA.rx), ry: String(YEMA.ry) }))
  const defs = el('defs', {})
  defs.appendChild(clip)
  const g = el('g', { 'clip-path': `url(#${uid})` })
  const trazos: SVGPathElement[] = []
  for (let i = 0; i < anillos; i++) {
    const path = el('path', { pathLength: '1' })
    path.style.opacity = (0.95 - i * 0.03).toFixed(2)
    trazos.push(path)
    g.appendChild(path)
  }
  const barrido = el('line', { class: 'hc-barrido', x1: '-5', x2: '105', y1: '0', y2: '0' })
  g.appendChild(barrido)
  svg.append(defs, g)

  const pintar = (params: ParametrosHuella) => {
    crestas(params, { anillos }).forEach((d, i) => trazos[i]?.setAttribute('d', d))
  }
  pintar(p)

  return {
    svg,
    pintar,
    dibujar({ retraso = 0, duracion = 1.1 } = {}) {
      // Con dasharray 1 y pathLength 1, el trazo se "escribe" moviendo el
      // desfase; al terminar se devuelve el control al CSS (las crestas de
      // las defensas se vuelven a redibujar con `pintar` y no deben quedar
      // recortadas por un dash residual).
      gsap.set(trazos, { strokeDasharray: 1, strokeDashoffset: 1 })
      return gsap.to(trazos, {
        strokeDashoffset: 0,
        duration: duracion,
        ease: 'power2.out',
        stagger: 0.045,
        delay: retraso,
        clearProps: 'strokeDasharray,strokeDashoffset',
      })
    },
    reconocer() {
      const tl = gsap.timeline()
      tl.set(barrido, { attr: { y1: 4, y2: 4 }, opacity: 0.9 })
        .to(barrido, { attr: { y1: LIENZO.alto - 6, y2: LIENZO.alto - 6 }, duration: 0.9, ease: 'power1.inOut' })
        .to(barrido, { opacity: 0, duration: 0.25 }, '>-0.1')
        // El destello: las crestas pasan al color de "revisita" y vuelven.
        .add(() => svg.classList.add('hc-ember'), 0.15)
        .add(() => svg.classList.remove('hc-ember'), 1.9)
      return tl
    },
  }
}
