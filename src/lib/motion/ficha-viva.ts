// Motor de la ficha de decisiones del hero de /notes (FichaDecision.astro).
//
// Cada ficha se representa en tres tiempos que son la afirmación de la página:
// aparece el problema (palabras que pasan de borrosas a nítidas), la opción
// descartada se tacha, y la elegida se escribe letra a letra. El mapa de la
// nota se transforma del de la anterior al suyo mientras tanto. Los tiempos
// salen de `ritmoFicha` (notas.ts), que garantiza que la ficha se queda quieta
// lo que tarda en leerse antes de pasar a la siguiente.
//
// Se detiene sola fuera de pantalla, con la pestaña oculta, al apuntarla o al
// enfocarla con el teclado, y con el botón de pausa (el avance automático de
// más de 5 s necesita un control para pararlo). Con movimiento reducido no
// avanza sola y cambiar de ficha no anima nada.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { montarPortadas, type Portadas } from './portadas-gl'
import { circular, ritmoFicha } from './notas'
import type { FichaDato } from './notas'

gsap.registerPlugin(SplitText)

type Textos = { ficha: string; pausar: string; reanudar: string; min: string }

export function montarFicha(raiz: HTMLElement) {
  const datos: FichaDato[] = JSON.parse(raiz.dataset.fichas ?? '[]')
  const textos: Textos = JSON.parse(raiz.dataset.t ?? '{}')
  if (datos.length === 0) return

  const $ = <T extends Element = HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!
  const carta = $('.fd-carta')
  const lienzo = $<HTMLCanvasElement>('.fd-lienzo')
  const num = $('.fd-num b')
  const temaTxt = $('.fd-tema-txt')
  const problema = $('.fd-problema')
  const descartado = $('.fd-desc-txt')
  const decidido = $('.fd-dec-txt')
  const leer = $<HTMLAnchorElement>('.fd-leer')
  const titulo = $('.fd-titulo')
  const minutos = $('.fd-min')
  const controles = $('.fd-controles')
  const pausa = $<HTMLButtonElement>('.fd-pausa')
  const marcas = Array.from(raiz.querySelectorAll<HTMLElement>('.fd-marca'))
  const avance = $('.fd-avance')
  const fantasmas = Array.from(raiz.querySelectorAll<HTMLElement>('.fd-fantasma'))

  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let portadas: Portadas | null = null
  let actual = 0
  let secuencia: gsap.core.Timeline | null = null
  let division: SplitText | null = null

  // Motivos de pausa por separado: soltar el cursor no debe reanudar una
  // ficha que el visitante pausó con el botón, ni una que está fuera de
  // pantalla.
  const pausas = new Set<'cursor' | 'foco' | 'boton' | 'fuera' | 'oculta'>()

  const pintarTextos = (d: FichaDato) => {
    raiz.style.setProperty('--fd-color', d.color)
    num.textContent = String(actual + 1).padStart(2, '0')
    temaTxt.textContent = d.tema
    problema.textContent = d.problem
    descartado.textContent = d.rejected
    decidido.textContent = d.chosen
    leer.href = d.href
    titulo.textContent = d.titulo
    minutos.textContent = textos.min.replace('{n}', String(d.minutos))
    marcas.forEach((m, i) => m.classList.toggle('actual', i === actual))
  }

  // Estado final visible: lo que se deja si algo falla o al desmontar.
  const restaurar = () => {
    division?.revert()
    division = null
    gsap.set([carta, problema, descartado, decidido, avance], { clearProps: 'all' })
    raiz.classList.remove('tecleando')
    pintarTextos(datos[actual])
  }

  // Las pausas detienen el reloj que pasa a la siguiente ficha, no la
  // representación de la actual: si el foco cae en "siguiente" (y eso pausa),
  // la ficha nueva tiene que terminar de aparecer igual.
  const aplicarPausa = () => {
    if (reloj) pausas.size > 0 ? reloj.pause() : reloj.resume()
    portadas?.animar(!pausas.has('fuera') && !pausas.has('oculta'))
  }

  let salida: gsap.core.Timeline | null = null
  let reloj: gsap.core.Tween | null = null

  /** Representa la ficha `i`: sale la anterior, entra esta y se escribe. */
  const representar = (i: number, direccion: 1 | -1, entrada: boolean) => {
    salida?.kill()
    secuencia?.kill()
    reloj?.kill()
    const previa = actual
    actual = i
    const d = datos[i]

    if (reducido) {
      restaurar()
      portadas?.mostrar(d)
      return
    }

    salida = gsap.timeline({ onComplete: () => entrar(d, direccion, entrada, previa) })
    // Salida de la carta anterior (no en la primera: el servidor ya la pintó).
    if (!entrada) {
      salida.to(carta, { x: -26 * direccion, rotation: -2.2 * direccion, autoAlpha: 0, duration: 0.3, ease: 'power2.in' })
      // El mazo se reacomoda: las cartas de atrás cambian de sitio, como
      // cuando la de delante pasa al fondo.
      fantasmas.forEach((f, k) => {
        const giro = (k === 0 ? -3.4 : 2.2) * (i % 2 ? -1 : 1)
        salida!.to(f, { rotation: giro, duration: 0.7, ease: 'expo.out' }, 0.1)
      })
      salida.to({}, { duration: 0.3 }, 0)
    }
  }

  const entrar = (d: FichaDato, direccion: 1 | -1, entrada: boolean, previa: number) => {
    const r = ritmoFicha(d)
    division?.revert()
    pintarTextos(d)
    if (previa !== actual || entrada) portadas?.mostrar(d)
    division = new SplitText(problema, { type: 'words' })
    gsap.set(division.words, { opacity: 0, y: 6, filter: 'blur(6px)' })
    gsap.set(descartado, { opacity: 0, backgroundSize: '0% 2px', color: '#e7e7ec' })
    decidido.textContent = ''
    raiz.classList.add('tecleando')

    const tl = gsap.timeline()
    secuencia = tl
    if (!entrada) {
      tl.fromTo(
        carta,
        { x: 26 * direccion, rotation: 1.6 * direccion, autoAlpha: 0 },
        { x: 0, rotation: 0, autoAlpha: 1, duration: 0.65, ease: 'expo.out' },
        0,
      )
    }
    tl.to(division.words, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.55, ease: 'power3.out', stagger: 0.035 }, r.problema)
    tl.to(descartado, { opacity: 1, duration: 0.4, ease: 'power2.out' }, r.descartado)
    // El tachón cruza y la opción se apaga: ya no es candidata.
    tl.to(descartado, { backgroundSize: '100% 2px', color: '#85858f', duration: 0.5, ease: 'power2.inOut' }, r.tachon)

    const letras = [...d.chosen]
    const cursor = { n: 0 }
    tl.to(
      cursor,
      {
        n: letras.length,
        duration: r.tecleo,
        ease: 'none',
        onUpdate: () => {
          decidido.textContent = letras.slice(0, Math.round(cursor.n)).join('')
        },
      },
      r.decidido,
    )
    tl.call(() => raiz.classList.remove('tecleando'), [], r.completa + 0.6)

    // Reloj hasta la siguiente: la línea bajo la regla, lineal, durante toda
    // la ficha. Es lo único que las pausas detienen.
    reloj = gsap.fromTo(
      avance,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: r.total,
        ease: 'none',
        paused: pausas.size > 0,
        onComplete: () => representar(circular(actual, datos.length), 1, false),
      },
    )
  }

  try {
    raiz.classList.add('vivo')
    controles.hidden = false

    portadas = montarPortadas(lienzo)
    portadas?.mostrar(datos[0])

    $('.fd-prev').addEventListener('click', () => representar(circular(actual, datos.length, -1), -1, false))
    $('.fd-next').addEventListener('click', () => representar(circular(actual, datos.length), 1, false))
    $('.fd-regla').addEventListener('click', (e) => {
      const m = (e.target as HTMLElement).closest<HTMLElement>('.fd-marca')
      if (!m) return
      const i = Number(m.dataset.i)
      if (i !== actual) representar(i, i > actual ? 1 : -1, false)
    })
    pausa.addEventListener('click', () => {
      const pausada = !pausas.has('boton')
      pausada ? pausas.add('boton') : pausas.delete('boton')
      pausa.setAttribute('aria-pressed', String(pausada))
      pausa.setAttribute('aria-label', pausada ? textos.reanudar : textos.pausar)
      aplicarPausa()
    })

    if (reducido) {
      // Sin avance automático no hay nada que pausar.
      pausa.hidden = true
      avance.hidden = true
      return
    }

    // Leer una ficha no debe costar perseguirla: al apuntarla o enfocarla se
    // detiene donde esté.
    carta.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') {
        pausas.add('cursor')
        aplicarPausa()
      }
    })
    carta.addEventListener('pointerleave', () => {
      pausas.delete('cursor')
      aplicarPausa()
    })
    raiz.addEventListener('focusin', () => {
      pausas.add('foco')
      aplicarPausa()
    })
    raiz.addEventListener('focusout', (e) => {
      if (raiz.contains(e.relatedTarget as Node | null)) return
      pausas.delete('foco')
      aplicarPausa()
    })

    new IntersectionObserver(([e]) => {
      e.isIntersecting ? pausas.delete('fuera') : pausas.add('fuera')
      aplicarPausa()
    }).observe(raiz)
    document.addEventListener('visibilitychange', () => {
      document.hidden ? pausas.add('oculta') : pausas.delete('oculta')
      aplicarPausa()
    })

    // La primera ficha se vuelve a escribir cuando el titular ya entró: el
    // servidor la pintó completa, así que el visitante nunca ve una carta vacía.
    gsap.delayedCall(0.9, () => representar(0, 1, true))
  } catch (err) {
    // Fail-open: la ficha pintada por el servidor es el contenido.
    console.warn('[ficha] animación deshabilitada', err)
    salida?.kill()
    secuencia?.kill()
    reloj?.kill()
    restaurar()
  }
}
