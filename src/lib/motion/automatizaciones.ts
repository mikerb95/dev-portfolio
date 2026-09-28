// /automatizaciones en el navegador: la partitura del hero, el selector de
// eventos de CI, la tabla de crons que sigue contando mientras la página está
// abierta, y las escenas de los automatismos.
//
// Fail-open por pieza: cada una se monta en su propio try, y si una falla las
// demás siguen. El marcado del servidor es siempre un estado final legible.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { interpolate } from '../../i18n/format'
import { montarPartitura } from './partitura-viva'
import { montarEscenas } from './automatizaciones-escenas'
import { EVENTOS_CI, type EventoCi } from './disparos'
import { consumoTolerancia, estadoFila } from './partitura'

gsap.registerPlugin(ScrollTrigger)

export function montarAutomatizaciones(opciones: { reducido: boolean }): void {
  const piezas: [string, () => void][] = [
    ['partitura', () => montarPartitura(opciones)],
    ['ci', () => montarCI(opciones.reducido)],
    ['crons', () => montarCrons(opciones.reducido)],
  ]
  if (!opciones.reducido) piezas.push(['escenas', montarEscenas])
  for (const [nombre, montar] of piezas) {
    try {
      montar()
    } catch (err) {
      console.warn(`[automatizaciones] ${nombre} sin motion tras un fallo`, err)
    }
  }
}

// ── Selector de eventos de CI ─────────────────────────────────────────────

// Cuánto tarda cada etapa en el recorrido ilustrativo, en segundos. Proporción
// aproximada de lo que tardan en Actions (el e2e es lo más lento), no medida.
const DURACION_ETAPA: Record<string, number> = { 'Test + Build': 1.5, 'E2E (Playwright)': 2.1 }
const DURACION_VERIF = 0.9
// Avance automático entre eventos mientras nadie elige uno.
const AVANCE_S = 6.5

function montarCI(reducido: boolean) {
  const raiz = document.querySelector<HTMLElement>('[data-ci]')
  const txt = document.getElementById('au-ci-i18n')
  if (!raiz || !txt) return
  const t = JSON.parse(txt.textContent ?? '{}') as { corriendo: string; listo: string; dormido: string }
  const tabs = Array.from(raiz.querySelectorAll<HTMLButtonElement>('[data-evento]'))
  const lista = raiz.querySelector<HTMLElement>('#au-ci-lista')!
  const filas = Array.from(raiz.querySelectorAll<HTMLElement>('[data-wf]'))

  let actual: EventoCi = 'push'
  let recorrido: gsap.core.Timeline | null = null
  let avance: gsap.core.Tween | null = null
  let automatico = !reducido
  let visible = false
  let apuntado = false

  function correr(ev: EventoCi) {
    recorrido?.kill()
    const tl = gsap.timeline()
    recorrido = tl
    filas.forEach((f, idx) => {
      f.querySelectorAll('[data-hecho]').forEach((c) => c.removeAttribute('data-hecho'))
      if (f.dataset.despierto !== 'si') {
        f.removeAttribute('data-corriendo')
        return
      }
      const estado = f.querySelector<HTMLElement>('[data-estado-txt]')!
      f.dataset.corriendo = ''
      estado.textContent = t.corriendo
      const etapas = Array.from(f.querySelectorAll<HTMLElement>('[data-etapa]'))
      let fin = 0
      if (etapas.length) {
        const finDe = new Map<string, number>()
        for (const e of etapas) {
          const barra = e.querySelector('.au-barra i')!
          if (e.dataset.soloPush !== undefined && ev !== 'push') continue
          const empieza = e.dataset.tras ? (finDe.get(e.dataset.tras) ?? 0) + 0.15 : 0.1
          const dura = e.dataset.soloPush !== undefined ? DURACION_VERIF : (DURACION_ETAPA[e.dataset.etapa ?? ''] ?? 1.4)
          tl.fromTo(barra, { scaleX: 0 }, { scaleX: 1, duration: dura, ease: 'power1.inOut', clearProps: 'transform' }, empieza)
          let termina = empieza + dura
          // Los tres chequeos de la verificación, uno tras otro.
          e.querySelectorAll<HTMLElement>('.au-checks i').forEach((c, i) => {
            const en = termina + 0.1 + i * 0.3
            tl.call(() => c.setAttribute('data-hecho', ''), [], en)
            tl.fromTo(c, { scale: 0.4 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', clearProps: 'transform' }, en)
          })
          if (e.querySelector('.au-checks')) termina += 0.1 + 3 * 0.3
          finDe.set(e.dataset.etapa ?? '', termina)
          fin = Math.max(fin, termina)
        }
      } else {
        const barra = f.querySelector('.au-barra i')!
        const dura = 1.1 + idx * 0.22
        tl.fromTo(barra, { scaleX: 0 }, { scaleX: 1, duration: dura, ease: 'power1.inOut', clearProps: 'transform' }, 0.1 + idx * 0.08)
        fin = 0.1 + idx * 0.08 + dura
      }
      tl.call(
        () => {
          f.removeAttribute('data-corriendo')
          estado.textContent = t.listo
        },
        [],
        fin
      )
    })
  }

  function seleccionar(ev: EventoCi, animar: boolean) {
    actual = ev
    tabs.forEach((b) => {
      const si = b.dataset.evento === ev
      b.setAttribute('aria-selected', si ? 'true' : 'false')
      b.tabIndex = si ? 0 : -1
    })
    lista.setAttribute('aria-labelledby', `au-ev-${ev}`)
    for (const f of filas) {
      const despierto = (f.dataset.disparadores ?? '').split(' ').includes(ev)
      f.dataset.despierto = despierto ? 'si' : 'no'
      f.dataset.eventoActivo = ev
      if (!despierto) f.querySelector<HTMLElement>('[data-estado-txt]')!.textContent = t.dormido
      else if (!animar || reducido) f.querySelector<HTMLElement>('[data-estado-txt]')!.textContent = t.listo
    }
    // La fila entra encendida o se apaga con una transición CSS; lo que corre
    // es el recorrido de las que despiertan.
    if (animar && !reducido) correr(ev)
    programarAvance()
  }

  // Barra de progreso en la pestaña activa: dice cuánto falta para pasar a la
  // siguiente, y se detiene mientras alguien apunta o lee.
  function programarAvance() {
    avance?.kill()
    tabs.forEach((b) => gsap.set(b.querySelector('.au-ev-progreso'), { scaleX: 0 }))
    if (!automatico) return
    const barra = tabs.find((b) => b.dataset.evento === actual)?.querySelector('.au-ev-progreso')
    avance = gsap.fromTo(
      barra ?? {},
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: AVANCE_S,
        ease: 'none',
        paused: !visible || apuntado,
        onComplete: () => {
          const i = EVENTOS_CI.indexOf(actual)
          seleccionar(EVENTOS_CI[(i + 1) % EVENTOS_CI.length], true)
        },
      }
    )
  }
  const reanudar = () => {
    if (!avance) return
    if (visible && !apuntado && !document.hidden) avance.play()
    else avance.pause()
  }

  tabs.forEach((b, i) => {
    b.addEventListener('click', () => {
      automatico = false
      seleccionar(b.dataset.evento as EventoCi, true)
    })
    b.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!dir) return
      e.preventDefault()
      const sig = tabs[(i + dir + tabs.length) % tabs.length]
      sig.focus()
      automatico = false
      seleccionar(sig.dataset.evento as EventoCi, true)
    })
  })
  raiz.addEventListener('pointerenter', () => ((apuntado = true), reanudar()))
  raiz.addEventListener('pointerleave', () => ((apuntado = false), reanudar()))
  raiz.addEventListener('focusin', () => ((apuntado = true), reanudar()))
  raiz.addEventListener('focusout', () => ((apuntado = false), reanudar()))
  document.addEventListener('visibilitychange', reanudar)

  // El primer recorrido arranca al entrar en pantalla, no al cargar: si no,
  // cuando alguien llega a la sección ya terminó.
  let primera = true
  new IntersectionObserver(
    (es) => {
      visible = es.some((e) => e.isIntersecting)
      if (visible && primera) {
        primera = false
        seleccionar(actual, true)
      }
      reanudar()
    },
    { threshold: 0.3 }
  ).observe(raiz)
}

// ── Tabla de crons ────────────────────────────────────────────────────────

function montarCrons(reducido: boolean) {
  const tabla = document.querySelector<HTMLElement>('[data-tabla-crons]')
  const txt = document.getElementById('au-i18n')
  if (!tabla || !txt) return
  const t = JSON.parse(txt.textContent ?? '{}') as {
    agoJustNow: string
    agoMinutes: string
    agoHours: string
    agoDaysShort: string
    silent: string
  }
  const filas = Array.from(tabla.querySelectorAll<HTMLElement>('tr[data-fila]'))
  const rejilla = document.querySelector<HTMLElement>('[data-rejilla]')

  const hace = (at: number) => {
    const min = Math.floor((Date.now() - at) / 60000)
    if (min < 1) return t.agoJustNow
    if (min < 60) return interpolate(t.agoMinutes, { n: min })
    const h = Math.floor(min / 60)
    if (h < 24) return interpolate(t.agoHours, { n: h })
    return interpolate(t.agoDaysShort, { n: Math.floor(h / 24) })
  }

  // La página sale de la CDN hasta con 5 min de antigüedad y puede quedarse
  // abierta horas: el "hace cuánto" y el medidor se recalculan con el reloj de
  // quien mira, con la misma definición de silencio que el servidor.
  const CLS = { ok: 'text-lime', fallo: 'text-ember', silencio: 'text-ember', 'sin-registro': 'text-ink-400' }
  function refrescar() {
    for (const f of filas) {
      const at = Number(f.dataset.at)
      if (!at) continue
      const cada = Number(f.dataset.cada)
      const estado = estadoFila(cada, { at, ok: f.dataset.ok === '1' }, Infinity, Date.now())
      const celda = f.querySelector<HTMLElement>('[data-hace]')!
      celda.className = CLS[estado]
      celda.textContent = estado === 'silencio' ? interpolate(t.silent, { ago: hace(at) }) : hace(at)
      const medidor = f.querySelector<HTMLElement>('[data-medidor]')!
      medidor.dataset.estado = estado
      medidor.style.setProperty('--consumo', Math.min(1, consumoTolerancia(cada, at, Date.now())).toFixed(3))
    }
  }
  refrescar()
  const reloj = window.setInterval(() => !document.hidden && refrescar(), 30_000)
  window.addEventListener('pagehide', () => clearInterval(reloj), { once: true })

  // Apuntar una fila resalta su renglón en la partitura, que está arriba: la
  // tabla y la partitura son la misma bitácora leída de dos maneras.
  for (const f of filas) {
    const job = f.dataset.fila!
    const en = () => {
      f.classList.add('au-activo')
      rejilla?.classList.add('au-enfoque')
      document.querySelectorAll(`[data-pista="${job}"],[data-carril="${job}"]`).forEach((el) => el.classList.add('au-activo'))
    }
    const sale = () => {
      f.classList.remove('au-activo')
      rejilla?.classList.remove('au-enfoque')
      document.querySelectorAll(`[data-pista="${job}"],[data-carril="${job}"]`).forEach((el) => el.classList.remove('au-activo'))
    }
    f.addEventListener('pointerenter', en)
    f.addEventListener('pointerleave', sale)
  }

  if (!reducido) {
    const medidores = tabla.querySelectorAll('.au-medidor i')
    gsap.set(medidores, { scaleX: 0, transformOrigin: 'left center' })
    let hecho = false
    ScrollTrigger.create({
      trigger: tabla,
      start: 'top 80%',
      onEnter: () => {
        if (hecho) return
        hecho = true
        gsap.to(medidores, { scaleX: 1, duration: 1.1, ease: 'expo.out', stagger: 0.06, clearProps: 'transform' })
      },
    })
  }
}
