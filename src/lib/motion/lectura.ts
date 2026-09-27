// Motor de lectura de cada artículo de /notes: el mapa vivo de la cabecera,
// el progreso (índice lateral en escritorio, barra superior en móvil), la
// sección activa del índice, "la decisión, en corto" y las miniaturas de las
// relacionadas.
//
// Motion sobrio a propósito: es una página para leer. Sin Lenis (el scroll
// nativo es el que el lector espera en un texto largo y el que respetan los
// enlaces del índice) y sin entradas escalonadas del texto.
//
// Módulo solo de navegador.

import { montarPortadas, type Portada } from './portadas-gl'
import { minutosRestantes } from './notas'

type Textos = { quedan: string; terminada: string }

export function montarLectura(raiz: HTMLElement) {
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const textos: Textos = JSON.parse(raiz.dataset.t ?? '{}')
  const minutos = Number(raiz.dataset.minutos ?? 0)

  mapaCabecera(raiz, reducido)
  decisionCorta(raiz, reducido)
  miniaturas(raiz)

  const articulo = raiz.querySelector<HTMLElement>('.note-prose')
  if (!articulo) return
  const barra = document.querySelector<HTMLElement>('.na-progreso')
  const relleno = raiz.querySelector<HTMLElement>('.na-indice-relleno')
  const quedan = raiz.querySelector<HTMLElement>('.na-quedan')
  const enlaces = Array.from(raiz.querySelectorAll<HTMLAnchorElement>('.na-indice-lista a'))
  const titulos = enlaces
    .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    .filter((h): h is HTMLElement => !!h)

  let pendiente = false
  const medir = () => {
    pendiente = false
    const r = articulo.getBoundingClientRect()
    // Se da por leído lo que ya pasó del primer tercio de la pantalla: es
    // donde descansa la vista al leer, no el borde superior.
    const linea = window.innerHeight * 0.35
    const p = Math.min(1, Math.max(0, (linea - r.top) / Math.max(1, r.height - window.innerHeight * 0.4)))
    if (barra) barra.style.transform = `scaleX(${p})`
    if (relleno) relleno.style.transform = `scaleY(${p})`
    if (quedan) {
      const m = minutosRestantes(minutos, p)
      quedan.textContent = m === 0 ? textos.terminada : textos.quedan.replace('{n}', String(m))
    }
    // Sección activa: el último título que ya cruzó la línea de lectura.
    let activo = -1
    titulos.forEach((h, i) => {
      if (h.getBoundingClientRect().top <= linea) activo = i
    })
    enlaces.forEach((a, i) => {
      if (i === activo) a.setAttribute('aria-current', 'location')
      else a.removeAttribute('aria-current')
    })
  }
  const pedir = () => {
    if (pendiente) return
    pendiente = true
    requestAnimationFrame(medir)
  }
  window.addEventListener('scroll', pedir, { passive: true })
  window.addEventListener('resize', pedir)
  raiz.classList.add('leyendo')
  medir()
}

/** El mapa de la nota, vivo mientras está en pantalla (deriva lenta). */
function mapaCabecera(raiz: HTMLElement, reducido: boolean) {
  const lienzo = raiz.querySelector<HTMLCanvasElement>('.na-lienzo')
  const dato = lienzo?.dataset.mapa
  if (!lienzo || !dato) return
  const portadas = montarPortadas(lienzo)
  if (!portadas) return
  const mapa: Portada = JSON.parse(dato)
  portadas.mostrar(mapa)
  if (reducido) return
  let visible = true
  const actualizar = () => portadas.animar(visible && !document.hidden)
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    actualizar()
  }).observe(lienzo)
  document.addEventListener('visibilitychange', actualizar)
}

function decisionCorta(raiz: HTMLElement, reducido: boolean) {
  const caja = raiz.querySelector<HTMLElement>('.dc')
  if (!caja || reducido) return
  caja.classList.add('pendiente')
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      // Un fotograma de margen: con la clase `pendiente` y `vista` en el mismo
      // fotograma el navegador no ve el estado inicial y no hay transición.
      requestAnimationFrame(() => requestAnimationFrame(() => caja.classList.add('vista')))
    },
    { rootMargin: '0px 0px -15% 0px' },
  )
  io.observe(caja)
}

function miniaturas(raiz: HTMLElement) {
  const lienzos = Array.from(raiz.querySelectorAll<HTMLCanvasElement>('.na-rel-lienzo'))
  if (!lienzos.length) return
  const io = new IntersectionObserver(
    (obs) => {
      if (!obs.some((o) => o.isIntersecting)) return
      io.disconnect()
      const portadas = montarPortadas(document.createElement('canvas'))
      if (!portadas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      for (const c of lienzos) {
        c.width = Math.round((c.offsetWidth || 400) * dpr)
        c.height = Math.round((c.offsetHeight || 250) * dpr)
        portadas.pintarEn(JSON.parse(c.dataset.mapa ?? 'null'), c)
      }
      portadas.destruir()
    },
    { rootMargin: '400px' },
  )
  io.observe(lienzos[0])
}
