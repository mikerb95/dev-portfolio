// Motion transversal de las landings comerciales (/paginas-web y
// /capacitacion-ia). Las piezas grandes de cada página viven en sus
// componentes; esto monta lo que comparten, por atributos:
//   · `[data-hero-linea]`  titular del hero, palabra a palabra desde su ranura
//   · `[data-hero-sigue]`  lo que acompaña al titular (párrafo, botones)
//   · `[data-hero-pieza]`  la pieza visual del hero (celular, mesa de trabajo)
//   · `[data-titular]`     titulares de sección, línea a línea
//   · `[data-entrada]`     rejillas cuyos hijos entran escalonados
//   · `[data-odometro]`    cifras que ruedan hasta su valor
//   · `[data-magnetico]`   botones que se inclinan hacia el cursor
//   · `[data-foco]`        rejillas con la luz que sigue al cursor
//   · `[data-faq]`         preguntas frecuentes que abren deslizando
// Con movimiento reducido no se monta nada: la página queda quieta y completa,
// y las preguntas abren con el comportamiento nativo del navegador.
//
// Módulo solo de navegador.

import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { foco, inclinar, magnetico, odometro, punteroFino, revelarTitular } from './efectos'

gsap.registerPlugin(ScrollTrigger, SplitText)

export function montarLanding(opciones: { inclinarPieza?: number } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const lenis = new Lenis()
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // Fail-open: si algo falla a medio montar, todo lo que pudo quedar escondido
  // vuelve a su sitio. Una entrada que deja una sección en blanco no es
  // decoración, es una caída.
  try {
    document.querySelectorAll<HTMLElement>('[data-hero-linea]').forEach((l, i) => {
      const split = new SplitText(l, { type: 'words', mask: 'words' })
      gsap.from(split.words, { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.06, delay: 0.1 + i * 0.18 })
    })
    gsap.from('[data-hero-sigue]', {
      y: 18,
      opacity: 0,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.08,
      delay: 0.55,
      clearProps: 'transform,opacity',
    })
    gsap.from('[data-hero-pieza]', {
      y: 60,
      opacity: 0,
      rotation: 3,
      duration: 1.4,
      ease: 'expo.out',
      delay: 0.35,
      clearProps: 'transform,opacity',
    })

    document.querySelectorAll<HTMLElement>('[data-titular]').forEach(revelarTitular)

    document.querySelectorAll<HTMLElement>('[data-entrada]').forEach((rejilla) => {
      gsap.from(rejilla.children, {
        y: 34,
        opacity: 0,
        duration: 0.9,
        ease: 'expo.out',
        stagger: 0.08,
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: rejilla, start: 'top 86%' },
      })
    })

    document.querySelectorAll<HTMLElement>('[data-odometro]').forEach(odometro)

    if (punteroFino()) {
      document.querySelectorAll<HTMLElement>('[data-magnetico]').forEach((el) => magnetico(el))
      document.querySelectorAll<HTMLElement>('[data-foco]').forEach((el) => foco(el))
      const pieza = document.querySelector<HTMLElement>('[data-hero-pieza]')
      if (pieza && opciones.inclinarPieza) inclinar(pieza, opciones.inclinarPieza)
    }

    // <details> sigue siendo el elemento (teclado, lectores de pantalla y la
    // búsqueda del navegador funcionan igual); solo se anima la altura.
    document.querySelectorAll<HTMLDetailsElement>('[data-faq] details').forEach((d) => {
      const resumen = d.querySelector('summary')
      const cuerpo = d.querySelector<HTMLElement>('.faq-cuerpo')
      if (!resumen || !cuerpo) return
      resumen.addEventListener('click', (e) => {
        e.preventDefault()
        if (d.open) {
          gsap.to(cuerpo, {
            height: 0,
            opacity: 0,
            duration: 0.35,
            ease: 'power2.inOut',
            onComplete: () => {
              d.open = false
              gsap.set(cuerpo, { clearProps: 'height,opacity' })
            },
          })
        } else {
          d.open = true
          gsap.fromTo(cuerpo, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.5, ease: 'expo.out', clearProps: 'height' })
        }
      })
    })
  } catch (err) {
    console.warn('[landing] motion deshabilitado tras un fallo', err)
    gsap.set('[data-entrada] > *, [data-hero-pieza], [data-hero-sigue], .titular-linea', { clearProps: 'transform,opacity' })
  }
}
