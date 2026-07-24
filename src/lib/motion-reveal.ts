// Motion compartido entre páginas públicas: scroll suave (Lenis) + reveal
// "scan" en cards .glass + boot-reveal por carácter en headlines .hero-line.
// Módulo puro para el navegador (sin ../db, sin node:crypto) — se importa
// desde <script> de cada página que quiera el mismo lenguaje visual.
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText)

export function initPageMotion(opts: { cardSelector?: string } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null

  const lenis = new Lenis()
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // Boot reveal — cada .hero-line se divide en caracteres. Reasignamos la
  // clase de degradado (text-mask / text-mask-cyan) porque background-clip:
  // text no se propaga a los hijos que crea SplitText.
  document.querySelectorAll<HTMLElement>('.hero-line').forEach((line, i) => {
    const maskClass = line.classList.contains('text-mask-cyan') ? 'text-mask-cyan' : 'text-mask'
    const split = new SplitText(line, { type: 'chars' })
    split.chars.forEach((c) => c.classList.add(maskClass))
    gsap.set(split.chars, { opacity: 0, yPercent: 100 })
    gsap.to(split.chars, {
      opacity: 1,
      yPercent: 0,
      duration: 0.7,
      ease: 'power3.out',
      stagger: 0.02,
      delay: 0.15 + i * 0.12,
    })
  })

  // Reveal por "scan" en las cards — clip-path wipe + barra de luz, en vez
  // de un fade plano. Se escanea dentro de <main> a propósito: el Navbar
  // (fijo, fuera de <main>) también usa .glass y no debe animarse.
  const cards = document.querySelectorAll<HTMLElement>(opts.cardSelector ?? 'main .glass, main .glass-strong')
  cards.forEach((card, i) => {
    card.style.position = card.style.position || 'relative'
    card.style.overflow = 'hidden'

    const bar = document.createElement('div')
    bar.setAttribute('aria-hidden', 'true')
    bar.style.cssText =
      'position:absolute;inset-block:0;left:0;width:33%;pointer-events:none;' +
      'background:linear-gradient(90deg, transparent, rgba(0,242,255,.35), transparent);'
    card.appendChild(bar)

    const tl = gsap.timeline({
      scrollTrigger: { trigger: card, start: 'top 88%', once: true },
      delay: (i % 4) * 0.05,
    })
    tl.fromTo(
      card,
      { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
      { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.7, ease: 'power3.out' }
    ).fromTo(
      bar,
      { xPercent: -140, opacity: 0.9 },
      { xPercent: 340, opacity: 0, duration: 0.7, ease: 'power2.out', onComplete: () => bar.remove() },
      '<'
    )
  })

  return { lenis }
}
