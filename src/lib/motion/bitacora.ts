// Motor de la bitácora de /notes (BitacoraNotas.astro): miniaturas de los
// mapas, riel que se enciende con el scroll, entrada de las notas y filtros
// por familia que reacomodan la lista con Flip.
//
// Las miniaturas se pintan también con movimiento reducido (son imágenes
// quietas); el riel y las entradas no. Los filtros funcionan siempre: sin
// movimiento, solo cambian qué se ve.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Flip } from 'gsap/Flip'
import { montarPortadas, type Portada } from './portadas-gl'

gsap.registerPlugin(ScrollTrigger, Flip)

type Textos = { mostrando: string; notaMes: string; notasMes: string }

export function montarBitacora(raiz: HTMLElement) {
  const mapas: Portada[] = JSON.parse(raiz.dataset.mapas ?? '[]')
  const total = Number(raiz.dataset.total ?? mapas.length)
  const textos: Textos = JSON.parse(raiz.dataset.t ?? '{}')
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const cuerpo = raiz.querySelector<HTMLElement>('.bit-cuerpo')!
  const luz = raiz.querySelector<HTMLElement>('.bit-riel-luz')!
  const entradas = Array.from(raiz.querySelectorAll<HTMLElement>('.bit-entrada'))
  const meses = Array.from(raiz.querySelectorAll<HTMLElement>('.bit-mes'))

  pintarMiniaturas(raiz, mapas)
  montarFiltros(raiz, entradas, meses, total, textos, reducido)

  if (reducido) return
  raiz.classList.add('vivo')

  try {
    // El riel se llena al ritmo del scroll, y cada nodo se enciende cuando la
    // luz lo alcanza: la línea de tiempo se "recorre", no solo se muestra.
    gsap.to(luz, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: cuerpo, start: 'top 60%', end: 'bottom 60%', scrub: 0.4 },
    })
    for (const e of entradas) {
      ScrollTrigger.create({
        trigger: e.querySelector('.bit-nodo'),
        start: 'top 60%',
        onEnter: () => e.classList.add('encendida'),
        onLeaveBack: () => e.classList.remove('encendida'),
      })
    }

    // Entrada: el mapa se destapa de izquierda a derecha y el título sube de
    // su ranura. Estado de partida fijado antes del trigger (un `from` en
    // onEnter pintaría un fotograma en el sitio final).
    const partes = (e: HTMLElement) => ({
      mapa: e.querySelector('.bit-mapa'),
      titulo: e.querySelector('.bit-titulo-txt'),
      resto: e.querySelectorAll('.bit-desc, .bit-meta, .bit-dia'),
    })
    for (const e of entradas) {
      const p = partes(e)
      gsap.set(p.mapa, { clipPath: 'inset(0% 100% 0% 0% round 12px)' })
      gsap.set(p.titulo, { yPercent: 105 })
      gsap.set(p.resto, { opacity: 0, y: 8 })
    }
    ScrollTrigger.batch(entradas, {
      start: 'top 90%',
      onEnter: (lote) => {
        const els = (lote as HTMLElement[]).map(partes)
        gsap.to(els.map((p) => p.mapa), { clipPath: 'inset(0% 0% 0% 0% round 12px)', duration: 1, ease: 'expo.out', stagger: 0.08 })
        gsap.to(els.map((p) => p.titulo), { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.08 })
        gsap.to(els.flatMap((p) => Array.from(p.resto)), { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.02, delay: 0.18 })
      },
    })
  } catch (err) {
    // Fail-open: la lista es el contenido.
    console.warn('[bitacora] animación deshabilitada', err)
    raiz.classList.remove('vivo')
    gsap.set(raiz.querySelectorAll('.bit-mapa, .bit-titulo-txt, .bit-desc, .bit-meta, .bit-dia'), { clearProps: 'all' })
  }
}

/**
 * Un solo contexto WebGL para las diecinueve miniaturas: pinta cada una en su
 * canvas 2D y se suelta (los navegadores empiezan a tirar contextos pasada la
 * decena). Se hace al acercarse la lista, no al cargar la página.
 */
function pintarMiniaturas(raiz: HTMLElement, mapas: Portada[]) {
  const lienzos = Array.from(raiz.querySelectorAll<HTMLCanvasElement>('.bit-lienzo'))
  if (!lienzos.length) return
  const io = new IntersectionObserver(
    (obs) => {
      if (!obs.some((o) => o.isIntersecting)) return
      io.disconnect()
      const auxiliar = document.createElement('canvas')
      const portadas = montarPortadas(auxiliar)
      if (!portadas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      for (const c of lienzos) {
        const m = mapas[Number(c.dataset.i)]
        if (!m) continue
        // Medidas de maquetación (offsetWidth), ajenas al clip-path de la entrada.
        c.width = Math.round((c.offsetWidth || 352) * dpr)
        c.height = Math.round((c.offsetHeight || 220) * dpr)
        portadas.pintarEn(m, c)
      }
      portadas.destruir()
    },
    { rootMargin: '400px' },
  )
  io.observe(raiz)
}

function montarFiltros(
  raiz: HTMLElement,
  entradas: HTMLElement[],
  meses: HTMLElement[],
  total: number,
  textos: Textos,
  reducido: boolean,
) {
  const caja = raiz.querySelector<HTMLElement>('.bit-filtros-caja')
  const botones = Array.from(raiz.querySelectorAll<HTMLButtonElement>('.bit-filtro'))
  const contador = raiz.querySelector<HTMLElement>('.bit-contador')
  if (!caja || !botones.length || !contador) return
  caja.hidden = false

  const aplicar = (familia: string, animar: boolean) => {
    botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.familia === familia)))

    const estado = animar ? Flip.getState([...entradas, ...meses]) : null
    const cuerpo = raiz.querySelector<HTMLElement>('.bit-cuerpo')!
    const alto0 = cuerpo.offsetHeight
    let visibles = 0
    for (const e of entradas) {
      const entra = !familia || (e.dataset.familias ?? '').split(' ').includes(familia)
      e.classList.toggle('fuera', !entra)
      if (entra) visibles++
    }
    for (const m of meses) {
      const n = m.querySelectorAll('.bit-entrada:not(.fuera)').length
      m.classList.toggle('vacio', n === 0)
      const rot = m.querySelector('.bit-mes-n')
      if (rot) rot.textContent = n === 1 ? textos.notaMes : textos.notasMes.replace('{n}', String(n))
    }
    contador.textContent = textos.mostrando.replace('{n}', String(visibles)).replace('{total}', String(total))

    // El tema elegido queda en la URL: un enlace a "las notas de seguridad"
    // se puede compartir. replaceState para no llenar el historial.
    try {
      const url = new URL(location.href)
      familia ? url.searchParams.set('tema', familia) : url.searchParams.delete('tema')
      history.replaceState(history.state, '', url)
    } catch {
      /* sin historial disponible, el filtro funciona igual */
    }

    if (!estado) {
      ScrollTrigger.refresh()
      return
    }
    try {
      // Con `absolute`, las notas que salen dejan de ocupar sitio al instante
      // y la página se encogía de golpe: el pie subía a media pantalla
      // mientras la lista aún se reacomodaba. La caja pasa de su alto viejo
      // al nuevo al mismo ritmo que las notas.
      gsap.fromTo(cuerpo, { height: alto0 }, { height: cuerpo.offsetHeight, duration: 0.6, ease: 'expo.out', clearProps: 'height' })
      Flip.from(estado, {
        duration: 0.6,
        ease: 'expo.out',
        stagger: 0.012,
        absolute: true,
        nested: true,
        prune: true,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.03 }),
        onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.25, ease: 'power2.in' }),
        onComplete: () => ScrollTrigger.refresh(),
      })
    } catch (err) {
      console.warn('[bitacora] reacomodo sin animar', err)
      ScrollTrigger.refresh()
    }
  }

  raiz.querySelector('.bit-filtros')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.bit-filtro')
    if (!b || b.getAttribute('aria-pressed') === 'true') return
    aplicar(b.dataset.familia ?? '', !reducido)
  })

  const inicial = new URL(location.href).searchParams.get('tema') ?? ''
  if (inicial && botones.some((b) => b.dataset.familia === inicial)) aplicar(inicial, false)
}
