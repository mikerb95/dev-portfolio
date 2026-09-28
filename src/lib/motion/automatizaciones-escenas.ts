// Bucles de las seis escenas de automatismos de /automatizaciones.
//
// Una timeline por escena, en pausa, con `repeat: -1`; un solo
// IntersectionObserver las reproduce en pantalla y las detiene fuera, y la
// pestaña oculta las detiene todas. Cada timeline empieza fijando su estado
// inicial con `set`, así que cada vuelta arranca limpia sin depender de cómo
// terminó la anterior. El servidor ya dejó cada escena en su fotograma más
// explicativo: si esto no se monta, eso es lo que se ve.
//
// Módulo solo de navegador.

import gsap from 'gsap'

type Constructor = (el: HTMLElement) => gsap.core.Timeline

const $ = <T extends Element = HTMLElement>(el: Element, sel: string) => el.querySelector<T & HTMLElement>(sel)!
const $$ = (el: Element, sel: string) => Array.from(el.querySelectorAll<HTMLElement>(sel))
const nueva = () => gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.4 })

const LIMA = '#c9ff5b'
const EMBER = '#ff6b3d'
const VIOLETA = '#a78bff'
const GRIS = '#85858f'

/** Un sondeo tras otro; el primero fallido abre, el primero sano después cierra. */
const incidentes: Constructor = (el) => {
  const puntos = $$(el, '.esc-sondeos i')
  const cabeza = $(el, '.esc-cabeza')
  const tramo = $(el, '.esc-tramo')
  const abierto = $(el, '[data-abierto]')
  const cerrado = $(el, '[data-cerrado]')
  const primerFallo = puntos.findIndex((p) => p.dataset.s === 'fallo')
  const cierre = puntos.findIndex((p, i) => i > primerFallo && p.dataset.s === 'ok')
  const pct = (i: number) => `${((i + 0.5) / puntos.length) * 100}%`

  const tl = nueva()
  tl.set(puntos, { opacity: 0.1, scale: 0.6 })
    .set([abierto, cerrado], { opacity: 0, y: 6 })
    .set(tramo, { scaleX: 0 })
    .set(cabeza, { left: pct(0), opacity: 0 })
    .to(cabeza, { opacity: 1, duration: 0.25 })
  puntos.forEach((p, i) => {
    tl.to(cabeza, { left: pct(i), duration: 0.32, ease: 'none' })
    tl.to(p, { opacity: p.dataset.s === 'fallo' ? 1 : 0.85, scale: 1, duration: 0.25, ease: 'back.out(3)' }, '>-0.05')
    if (i === primerFallo) tl.to(abierto, { opacity: 1, y: 0, duration: 0.3 }, '<')
    if (i > primerFallo && i < cierre) tl.to(tramo, { scaleX: (i - primerFallo) / (cierre - primerFallo - 1), duration: 0.3 }, '<')
    if (i === cierre) {
      tl.to(abierto, { opacity: 0, y: -6, duration: 0.25 }, '<')
      tl.to(cerrado, { opacity: 1, y: 0, duration: 0.3 }, '>-0.05')
    }
  })
  tl.to(cabeza, { opacity: 0, duration: 0.3 }).to({}, { duration: 1.8 }).to([...puntos, tramo, cerrado], { opacity: 0, duration: 0.45 })
  return tl
}

/** Tráfico que cruza; una intención inequívoca se queda en la puerta y la infraestructura propia pasa. */
const bloqueo: Constructor = (el) => {
  const puerta = $(el, '.esc-puerta')
  const normales = $$(el, '[data-p]')
  const mala = $(el, '[data-mala]')
  const propia = $(el, '[data-propia]')
  const chipBloq = $(el, '[data-bloqueado]')
  const chipSalva = $(el, '[data-salvaguarda]')
  const rotMala = $(el, '.esc-rot-mala')
  const rotPropia = $(el, '.esc-rot-propia')
  const ancho = () => el.clientWidth
  const enPuerta = () => ancho() * 0.62 - 26
  const cruzar = (p: HTMLElement, en: number) =>
    tl.fromTo(p, { x: -30, opacity: 1 }, { x: () => ancho() + 10, duration: 2.4, ease: 'none' }, en)

  const tl = nueva()
  tl.set([...normales, mala, propia], { left: 0, x: -30, opacity: 0, scale: 1 })
    .set([chipBloq, chipSalva, rotPropia], { opacity: 0, y: 5 })
    .set(rotMala, { opacity: 0 })
    .set(puerta, { backgroundColor: GRIS, boxShadow: '0 0 0 rgba(0,0,0,0)' })
  cruzar(normales[0], 0)
  cruzar(normales[1], 0.7)
  // La maliciosa llega a la puerta y se queda.
  tl.fromTo(mala, { x: -30, opacity: 1 }, { x: enPuerta, duration: 1.5, ease: 'none' }, 1.1)
    .to(rotMala, { opacity: 0.9, duration: 0.3 }, 1.1)
    .to(puerta, { backgroundColor: EMBER, boxShadow: '0 0 14px rgba(255,107,61,.7)', duration: 0.15 }, 2.6)
    .to(chipBloq, { opacity: 1, y: 0, duration: 0.3 }, 2.6)
    .to(mala, { opacity: 0, scale: 0.4, duration: 0.6, ease: 'power2.in' }, 3.4)
    .to(puerta, { backgroundColor: GRIS, boxShadow: '0 0 0 rgba(0,0,0,0)', duration: 0.4 }, 3.6)
  cruzar(normales[2], 2.2)
  // La propia cruza pese a todo: la salvaguarda la deja pasar.
  tl.to([chipBloq, rotMala], { opacity: 0, duration: 0.3 }, 4.2)
    .to(rotPropia, { opacity: 0.9, y: 0, duration: 0.3 }, 4.2)
    .fromTo(propia, { x: -30, opacity: 1 }, { x: () => ancho() + 10, duration: 2.6, ease: 'none' }, 4.2)
    .to(puerta, { backgroundColor: VIOLETA, boxShadow: '0 0 14px rgba(167,139,255,.6)', duration: 0.15 }, 5.6)
    .to(chipSalva, { opacity: 1, y: 0, duration: 0.3 }, 5.6)
    .to(puerta, { backgroundColor: GRIS, boxShadow: '0 0 0 rgba(0,0,0,0)', duration: 0.5 }, 6.3)
  cruzar(normales[3], 5.2)
  tl.to({}, { duration: 1 }).to([chipSalva, rotPropia], { opacity: 0, duration: 0.4 })
  return tl
}

/** Las horas se apilan dentro de la banda; la que cierra se sale y se señala. */
const anomalias: Constructor = (el) => {
  const barras = $$(el, '.esc-barras i')
  const ultima = barras[barras.length - 1]
  const chip = $(el, '[data-fuera-chip]')
  const tl = nueva()
  tl.set(barras, { scaleY: 0 })
    .set(ultima, { backgroundColor: 'rgba(196,196,204,0.35)', boxShadow: '0 0 0 rgba(0,0,0,0)' })
    .set(chip, { opacity: 0, y: 5 })
    .to(barras.slice(0, -1), { scaleY: 1, duration: 0.45, ease: 'back.out(1.6)', stagger: 0.12 })
    // La última crece como las demás hasta la banda, duda, y se sale.
    .to(ultima, { scaleY: 0.6, duration: 0.45, ease: 'power2.out' })
    .to(ultima, { scaleY: 1, duration: 0.7, ease: 'power3.out' }, '+=0.35')
    .to(ultima, { backgroundColor: EMBER, boxShadow: '0 0 12px rgba(255,107,61,.45)', duration: 0.25 }, '<0.25')
    .to(chip, { opacity: 1, y: 0, duration: 0.3 }, '<')
    .to({}, { duration: 2 })
    .to([...barras, chip], { opacity: 0, duration: 0.4 })
    .set(barras, { opacity: 1 })
  return tl
}

/** El portal consulta; la base calla, entra el snapshot; la base vuelve y el snapshot se retira. */
const respaldo: Constructor = (el) => {
  const base = $(el, '[data-base]')
  const puntos = $$(el, '.esc-enlace i')
  const snapshot = $(el, '[data-snapshot]')
  const caida = $(el, '[data-caida]')
  const vuelta = $(el, '[data-vuelta]')
  const tl = nueva()
  const flujo = (en: number | string, vueltas: number) => {
    for (let v = 0; v < vueltas; v++) {
      puntos.forEach((p, i) => {
        tl.fromTo(p, { left: '0%', opacity: 0 }, { left: '100%', opacity: 1, duration: 0.9, ease: 'none', immediateRender: false }, typeof en === 'number' ? en + v * 0.9 + i * 0.3 : en)
        tl.to(p, { opacity: 0, duration: 0.1 }, '>')
      })
    }
  }
  tl.call(() => base.removeAttribute('data-caido'))
    .set([snapshot, caida, vuelta], { opacity: 0, y: 5 })
    .set(puntos, { opacity: 0 })
  flujo(0.1, 2)
  tl.call(() => base.setAttribute('data-caido', ''), [], 2.4)
    .fromTo(base, { x: 0 }, { x: 3, duration: 0.06, repeat: 5, yoyo: true }, 2.4)
    .to(caida, { opacity: 1, y: 0, duration: 0.3 }, 2.5)
    .to(snapshot, { opacity: 1, y: 0, duration: 0.35 }, 2.9)
    .call(() => base.removeAttribute('data-caido'), [], 5.4)
    .to(caida, { opacity: 0, duration: 0.25 }, 5.4)
    .to(vuelta, { opacity: 1, y: 0, duration: 0.3 }, 5.5)
    .to(snapshot, { opacity: 0, y: -5, duration: 0.35 }, 5.9)
  flujo(5.9, 1)
  tl.to(vuelta, { opacity: 0, duration: 0.3 }, '+=0.8')
  return tl
}

/** Sale v42; dos de tres chequeos salen insanos; el pipeline vuelve a v41 y avisa. */
const reversion: Constructor = (el) => {
  const v41 = $(el, '[data-v="41"]')
  const v42 = $(el, '[data-v="42"]')
  const checks = $$(el, '.esc-checks i')
  const rot = $(el, '.esc-rot-checks')
  // Se destapa con clip-path de derecha a izquierda (de v42 a v41): el trazo
  // punteado con `pathLength` no se lleva bien con `vector-effect`.
  const curva = el.querySelector<SVGSVGElement>('.esc-vuelta')!
  const insanos = $(el, '[data-insanos]')
  const revertido = $(el, '[data-revertido]')
  const tl = nueva()
  tl.set(v41, { color: LIMA, borderColor: 'rgba(201,255,91,.45)' })
    .set(v42, { opacity: 0, x: 16, color: GRIS, borderColor: 'rgba(255,255,255,.14)' })
    .set(checks, { opacity: 0, scale: 0.4 })
    .set(rot, { opacity: 0 })
    .set(curva, { clipPath: 'inset(-20% 0% -20% 100%)', opacity: 1 })
    .set([insanos, revertido], { opacity: 0, y: 5 })
    .to(v42, { opacity: 1, x: 0, duration: 0.5, ease: 'expo.out' }, 0.3)
    .to(v41, { color: GRIS, borderColor: 'rgba(255,255,255,.14)', duration: 0.4 }, 0.6)
    .to(v42, { color: '#e7e7ec', borderColor: 'rgba(0,242,255,.4)', duration: 0.3 }, 0.6)
    .to(rot, { opacity: 1, duration: 0.3 }, 1)
  checks.forEach((c, i) => tl.to(c, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(3)' }, 1.3 + i * 0.55))
  tl.to(insanos, { opacity: 1, y: 0, duration: 0.3 }, 2.5)
    .to(v42, { color: EMBER, borderColor: 'rgba(255,107,61,.6)', duration: 0.3 }, 2.5)
    .to(curva, { clipPath: 'inset(-20% 0% -20% 0%)', duration: 0.9, ease: 'power2.inOut' }, 3)
    .to(v41, { color: LIMA, borderColor: 'rgba(201,255,91,.45)', duration: 0.3 }, 3.8)
    .to(v42, { opacity: 0.25, duration: 0.4 }, 3.9)
    .to(insanos, { opacity: 0, duration: 0.25 }, 3.9)
    .to(revertido, { opacity: 1, y: 0, duration: 0.3 }, 4.1)
    .to({}, { duration: 1.8 })
    .to([...checks, rot, revertido, curva], { opacity: 0, duration: 0.4 })
  return tl
}

/** Cada día se resume; lo crudo más viejo se purga y su resumen se queda. */
const purga: Constructor = (el) => {
  const dias = $$(el, '.esc-dia')
  const resumen = $$(el, '.esc-resumen i')
  const rot = $(el, '.esc-rot-purgado')
  const viejos = 3
  const tl = nueva()
  tl.set(dias.map((d) => d.children), { opacity: 0 })
    .set(resumen, { opacity: 0.08, scaleY: 0.5 })
    .set(rot, { opacity: 0 })
  dias.forEach((d, i) => {
    tl.to(d.children, { opacity: 1, duration: 0.2, stagger: 0.03 }, 0.2 + i * 0.28)
    tl.to(resumen[i], { opacity: 1, scaleY: 1, duration: 0.3, ease: 'back.out(2)' }, 0.45 + i * 0.28)
  })
  tl.to(
    dias.slice(0, viejos).map((d) => d.children),
    { opacity: 0.08, duration: 0.5, stagger: 0.15 },
    '+=0.5'
  )
    .to(rot, { opacity: 1, duration: 0.3 }, '<')
    .to({}, { duration: 1.8 })
    .to([...dias.map((d) => d.children), ...resumen, rot], { opacity: 0, duration: 0.4 })
  return tl
}

const ESCENAS: Record<string, Constructor> = { incidentes, bloqueo, anomalias, respaldo, reversion, purga }

export function montarEscenas(): void {
  const vivas = new Map<Element, gsap.core.Timeline>()
  document.querySelectorAll<HTMLElement>('[data-escena]').forEach((el) => {
    const crear = ESCENAS[el.dataset.escena ?? '']
    if (!crear) return
    try {
      vivas.set(el, crear(el))
    } catch (err) {
      console.warn('[automatizaciones] escena sin motion', el.dataset.escena, err)
    }
  })
  const visibles = new Set<Element>()
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        const tl = vivas.get(e.target)
        if (!tl) continue
        if (e.isIntersecting) {
          visibles.add(e.target)
          if (!document.hidden) tl.play()
        } else {
          visibles.delete(e.target)
          tl.pause()
        }
      }
    },
    { threshold: 0.35 }
  )
  vivas.forEach((_, el) => io.observe(el))
  document.addEventListener('visibilitychange', () => {
    vivas.forEach((tl, el) => (document.hidden || !visibles.has(el) ? tl.pause() : tl.play()))
  })
}
