// Pantallas animadas de las tres tarjetas de "Expertise técnico". Cada una
// ilustra lo que dice su tarjeta en vez de decorarla:
//   · Grafo: tráfico real de un sistema (edge → api → auth/db/cola). Al apuntar
//     la tarjeta, la api escala a tres réplicas y el tráfico se reparte.
//   · Cascada: la carga de una página como en la pestaña de red, con el
//     marcador de LCP cayendo bien por debajo del umbral de 2,5 s. Al apuntar,
//     la segunda visita, con caché, termina en la mitad de tiempo.
//   · Terminal: la suite de tests corriendo, con nombres de archivos que
//     existen de verdad en tests/.
//
// Cada una expone `activar(si)` (la tarjeta está a la vista o no: fuera de
// pantalla no se gasta ni un fotograma) e `intensificar(si)` (el hover). Con
// `estatico`, pintan su último fotograma y no se mueven.
//
// Módulo solo de navegador.

import gsap from 'gsap'

export type Pantalla = {
  activar: (si: boolean) => void
  intensificar: (si: boolean) => void
}

const SVG = 'http://www.w3.org/2000/svg'
const crear = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

// ── Grafo de servicios ─────────────────────────────────────────────────────

type Nodo = { id: string; x: number; y: number; o: number; el: SVGGElement | null }

const COLOR_DESTINO: Record<string, string> = { auth: '#a78bff', db: '#00f2ff', cola: '#c9ff5b' }

export function montarGrafo(svg: SVGSVGElement, estatico: boolean): Pantalla {
  const capaAristas = svg.querySelector<SVGGElement>('.g-aristas')!
  const capaPaquetes = svg.querySelector<SVGGElement>('.g-paquetes')!
  const etiquetaReplicas = svg.querySelector<SVGTextElement>('.g-replicas')

  const nodos = new Map<string, Nodo>()
  svg.querySelectorAll<SVGGElement>('.g-nodo').forEach((el) => {
    const id = el.dataset.id!
    nodos.set(id, { id, x: Number(el.dataset.x), y: Number(el.dataset.y), o: Number(el.dataset.o ?? 1), el })
  })
  const n = (id: string) => nodos.get(id)!
  const replicas = ['api', 'api1', 'api2']
  const destinos = ['auth', 'db', 'cola']

  // Aristas: de edge a cada réplica y de cada réplica a cada destino. Las de
  // las réplicas 1 y 2 heredan la opacidad de su réplica, así aparecen con ella.
  const aristas: { a: string; b: string; el: SVGLineElement }[] = []
  for (const r of replicas) {
    aristas.push({ a: 'edge', b: r, el: capaAristas.appendChild(crear('line', { class: 'g-arista' })) })
    for (const d of destinos) {
      aristas.push({ a: r, b: d, el: capaAristas.appendChild(crear('line', { class: 'g-arista' })) })
    }
  }

  const pintarNodos = () => {
    for (const nd of nodos.values()) {
      nd.el?.setAttribute('transform', `translate(${nd.x.toFixed(2)} ${nd.y.toFixed(2)})`)
      if (nd.el) nd.el.style.opacity = String(nd.o)
    }
    for (const ar of aristas) {
      const A = n(ar.a)
      const B = n(ar.b)
      ar.el.setAttribute('x1', (A.x + 30).toFixed(2))
      ar.el.setAttribute('y1', A.y.toFixed(2))
      ar.el.setAttribute('x2', (B.x - 30).toFixed(2))
      ar.el.setAttribute('y2', B.y.toFixed(2))
      ar.el.style.opacity = String(Math.min(A.o, B.o))
    }
  }

  type Paquete = { el: SVGCircleElement; ruta: string[]; tramo: number; t: number; vel: number }
  const paquetes: Paquete[] = []
  let escalado = false
  let porSegundo = 2.4
  let acumulado = 0

  const lanzar = () => {
    const activas = escalado ? replicas : ['api']
    const r = activas[Math.floor(Math.random() * activas.length)]
    const u = Math.random()
    const d = u < 0.2 ? 'auth' : u < 0.75 ? 'db' : 'cola'
    const el = capaPaquetes.appendChild(crear('circle', { r: 2.4, fill: COLOR_DESTINO[d], class: 'g-paquete' }))
    paquetes.push({ el, ruta: ['edge', r, d], tramo: 0, t: 0, vel: 1.1 + Math.random() * 0.5 })
  }

  const destello = (id: string) => {
    const el = n(id).el
    if (!el) return
    el.classList.add('g-activo')
    window.setTimeout(() => el.classList.remove('g-activo'), 220)
  }

  let raf = 0
  let anterior = 0
  const paso = (ahora: number) => {
    const dt = Math.min(0.05, (ahora - anterior) / 1000)
    anterior = ahora
    acumulado += dt * porSegundo
    while (acumulado >= 1) {
      acumulado -= 1
      lanzar()
    }
    for (let i = paquetes.length - 1; i >= 0; i--) {
      const p = paquetes[i]
      p.t += dt * p.vel
      if (p.t >= 1) {
        destello(p.ruta[p.tramo + 1])
        p.tramo++
        p.t = 0
        if (p.tramo >= p.ruta.length - 1) {
          p.el.remove()
          paquetes.splice(i, 1)
          continue
        }
      }
      const A = n(p.ruta[p.tramo])
      const B = n(p.ruta[p.tramo + 1])
      const ax = A.x + 30
      const bx = B.x - 30
      // Aceleración suave dentro de cada tramo: sale despacio del nodo, cruza
      // rápido y frena al llegar, como un paquete que se encola y se atiende.
      const e = p.t * p.t * (3 - 2 * p.t)
      p.el.setAttribute('cx', (ax + (bx - ax) * e).toFixed(2))
      p.el.setAttribute('cy', (A.y + (B.y - A.y) * e).toFixed(2))
    }
    pintarNodos()
    raf = requestAnimationFrame(paso)
  }

  pintarNodos()

  const escalar = (si: boolean) => {
    escalado = si
    porSegundo = si ? 7 : 2.4
    const base = n('api')
    gsap.to(n('api1'), { y: si ? base.y - 46 : base.y, o: si ? 1 : 0, duration: 0.9, ease: 'expo.out', onUpdate: estatico ? pintarNodos : undefined })
    gsap.to(n('api2'), { y: si ? base.y + 46 : base.y, o: si ? 1 : 0, duration: 0.9, ease: 'expo.out', onUpdate: estatico ? pintarNodos : undefined })
    if (etiquetaReplicas) gsap.to(etiquetaReplicas, { opacity: si ? 1 : 0, duration: 0.4 })
  }

  return {
    activar(si) {
      if (estatico) return
      if (si && !raf) {
        anterior = performance.now()
        raf = requestAnimationFrame(paso)
      } else if (!si && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    },
    intensificar: escalar,
  }
}

// ── Cascada de red ─────────────────────────────────────────────────────────

type Recurso = { inicio: number; fin: number }

// Tiempos en segundos de una carga típica de la portada, en el orden en que
// los pinta la pestaña de red. La imagen del hero es el elemento del LCP.
const RECURSOS: Recurso[] = [
  { inicio: 0, fin: 0.34 }, // documento
  { inicio: 0.3, fin: 0.52 }, // css
  { inicio: 0.33, fin: 0.66 }, // fuente
  { inicio: 0.34, fin: 0.9 }, // js
  { inicio: 0.48, fin: 1.04 }, // imagen del LCP
  { inicio: 0.9, fin: 1.28 }, // api
  { inicio: 1.2, fin: 1.4 }, // métricas
]
const INDICE_LCP = 4
const MAX_S = 3
const X0 = 78
const X1 = 344

export function montarCascada(svg: SVGSVGElement, estatico: boolean, locale: string): Pantalla {
  const barras = Array.from(svg.querySelectorAll<SVGRectElement>('.c-barra'))
  const lcp = svg.querySelector<SVGGElement>('.c-lcp')!
  const lcpTexto = svg.querySelector<SVGTextElement>('.c-lcp-texto')!
  const lcpLinea = svg.querySelector<SVGLineElement>('.c-lcp-linea')!
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const x = (s: number) => X0 + (s / MAX_S) * (X1 - X0)

  let tl: gsap.core.Timeline | null = null
  let conCache = false
  let activa = false

  const correr = () => {
    tl?.kill()
    // Segunda visita con caché: todo termina en poco más de la mitad del
    // tiempo. Una variación leve entre corridas evita que el bucle se note.
    const f = (conCache ? 0.52 : 1) * (0.96 + Math.random() * 0.08)
    const lcpS = RECURSOS[INDICE_LCP].fin * f
    lcpTexto.textContent = `LCP ${fmt.format(lcpS)} s`
    gsap.set(lcp, { x: x(lcpS), opacity: 0 })
    tl = gsap.timeline({ onComplete: () => void window.setTimeout(() => activa && correr(), 300) })
    barras.forEach((b, i) => {
      const r = RECURSOS[i]
      gsap.set(b, { attr: { x: x(r.inicio * f), width: 0 }, opacity: 1 })
      // 1 s de la carga dura 1,35 s en pantalla: lo bastante lento para
      // seguirlo con la vista, lo bastante rápido para no aburrir.
      tl!.to(b, { attr: { width: x(r.fin * f) - x(r.inicio * f) }, duration: (r.fin - r.inicio) * f * 1.35, ease: 'power1.out' }, r.inicio * f * 1.35)
    })
    // El marcador cae cuando termina de pintarse la imagen del LCP: la línea
    // crece de abajo arriba sobre la cascada, como un corte en la línea de
    // tiempo de la pestaña de red.
    tl.to(lcp, { opacity: 1, duration: 0.35, ease: 'power2.out' }, RECURSOS[INDICE_LCP].fin * f * 1.35)
      .fromTo(lcpLinea, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 100%', duration: 0.6, ease: 'expo.out' }, '<')
      .to({}, { duration: 2.6 })
      .to(barras, { opacity: 0.15, duration: 0.5, ease: 'power2.in' })
      .to(lcp, { opacity: 0, duration: 0.4 }, '<')
    if (!activa) tl.pause()
  }

  if (estatico) {
    barras.forEach((b, i) => {
      const r = RECURSOS[i]
      b.setAttribute('x', String(x(r.inicio)))
      b.setAttribute('width', String(x(r.fin) - x(r.inicio)))
    })
    lcpTexto.textContent = `LCP ${fmt.format(RECURSOS[INDICE_LCP].fin)} s`
    lcp.setAttribute('transform', `translate(${x(RECURSOS[INDICE_LCP].fin)} 0)`)
    lcp.style.opacity = '1'
  } else {
    correr()
  }

  return {
    activar(si) {
      if (estatico) return
      activa = si
      if (si) tl?.play()
      else tl?.pause()
    },
    intensificar(si) {
      if (estatico || conCache === si) return
      conCache = si
      correr()
    },
  }
}

// ── Terminal de tests ──────────────────────────────────────────────────────

export function montarTerminal(caja: HTMLElement, archivos: string[], resumen: string, estatico: boolean): Pantalla {
  const lineas = caja.querySelector<HTMLElement>('.t-lineas')!
  const MAX_VISIBLES = 8
  let corrida = 0
  let activa = false
  let temporizadores: number[] = []

  const limpiar = () => {
    temporizadores.forEach((t) => window.clearTimeout(t))
    temporizadores = []
  }
  const despues = (ms: number, fn: () => void) => temporizadores.push(window.setTimeout(fn, ms))

  const agregar = (html: string, clase = '') => {
    const div = document.createElement('div')
    div.className = `t-linea ${clase}`
    div.innerHTML = html
    lineas.appendChild(div)
    // Desplazamiento de consola: al pasar del alto visible, todo sube una
    // línea en vez de cortar la última.
    const sobra = lineas.children.length - MAX_VISIBLES
    lineas.style.transform = sobra > 0 ? `translateY(${-sobra * 1.6}em)` : ''
    return div
  }

  const escapar = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

  const correr = () => {
    limpiar()
    const id = ++corrida
    lineas.innerHTML = ''
    lineas.style.transform = ''
    const orden = [...archivos].sort(() => Math.random() - 0.5).slice(0, 9)
    const prompt = agregar('<span class="t-dim">$</span> <span class="t-cmd"></span><span class="t-cursor"></span>')
    const cmd = prompt.querySelector('.t-cmd')!
    const texto = 'vitest run'
    for (let i = 1; i <= texto.length; i++) despues(i * 45, () => (cmd.textContent = texto.slice(0, i)))
    let t = texto.length * 45 + 260
    despues(t, () => prompt.querySelector('.t-cursor')?.remove())
    for (const archivo of orden) {
      t += 150 + Math.random() * 160
      despues(t, () => {
        if (id !== corrida) return
        const l = agregar(`<span class="t-estado">·</span> <span class="t-dim">tests/</span>${escapar(archivo)}<span class="t-dim">.test.ts</span>`, 't-pendiente')
        despues(120 + Math.random() * 220, () => {
          l.classList.remove('t-pendiente')
          l.querySelector('.t-estado')!.textContent = '✓'
        })
      })
    }
    t += 520
    despues(t, () => agregar(`<span class="t-ok">✓</span> ${escapar(resumen)}`, 't-resumen'))
    despues(t + 3800, () => activa && correr())
  }

  const final = () => {
    lineas.innerHTML = ''
    agregar('<span class="t-dim">$</span> vitest run')
    for (const a of archivos.slice(0, 6)) agregar(`<span class="t-estado">✓</span> <span class="t-dim">tests/</span>${escapar(a)}<span class="t-dim">.test.ts</span>`)
    agregar(`<span class="t-ok">✓</span> ${escapar(resumen)}`, 't-resumen')
  }

  if (estatico) final()

  return {
    activar(si) {
      if (estatico || activa === si) return
      activa = si
      if (si) correr()
      else limpiar()
    },
    intensificar(si) {
      if (estatico || !si) return
      correr()
    },
  }
}
