// Motion de /ep. La página es una herramienta (cronograma, pago, correos,
// cierre) y cada pieza animada demuestra lo que dice su sección:
//   · la cinta de días: 180 días concretos, con fines de semana y festivos
//     que mueven las entregas, y un cabezal que recorre lo ya transcurrido;
//   · la calculadora rearma ESA cinta con otra fecha de inicio;
//   · el pago se imprime renglón a renglón, como el desprendible;
//   · la bandeja de ejemplo filtra con la búsqueda del instructor;
//   · la carpeta del cierre arma el PDF con lo marcado.
//
// El script de la página sigue siendo dueño de la lógica: avisa con eventos
// `ep:*` y aquí solo se reacciona. Sin JS o con movimiento reducido, todo
// queda en su estado final y legible.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { claveFecha } from '../festivos-co'
import type { Hito } from '../sena-ep'
import { entradaDesdeHitos, htmlCinta, indiceDe, lecturaDia, modeloCinta, type Cinta, type EntradaCinta } from './cinta-ep'
import { coincideBandeja, consultaBandeja } from './ep-datos'
import { odometro } from './efectos'
import { montarLanding } from './landing'

gsap.registerPlugin(ScrollTrigger, SplitText)

let reducido = false
const hoyIso = () => claveFecha(new Date())
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Corre `fn` la primera vez que `el` está en pantalla (ya, si lo está). Las
 * piezas que reciben datos al cargar (el pago, la bandeja con el asunto
 * guardado) se animarían fuera de la vista y nadie lo vería: se aplazan.
 */
function cuandoVisible(el: Element, fn: () => void) {
  const io = new IntersectionObserver(
    (entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        io.disconnect()
        fn()
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  io.observe(el)
}

// ── Cinta ──────────────────────────────────────────────────────────────────

interface OpcionesCinta {
  /** 'scroll': la entrada espera a que la cinta asome; 'ya': arranca al montar. */
  intro: 'scroll' | 'ya'
}

function pintarLectura(el: HTMLElement, c: Cinta, i: number | null, hoy: string) {
  if (i === null) {
    el.innerHTML = '<span class="ct-lectura-t">Apunta un día de la cinta para leerlo</span>'
    return
  }
  const l = lecturaDia(c, i, hoy)
  el.innerHTML =
    `<span class="ct-lectura-t">${esc(l.titulo)}</span>` +
    l.lineas.map((x) => `<span data-tono="${x.tono}">${esc(x.texto)}</span>`).join('')
}

function montarCinta(raiz: HTMLElement, c: Cinta, lecturaEl: HTMLElement, o: OpcionesCinta): () => void {
  const grid = raiz.querySelector<HTMLElement>('.ct-grid')
  if (!grid) return () => {}
  const dias = Array.from(grid.querySelectorAll<HTMLElement>('.ct-d'))
  const barras = dias.map((d) => d.firstElementChild as HTMLElement)
  const bits = Array.from(grid.querySelectorAll<HTMLElement>('.ct-b'))
  const pines = Array.from(grid.querySelectorAll<HTMLElement>('.ct-pin'))
  const hoyEl = grid.querySelector<HTMLElement>('.ct-hoy')!
  const cabeza = grid.querySelector<HTMLElement>('.ct-cabeza')!

  const hoy = hoyIso()
  const iHoy = indiceDe(c, hoy)
  // Hasta dónde llega lo transcurrido: el día de hoy, toda la cinta si la
  // etapa ya terminó, o nada si no ha empezado.
  const tope = iHoy ?? (hoy > c.dias[c.total].iso ? c.total + 1 : 0)

  // Centro de un día en píxeles de la rejilla. offsetLeft y no
  // getBoundingClientRect: la tarjeta puede estar entrando desplazada.
  const xDe = (i: number) => {
    const d = dias[Math.min(dias.length - 1, Math.max(0, Math.round(i)))]
    return d.offsetLeft + d.offsetWidth / 2
  }

  const marcarHasta = (k: number) => {
    for (let i = 0; i < dias.length; i++) dias[i].classList.toggle('pasado', i < k)
  }
  const ponerHoy = () => {
    if (iHoy === null) return
    dias[iHoy].classList.add('hoy')
    grid.classList.add('con-hoy')
    hoyEl.style.left = `${xDe(iHoy)}px`
  }

  // ── Lectura al apuntar / con flechas ──
  let leido: number | null = null
  let bLeida: number | null = null
  const leer = (i: number | null) => {
    if (i === leido) return
    if (leido !== null) dias[leido].classList.remove('lee')
    leido = i
    const d = i === null ? null : c.dias[i]
    const b = d?.bitacora ?? null
    if (b !== bLeida) {
      bLeida = b
      dias.forEach((el, k) => el.classList.toggle('en-b', b !== null && c.dias[k].bitacora === b))
      bits.forEach((el) => el.classList.toggle('lee', el.dataset.b === String(b)))
    }
    pines.forEach((el) => el.classList.toggle('lee', d?.visita != null && el.dataset.v === String(d.visita)))
    grid.classList.toggle('leyendo', i !== null)
    if (i !== null) dias[i].classList.add('lee')
    pintarLectura(lecturaEl, c, i ?? iHoy, hoy)
  }

  const alMover = (e: PointerEvent) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('.ct-d')
    if (d) leer(Number(d.dataset.i))
  }
  const alSalir = () => {
    if (document.activeElement !== raiz) leer(null)
  }
  const alTecla = (e: KeyboardEvent) => {
    const paso: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageDown: 7, PageUp: -7 }
    let i: number | null = null
    const actual = leido ?? iHoy ?? 0
    if (e.key in paso) i = actual + paso[e.key]
    else if (e.key === 'Home') i = 0
    else if (e.key === 'End') i = c.total
    if (i === null) return
    e.preventDefault()
    leer(Math.min(c.total, Math.max(0, i)))
  }
  const alEnfocar = () => leer(leido ?? iHoy ?? 0)
  const alDesenfocar = () => leer(null)

  grid.addEventListener('pointermove', alMover)
  grid.addEventListener('pointerdown', alMover)
  grid.addEventListener('pointerleave', alSalir)
  raiz.addEventListener('keydown', alTecla)
  raiz.addEventListener('focus', alEnfocar)
  raiz.addEventListener('blur', alDesenfocar)

  // El pulso de hoy es CSS: fuera de pantalla se congela.
  const io = new IntersectionObserver(([e]) => grid.classList.toggle('ct-pausada', !e.isIntersecting))
  io.observe(grid)
  const ro = new ResizeObserver(() => {
    if (iHoy !== null) hoyEl.style.left = `${xDe(iHoy)}px`
  })
  ro.observe(grid)

  pintarLectura(lecturaEl, c, iHoy, hoy)

  // ── Entrada ──
  let tl: gsap.core.Timeline | null = null
  const final = () => {
    gsap.set([...barras, ...bits, ...pines], { clearProps: 'transform,opacity' })
    grid.classList.remove('barriendo')
    marcarHasta(tope)
    ponerHoy()
  }

  if (reducido) {
    final()
  } else {
    try {
      gsap.set(barras, { scaleY: 0 })
      gsap.set(bits, { scaleX: 0 })
      gsap.set(pines, { opacity: 0, y: -12 })
      const arrancar = () => {
        const barrido = { k: 0 }
        const dur = Math.min(1.8, 0.5 + tope * 0.012)
        tl = gsap
          .timeline({ onComplete: final })
          .to(barras, { scaleY: 1, duration: 0.55, ease: 'expo.out', stagger: { each: 0.0042 } }, 0)
          .to(bits, { scaleX: 1, duration: 0.8, ease: 'expo.out', stagger: 0.08 }, 0.25)
          .to(pines, { opacity: 1, y: 0, duration: 0.6, ease: 'back.out(2.2)', stagger: 0.14 }, 0.55)
        if (tope > 0) {
          tl.call(() => grid.classList.add('barriendo'), [], 0.45).to(
            barrido,
            {
              k: Math.min(tope, c.total),
              duration: dur,
              ease: 'power2.inOut',
              onUpdate: () => {
                cabeza.style.left = `${xDe(barrido.k)}px`
                marcarHasta(Math.floor(barrido.k))
              },
            },
            0.45,
          )
        }
      }
      if (o.intro === 'ya') arrancar()
      else {
        // Bandera en vez de `once: true`: un trigger que se destruye dentro
        // del refresh de otro deja colgada la entrada (tropiezo conocido).
        let hecho = false
        ScrollTrigger.create({
          trigger: grid,
          start: 'top 88%',
          onEnter: () => {
            if (hecho) return
            hecho = true
            arrancar()
          },
        })
      }
    } catch (err) {
      console.warn('[ep] entrada de la cinta deshabilitada', err)
      final()
    }
  }

  return () => {
    tl?.kill()
    io.disconnect()
    ro.disconnect()
    grid.removeEventListener('pointermove', alMover)
    grid.removeEventListener('pointerdown', alMover)
    grid.removeEventListener('pointerleave', alSalir)
    raiz.removeEventListener('keydown', alTecla)
    raiz.removeEventListener('focus', alEnfocar)
    raiz.removeEventListener('blur', alDesenfocar)
  }
}

// ── Calculadora: la misma cinta con otra fecha ─────────────────────────────

let desmontarCalc: (() => void) | null = null

function alCronograma(inicio: string, hitos: Hito[]) {
  const cont = document.getElementById('calc-cinta')
  const dibujo = cont?.querySelector<HTMLElement>('[data-cinta-dibujo]')
  const lectura = document.getElementById('calc-cinta-lectura')
  if (!cont || !dibujo || !lectura) return
  try {
    const c = modeloCinta(entradaDesdeHitos(inicio, hitos))
    desmontarCalc?.()
    cont.hidden = false
    dibujo.innerHTML = htmlCinta(c)
    desmontarCalc = montarCinta(cont, c, lectura, { intro: 'ya' })
    if (!reducido) {
      gsap.from('#calc-timeline > div', {
        y: 14,
        opacity: 0,
        duration: 0.6,
        ease: 'expo.out',
        stagger: 0.035,
        delay: 0.5,
        clearProps: 'transform,opacity',
      })
    }
  } catch (err) {
    // Fail-open: la lista de hitos de la calculadora sigue ahí sin la cinta.
    console.warn('[ep] cinta de la calculadora no disponible', err)
    cont.hidden = true
  }
}

// ── Pago: el desprendible se imprime ───────────────────────────────────────

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function animarRecibo(el: HTMLElement) {
  if (reducido || !el.firstElementChild) return
  try {
    // Cifras de las fichas: ruedan desde cero hasta su valor. Al final se
    // restaura el texto exacto que escribió la página, no el del tween.
    el.querySelectorAll<HTMLElement>('[data-cifra]').forEach((c, i) => {
      const original = c.textContent ?? ''
      const digitos = original.replace(/\D/g, '')
      if (!digitos) return
      const esPeso = original.includes('$')
      const meta = Number(digitos)
      const v = { n: 0 }
      gsap.to(v, {
        n: meta,
        duration: 1.3,
        delay: i * 0.08,
        ease: 'expo.out',
        onUpdate: () => {
          c.textContent = esPeso ? cop.format(Math.round(v.n)) : String(Math.round(v.n))
        },
        onComplete: () => {
          c.textContent = original
        },
      })
    })
    // Renglones de cada desglose: de arriba abajo, como sale de la impresora.
    // Los descuentos entran desde la derecha y los totales destellan.
    el.querySelectorAll<HTMLElement>('[data-recibo]').forEach((r, k) => {
      const renglones = Array.from(r.querySelectorAll<HTMLElement>('[data-renglon]'))
      renglones.forEach((fila, i) => {
        const t = 0.25 + k * 0.15 + i * 0.09
        const tipo = fila.dataset.renglon
        gsap.fromTo(
          fila,
          { clipPath: 'inset(0% 0% 100% 0%)', y: -6, x: tipo === 'resta' ? 14 : 0 },
          { clipPath: 'inset(0% 0% 0% 0%)', y: 0, x: 0, duration: 0.45, delay: t, ease: 'power2.out', clearProps: 'clipPath,transform' },
        )
        if (tipo === 'total') {
          gsap.fromTo(
            fila,
            { backgroundColor: 'rgba(201,255,91,0.16)' },
            { backgroundColor: 'rgba(201,255,91,0)', duration: 1, delay: t + 0.3, ease: 'power2.out', clearProps: 'backgroundColor' },
          )
        }
      })
    })
    gsap.from(el.querySelectorAll('tbody tr, tfoot tr'), {
      opacity: 0,
      y: 6,
      duration: 0.4,
      stagger: 0.025,
      delay: 0.6,
      ease: 'power2.out',
      clearProps: 'transform,opacity',
    })
  } catch (err) {
    console.warn('[ep] animación del pago deshabilitada', err)
    gsap.set(el.querySelectorAll('[data-renglon], tr'), { clearProps: 'all' })
  }
}

let pagoVisto = false
function alPago() {
  const el = document.getElementById('pago-resultados')
  if (!el) return
  if (pagoVisto) return animarRecibo(el)
  cuandoVisible(el, () => {
    pagoVisto = true
    animarRecibo(el)
  })
}

// ── Bandeja del instructor ─────────────────────────────────────────────────

let bandejaVista = false
let consultaActual = ''
let pendiente: { ok: boolean; asunto: string } | null = null
let reloj: ReturnType<typeof setTimeout> | undefined
let tecleo: gsap.core.Tween | null = null

function aplicarBandeja(ok: boolean, asunto: string, animar: boolean) {
  const bj = document.querySelector<HTMLElement>('[data-bandeja]')
  if (!bj) return
  const q = bj.querySelector<HTMLElement>('[data-bandeja-q]')!
  const cuenta = bj.querySelector<HTMLElement>('[data-bandeja-cuenta]')!
  const nota = bj.querySelector<HTMLElement>('[data-bandeja-nota]')!
  const tuyo = bj.querySelector<HTMLElement>('[data-bandeja-tuyo]')!
  const tuyoAsunto = tuyo.querySelector<HTMLElement>('[data-bandeja-asunto]')!
  const correos = Array.from(bj.querySelectorAll<HTMLElement>('.bj-correo'))

  tecleo?.kill()
  bj.removeAttribute('data-escribiendo')

  if (!ok) {
    consultaActual = ''
    bj.removeAttribute('data-filtrando')
    tuyo.hidden = true
    q.innerHTML = '<span class="bj-q-vacio">Buscar en el correo</span>'
    cuenta.textContent = ''
    nota.textContent = 'Completa el asunto y verás cómo lo encuentra el instructor.'
    correos.forEach((li) => {
      li.classList.remove('encontrado')
      const a = li.querySelector<HTMLElement>('.bj-asunto')!
      if (li !== tuyo) a.textContent = li.dataset.asunto ?? ''
    })
    return
  }

  const consulta = consultaBandeja(asunto)
  tuyoAsunto.textContent = asunto

  if (tuyo.hidden) {
    tuyo.hidden = false
    if (animar) {
      gsap.fromTo(
        tuyo,
        { height: 0, paddingTop: 0, paddingBottom: 0, opacity: 0 },
        { height: 'auto', paddingTop: 9, paddingBottom: 9, opacity: 1, duration: 0.6, ease: 'expo.out', clearProps: 'all' },
      )
      gsap.fromTo(tuyo, { backgroundColor: 'rgba(201,255,91,0.3)' }, { backgroundColor: 'rgba(201,255,91,0.06)', duration: 1.4, clearProps: 'backgroundColor' })
    }
  }

  const filtrar = () => {
    bj.removeAttribute('data-escribiendo')
    let n = 0
    for (const li of correos) {
      const a = li.querySelector<HTMLElement>('.bj-asunto')!
      const texto = li === tuyo ? asunto : (li.dataset.asunto ?? '')
      const si = coincideBandeja(texto, consulta)
      li.classList.toggle('encontrado', si)
      if (si) {
        n++
        a.innerHTML = `<span class="bj-marca">${esc(consulta)}</span>${esc(texto.slice(consulta.length))}`
      } else {
        a.textContent = texto
      }
    }
    bj.setAttribute('data-filtrando', '')
    cuenta.textContent = `${n} ${n === 1 ? 'resultado' : 'resultados'}`
    nota.textContent = 'Los asuntos sin el formato no aparecen al buscar: el instructor no los ve en su lista del mes.'
  }

  if (consulta === consultaActual || !animar) {
    consultaActual = consulta
    q.textContent = consulta
    filtrar()
    return
  }
  consultaActual = consulta
  // El buscador escribe la consulta letra a letra: es el gesto del
  // instructor, no un filtro que aparece solo.
  bj.removeAttribute('data-filtrando')
  bj.setAttribute('data-escribiendo', '')
  const v = { n: 0 }
  q.textContent = ''
  tecleo = gsap.to(v, {
    n: consulta.length,
    duration: consulta.length * 0.05,
    delay: 0.35,
    ease: 'none',
    onUpdate: () => {
      q.textContent = consulta.slice(0, Math.round(v.n))
    },
    onComplete: filtrar,
  })
}

function alAsunto(ok: boolean, asunto: string) {
  const bj = document.querySelector('[data-bandeja]')
  if (!bj) return
  if (!bandejaVista) {
    // La primera vez espera a verse: con el asunto ya guardado de otra visita,
    // la caída del correo pasaría fuera de pantalla.
    const primero = pendiente === null
    pendiente = { ok, asunto }
    if (primero) {
      cuandoVisible(bj, () => {
        bandejaVista = true
        const p = pendiente!
        aplicarBandeja(p.ok, p.asunto, !reducido)
      })
    }
    return
  }
  clearTimeout(reloj)
  // Mientras se escribe la cédula o el nombre no se reanima en cada tecla.
  reloj = setTimeout(() => aplicarBandeja(ok, asunto, !reducido), 380)
}

// ── Checklists: sello al marcar y carpeta del cierre ───────────────────────

let carpetaVista = false

function alChecklist(lista: string, marcados: string[], cambio: { key: string; marcado: boolean } | null) {
  const ol = document.getElementById(lista)
  ol?.querySelectorAll<HTMLInputElement>('.ep-check').forEach((cb) => {
    cb.closest('li')?.classList.toggle('marcada', cb.checked)
  })
  if (cambio?.marcado && !reducido) {
    const cb = ol?.querySelector<HTMLInputElement>(`.ep-check[data-key="${cambio.key}"]`)
    if (cb) sello(cb)
  }
  if (lista !== 'cierre-checklist') return

  const carpeta = document.querySelector<HTMLElement>('[data-carpeta]')
  if (!carpeta) return
  const hojas = Array.from(carpeta.querySelectorAll<HTMLElement>('.pdf-hoja'))
  const pintar = (entrar: HTMLElement[]) => {
    hojas.forEach((h) => h.classList.toggle('dentro', marcados.includes(h.dataset.k!)))
    carpeta.querySelector('[data-carpeta-n]')!.textContent = String(marcados.length)
    carpeta.classList.toggle('completa', marcados.length === hojas.length)
    if (!reducido && entrar.length) {
      gsap.fromTo(
        entrar,
        { x: -34, y: -10, rotation: -8, opacity: 0 },
        { x: 0, y: 0, rotation: 0, opacity: 1, duration: 0.7, ease: 'back.out(1.5)', stagger: 0.09, clearProps: 'transform,opacity' },
      )
    }
  }

  if (cambio) {
    const h = hojas.find((x) => x.dataset.k === cambio.key)
    pintar(cambio.marcado && h ? [h] : [])
    return
  }
  // Carga inicial: las páginas ya marcadas en otra visita entran cuando la
  // carpeta asoma, en orden.
  if (carpetaVista || !marcados.length) return pintar([])
  hojas.forEach((h) => h.classList.remove('dentro'))
  cuandoVisible(carpeta, () => {
    carpetaVista = true
    pintar(hojas.filter((h) => marcados.includes(h.dataset.k!)))
  })
}

function sello(cb: HTMLInputElement) {
  const anillo = document.createElement('span')
  anillo.className = 'ep-sello'
  anillo.setAttribute('aria-hidden', 'true')
  cb.insertAdjacentElement('afterend', anillo)
  gsap.fromTo(
    anillo,
    { scale: 0.3, opacity: 1 },
    { scale: 2.6, opacity: 0, duration: 0.6, ease: 'expo.out', onComplete: () => anillo.remove() },
  )
}

// ── Montaje ────────────────────────────────────────────────────────────────

/** Registra los oyentes antes de que el script de la página emita nada. */
export function escucharEp(o: { reducido: boolean }) {
  reducido = o.reducido
  document.addEventListener('ep:cronograma', (e) => {
    const d = (e as CustomEvent<{ inicio: string; hitos: Hito[] }>).detail
    alCronograma(d.inicio, d.hitos)
  })
  document.addEventListener('ep:pago', alPago)
  document.addEventListener('ep:asunto', (e) => {
    const d = (e as CustomEvent<{ ok: boolean; asunto: string }>).detail
    alAsunto(d.ok, d.asunto)
  })
  document.addEventListener('ep:checklist', (e) => {
    const d = (e as CustomEvent<{ lista: string; marcados: string[]; cambio: { key: string; marcado: boolean } | null }>)
      .detail
    alChecklist(d.lista, d.marcados, d.cambio)
  })
}

/**
 * Titular del hero palabra a palabra. "productiva" lleva su propio degradado
 * (text-mask-cyan) dentro del de la línea: cada palabra recibe el del bloque
 * que la contiene, porque el recorte de `background-clip: text` no llega a
 * los hijos transformados.
 */
function revelarTitulo(h: HTMLElement) {
  const split = new SplitText(h, { type: 'words', mask: 'words' })
  split.words.forEach((w) => {
    const cyan = w.closest('.text-mask-cyan')
    w.classList.add(cyan ? 'text-mask-cyan' : 'text-mask')
  })
  h.style.backgroundImage = 'none'
  h.querySelectorAll<HTMLElement>('.text-mask-cyan').forEach((el) => {
    if (!split.words.includes(el)) el.style.backgroundImage = 'none'
  })
  gsap.from(split.words, { yPercent: 115, duration: 1.15, ease: 'expo.out', stagger: 0.09, delay: 0.1 })
}

export function montarEp(o: { reducido: boolean }) {
  reducido = o.reducido

  // Cifras del estado: el número grande es el día de la etapa.
  const estado = document.getElementById('ep-estado')
  const raiz = document.querySelector<HTMLElement>('[data-cinta-raiz]')
  const datos = raiz?.querySelector('[data-cinta-entrada]')
  if (estado && raiz && datos) {
    try {
      const c = modeloCinta(JSON.parse(datos.textContent ?? '') as EntradaCinta)
      const iHoy = indiceDe(c, hoyIso())
      const antes = hoyIso() < c.inicioIso
      const dia = iHoy ?? (antes ? 0 : c.total)
      document.getElementById('ep-dia')!.textContent = String(dia).padStart(3, '0')
      document.getElementById('ep-dia-de')!.innerHTML = `de ${c.total}<br />días`
      montarCinta(raiz, c, document.getElementById('ep-cinta-lectura')!, { intro: 'scroll' })
    } catch (err) {
      console.warn('[ep] cinta sin modelo', err)
    }
  }

  // Miniaturas de las filas de bitácora: lo transcurrido y hoy, igual que la
  // cinta grande.
  const hoy = hoyIso()
  document.querySelectorAll<HTMLElement>('[data-mini] i[data-iso]').forEach((i) => {
    const iso = i.dataset.iso!
    i.classList.toggle('pasado', iso < hoy)
    i.classList.toggle('hoy', iso === hoy)
  })

  if (reducido) return

  try {
    const titulo = document.querySelector<HTMLElement>('[data-ep-titulo]')
    if (titulo) revelarTitulo(titulo)
    ;['ep-dia', 'ep-stat-avance', 'ep-stat-dias', 'ep-stat-bitacora'].forEach((id) => {
      const el = document.getElementById(id)
      if (el) {
        el.dataset.odometroInicio = 'top bottom'
        odometro(el)
      }
    })
    gsap.utils.toArray<HTMLElement>('[data-medidor] i').forEach((barra) => {
      gsap.from(barra, {
        scaleX: 0,
        duration: 1.1,
        ease: 'expo.out',
        scrollTrigger: { trigger: barra, start: 'top 92%' },
      })
    })
  } catch (err) {
    console.warn('[ep] motion parcial', err)
    gsap.set('[data-ep-titulo] *, [data-medidor] i', { clearProps: 'transform' })
  }

  montarLanding({ anclas: true })
}
