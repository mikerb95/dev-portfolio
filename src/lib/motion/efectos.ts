// Micro-interacciones de la portada. Cada efecto es una función que recibe sus
// elementos, se engancha y devuelve cómo desengancharse; ninguna asume que el
// resto existe. Todas se montan solo con puntero fino y sin movimiento
// reducido: quien las llama decide eso, aquí no se vuelve a comprobar.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(SplitText, ScrollTrigger, ScrambleTextPlugin)

type Desmontar = () => void

/** ¿Hay un ratón o trackpad? En táctil no existe "acercarse" a nada. */
export const punteroFino = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

// ── Botón magnético ────────────────────────────────────────────────────────

/**
 * El botón se inclina hacia el cursor mientras está dentro de su radio de
 * atracción, y su texto (`[data-magnetico-texto]`) se adelanta algo más que la
 * píldora: dos capas que se mueven a distinta velocidad es lo que lo hace leer
 * como un objeto con volumen y no como un transform aplicado a un rectángulo.
 */
export function magnetico(el: HTMLElement, fuerza = 0.32): Desmontar {
  const texto = el.querySelector<HTMLElement>('[data-magnetico-texto]')
  const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' })
  const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' })
  const txTo = texto ? gsap.quickTo(texto, 'x', { duration: 0.6, ease: 'power3.out' }) : null
  const tyTo = texto ? gsap.quickTo(texto, 'y', { duration: 0.6, ease: 'power3.out' }) : null

  // El radio de atracción sobresale del botón: el imán empieza a tirar antes de
  // que el cursor llegue al borde, que es justo lo que el ojo espera de un imán.
  const MARGEN = 28
  let dentro = false

  const alMover = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    // Medir sin el desplazamiento propio: si no, el botón que ya se movió hacia
    // el cursor cree estar más cerca y tira todavía más, y acaba temblando.
    const tx = Number(gsap.getProperty(el, 'x')) || 0
    const ty = Number(gsap.getProperty(el, 'y')) || 0
    const cx = r.left - tx + r.width / 2
    const cy = r.top - ty + r.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const cerca =
      Math.abs(dx) < r.width / 2 + MARGEN && Math.abs(dy) < r.height / 2 + MARGEN
    if (cerca) {
      dentro = true
      xTo(dx * fuerza)
      yTo(dy * fuerza)
      txTo?.(dx * fuerza * 0.45)
      tyTo?.(dy * fuerza * 0.45)
    } else if (dentro) {
      dentro = false
      xTo(0)
      yTo(0)
      txTo?.(0)
      tyTo?.(0)
    }
  }

  window.addEventListener('pointermove', alMover, { passive: true })
  return () => {
    window.removeEventListener('pointermove', alMover)
    gsap.set([el, texto].filter(Boolean), { clearProps: 'transform' })
  }
}

// ── Peso tipográfico por cercanía ──────────────────────────────────────────

/**
 * Cada letra engorda al acercarse el cursor (Inter Variable, eje `wght`). Las
 * posiciones se miden una vez con el peso base y se reutilizan: medir en cada
 * fotograma, con las letras ya engordadas y el texto recolocado, retroalimenta
 * el efecto y la línea entera tiembla.
 *
 * `levantar` es para las letras que no tienen eje de peso (la serif cursiva):
 * en vez de engordar suben un poco.
 */
export function pesoPorCercania(
  letras: HTMLElement[],
  opciones: { base?: number; maximo?: number; radio?: number; levantar?: HTMLElement[] } = {},
): Desmontar {
  const base = opciones.base ?? 500
  const maximo = opciones.maximo ?? 760
  const radio = opciones.radio ?? 220
  const levantar = new Set(opciones.levantar ?? [])

  type Letra = { el: HTMLElement; x: number; y: number; actual: number; objetivo: number; sube: boolean }
  let medidas: Letra[] = []

  const medir = () => {
    medidas = letras.map((el) => {
      const r = el.getBoundingClientRect()
      return {
        el,
        x: r.left + window.scrollX + r.width / 2,
        y: r.top + window.scrollY + r.height / 2,
        actual: 0,
        objetivo: 0,
        sube: levantar.has(el),
      }
    })
  }

  let raf = 0
  let px = -1e5
  let py = -1e5

  const paso = () => {
    raf = 0
    let activo = false
    for (const m of medidas) {
      const d = Math.hypot(m.x - px, m.y - py)
      const k = d >= radio ? 0 : 1 - d / radio
      // Curva suave (smoothstep) para que el borde del radio no se note.
      m.objetivo = k * k * (3 - 2 * k)
      m.actual += (m.objetivo - m.actual) * 0.18
      if (Math.abs(m.objetivo - m.actual) > 0.002) activo = true
      if (m.sube) {
        m.el.style.transform = `translateY(${(-m.actual * 0.07).toFixed(3)}em)`
      } else {
        m.el.style.fontWeight = String(Math.round(base + (maximo - base) * m.actual))
      }
    }
    if (activo) raf = requestAnimationFrame(paso)
  }

  const alMover = (e: PointerEvent) => {
    px = e.pageX
    py = e.pageY
    if (!raf) raf = requestAnimationFrame(paso)
  }
  const alSalir = () => {
    px = -1e5
    py = -1e5
    if (!raf) raf = requestAnimationFrame(paso)
  }

  medir()
  const ro = new ResizeObserver(() => {
    // Al redimensionar, las letras vuelven a su peso base antes de medir: una
    // medida con letras engordadas desplazaría todos los centros.
    for (const m of medidas) {
      m.el.style.fontWeight = ''
      m.el.style.transform = ''
    }
    medir()
  })
  ro.observe(document.documentElement)
  window.addEventListener('pointermove', alMover, { passive: true })
  document.documentElement.addEventListener('pointerleave', alSalir)

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    window.removeEventListener('pointermove', alMover)
    document.documentElement.removeEventListener('pointerleave', alSalir)
    for (const m of medidas) {
      m.el.style.fontWeight = ''
      m.el.style.transform = ''
    }
  }
}

// ── Luz que sigue al cursor ────────────────────────────────────────────────

/**
 * Un único listener en el contenedor reparte la posición del cursor a todas
 * sus tarjetas (`--fx`, `--fy` en píxeles locales de cada una). Así el halo
 * cruza de una tarjeta a la vecina en vez de encenderse solo en la apuntada:
 * los bordes cercanos también se iluminan, como si fuera una linterna sobre la
 * rejilla y no un hover por tarjeta.
 */
export function foco(contenedor: HTMLElement, selector = '.foco'): Desmontar {
  const tarjetas = Array.from(contenedor.querySelectorAll<HTMLElement>(selector))
  let raf = 0
  let ex = 0
  let ey = 0
  const pintar = () => {
    raf = 0
    for (const t of tarjetas) {
      const r = t.getBoundingClientRect()
      t.style.setProperty('--fx', `${(ex - r.left).toFixed(1)}px`)
      t.style.setProperty('--fy', `${(ey - r.top).toFixed(1)}px`)
    }
  }
  const alMover = (e: PointerEvent) => {
    ex = e.clientX
    ey = e.clientY
    if (!raf) raf = requestAnimationFrame(pintar)
  }
  contenedor.addEventListener('pointermove', alMover, { passive: true })
  contenedor.classList.add('foco-activo')
  return () => {
    cancelAnimationFrame(raf)
    contenedor.removeEventListener('pointermove', alMover)
    contenedor.classList.remove('foco-activo')
  }
}

/**
 * Inclinación 3D sutil de una tarjeta hacia el cursor. Tope de pocos grados:
 * más que eso y el texto de la tarjeta se deforma lo bastante como para
 * costar leerlo, que es justo lo que no puede pasar en una tarjeta con datos.
 */
export function inclinar(el: HTMLElement, maxGrados = 3.5): Desmontar {
  gsap.set(el, { transformPerspective: 900 })
  const rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3.out' })
  const ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3.out' })
  const alMover = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    ry(nx * maxGrados * 2)
    rx(-ny * maxGrados * 2)
  }
  const alSalir = () => {
    rx(0)
    ry(0)
  }
  el.addEventListener('pointermove', alMover, { passive: true })
  el.addEventListener('pointerleave', alSalir)
  return () => {
    el.removeEventListener('pointermove', alMover)
    el.removeEventListener('pointerleave', alSalir)
    gsap.set(el, { clearProps: 'transform' })
  }
}

// ── Odómetro ───────────────────────────────────────────────────────────────

/**
 * Convierte "20+" en columnas de dígitos que ruedan hasta su valor al entrar
 * en pantalla, cada una con su propio retraso y un rebote corto al asentarse.
 * El texto original se conserva para lectores de pantalla (`aria-label`) y las
 * columnas quedan fuera del árbol de accesibilidad.
 */
export function odometro(el: HTMLElement): Desmontar {
  const valor = el.textContent?.trim() ?? ''
  if (!/\d/.test(valor)) return () => {}
  el.setAttribute('aria-label', valor)
  el.textContent = ''
  const tiras: { tira: HTMLElement; digito: number }[] = []
  for (const ch of valor) {
    if (/\d/.test(ch)) {
      const col = document.createElement('span')
      col.className = 'odo-col'
      col.setAttribute('aria-hidden', 'true')
      const tira = document.createElement('span')
      tira.className = 'odo-tira'
      // Dos vueltas de 0-9: la columna recorre más de una decena antes de
      // asentarse, que es lo que se lee como "rodar" y no como "cambiar".
      tira.textContent = '01234567890123456789'
      col.appendChild(tira)
      el.appendChild(col)
      tiras.push({ tira, digito: Number(ch) })
    } else {
      const s = document.createElement('span')
      s.setAttribute('aria-hidden', 'true')
      s.textContent = ch
      el.appendChild(s)
    }
  }
  const st = ScrollTrigger.create({
    trigger: el,
    start: 'top 90%',
    onEnter: () => {
      tiras.forEach(({ tira, digito }, i) => {
        gsap.fromTo(
          tira,
          { yPercent: 0 },
          {
            yPercent: -((10 + digito) / 20) * 100,
            duration: 1.6 + i * 0.25,
            ease: 'expo.out',
            delay: 0.1 + i * 0.08,
          },
        )
      })
    },
  })
  return () => {
    st.kill()
    el.textContent = valor
    el.removeAttribute('aria-label')
  }
}

// ── Titulares y etiquetas de sección ───────────────────────────────────────

/**
 * Titular que sube línea a línea desde una máscara. La clase de degradado se
 * reasigna a cada línea: `background-clip: text` no llega a los hijos
 * transformados que crea SplitText (el texto quedaría transparente), y de
 * paso cada línea recibe su propio degradado vertical, que en titulares de
 * varias líneas se ve más limpio que uno solo estirado sobre todo el bloque.
 */
export function revelarTitular(h: HTMLElement): Desmontar {
  const clase = ['text-mask', 'text-mask-cyan'].find((c) => h.classList.contains(c))
  const split = new SplitText(h, { type: 'lines', mask: 'lines', linesClass: 'titular-linea' })
  if (clase) split.lines.forEach((l) => l.classList.add(clase))
  const tl = gsap.from(split.lines, {
    yPercent: 110,
    duration: 1.1,
    ease: 'expo.out',
    stagger: 0.09,
    scrollTrigger: { trigger: h, start: 'top 85%' },
  })
  return () => {
    tl.scrollTrigger?.kill()
    tl.kill()
    split.revert()
  }
}

/**
 * Etiqueta "/02 ─── Trabajo seleccionado": el número se descifra, la raya se
 * dibuja de izquierda a derecha y el rótulo entra después. Es el mismo gesto
 * de "boot" del titular del hero, a escala de etiqueta.
 */
export function revelarEtiqueta(el: HTMLElement): Desmontar {
  const [num, raya, rotulo] = Array.from(el.children) as HTMLElement[]
  if (!num || !raya || !rotulo) return () => {}
  const texto = num.textContent ?? ''
  const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 88%' } })
  tl.to(num, { duration: 0.8, scrambleText: { text: texto, chars: '0123456789', speed: 0.6 } }, 0)
    .from(raya, { scaleX: 0, transformOrigin: 'left center', duration: 0.9, ease: 'expo.out' }, 0.1)
    .from(rotulo, { opacity: 0, x: -10, duration: 0.7, ease: 'power3.out' }, 0.35)
  return () => {
    tl.scrollTrigger?.kill()
    tl.kill()
  }
}
