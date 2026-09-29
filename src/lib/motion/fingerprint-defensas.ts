// Comprobación de defensas del tablero de /lab/fingerprint. El cierre de la
// página afirma tres cosas (el incógnito no protege, Tor uniforma, Firefox
// reduce la precisión); aquí se ven ocurrir sobre cuatro dispositivos de
// ejemplo, con las mismas funciones que dibujan las huellas del tablero:
//   · incógnito: la cookie se borra y las huellas no cambian
//   · Tor: todas convergen en la misma huella
//   · Firefox: la rejilla de precisión junta algunas, no todas
// Las cifras ("N de 4 huellas distintas") se cuentan sobre los parámetros que
// se dibujan, no se escriben a mano. Es un ejemplo ilustrativo y la página lo
// rotula así.
//
// El marcado del servidor (tres párrafos) sigue siendo el estado sin JS: aquí
// se sustituye por el banco de pruebas y sus textos pasan a ser los de cada
// pestaña.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import {
  PARAMETROS_TOR,
  PASO_FIREFOX,
  crestas,
  huellasDistintas,
  parametrosDeId,
  reducirPrecision,
} from './fingerprint-sala'
import type { ParametrosHuella } from './huella'
import { interpolate } from '../../i18n/format'

type Defensa = 'sin' | 'incognito' | 'tor' | 'firefox'
const DEFENSAS: readonly Defensa[] = ['sin', 'incognito', 'tor', 'firefox']

type Ejemplo = {
  original: ParametrosHuella
  /** Parámetros que se están dibujando ahora (se interpolan). */
  actual: ParametrosHuella
  trazos: SVGPathElement[]
  cookie: HTMLElement | null
  cookieTexto: string
}

export function montarDefensas(raiz: HTMLElement, opciones: { reducido: boolean; textos: Record<string, string> }): void {
  const { reducido, textos: T } = opciones
  const banco = raiz.querySelector<HTMLElement>('[data-banco]')
  const parrafos = raiz.querySelector<HTMLElement>('[data-textos]')
  const cuenta = raiz.querySelector<HTMLElement>('[data-cuenta]')
  const texto = raiz.querySelector<HTMLElement>('[data-texto]')
  const pestanas = [...raiz.querySelectorAll<HTMLButtonElement>('.fd-tab')]
  if (!banco || !parrafos || !cuenta || !texto || pestanas.length !== DEFENSAS.length) return

  const ejemplos: Ejemplo[] = [...raiz.querySelectorAll<HTMLElement>('[data-ejemplo]')].map((fig) => {
    const original = parametrosDeId(fig.dataset.id ?? '')
    const cookie = fig.querySelector<HTMLElement>('[data-cookie]')
    return {
      original,
      actual: { ...original },
      trazos: [...fig.querySelectorAll<SVGPathElement>('svg path')],
      cookie,
      cookieTexto: cookie?.textContent ?? '',
    }
  })
  if (!ejemplos.length) return

  // Los textos de cada pestaña son los párrafos del servidor: una sola fuente
  // de verdad, y sin JS se siguen leyendo enteros.
  const textoDe = (d: Defensa): string =>
    d === 'sin' ? T.sinTexto ?? '' : parrafos.querySelector<HTMLElement>(`[data-defensa="${d}"]`)?.innerHTML ?? ''

  const objetivo = (d: Defensa, e: Ejemplo): ParametrosHuella =>
    d === 'tor' ? PARAMETROS_TOR : d === 'firefox' ? reducirPrecision(e.original, PASO_FIREFOX) : e.original

  const pintar = (e: Ejemplo) => {
    crestas(e.actual).forEach((d, i) => e.trazos[i]?.setAttribute('d', d))
  }

  let activa: Defensa = 'sin'

  const seleccionar = (d: Defensa, animar: boolean) => {
    activa = d
    pestanas.forEach((p, i) => {
      const sel = DEFENSAS[i] === d
      p.setAttribute('aria-selected', String(sel))
      p.tabIndex = sel ? 0 : -1
    })

    const objetivos = ejemplos.map((e) => objetivo(d, e))
    cuenta.textContent = interpolate(T.distintas ?? '', { n: huellasDistintas(objetivos), total: ejemplos.length })

    ejemplos.forEach((e, i) => {
      // Solo el incógnito borra la cookie; en las demás defensas sigue ahí y
      // la huella es lo que cambia (o no cambia).
      if (e.cookie) {
        const borrada = d === 'incognito'
        e.cookie.toggleAttribute('data-borrada', borrada)
        e.cookie.textContent = borrada ? `${T.cookie ?? ''} · ${T.cookieBorrada ?? ''}` : e.cookieTexto
      }
      const meta = objetivos[i]!
      if (!animar || reducido) {
        Object.assign(e.actual, meta)
        pintar(e)
        return
      }
      gsap.to(e.actual, { ...meta, duration: 1.3, ease: 'power3.inOut', delay: i * 0.05, overwrite: true, onUpdate: () => pintar(e) })
    })

    // El texto cambia con un fundido corto; en movimiento reducido, de golpe.
    const poner = () => {
      texto.innerHTML = textoDe(d)
    }
    if (!animar || reducido) {
      poner()
    } else {
      gsap.to(texto, { opacity: 0, duration: 0.15, onComplete: () => { poner(); gsap.to(texto, { opacity: 1, duration: 0.35 }) } })
    }
  }

  pestanas.forEach((p, i) => {
    p.addEventListener('click', () => seleccionar(DEFENSAS[i]!, true))
    // Teclado de pestañas: flechas y Inicio/Fin mueven la selección y el foco.
    p.addEventListener('keydown', (ev) => {
      const paso = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : ev.key === 'Home' ? -99 : ev.key === 'End' ? 99 : 0
      if (!paso) return
      ev.preventDefault()
      const sig = Math.min(DEFENSAS.length - 1, Math.max(0, Math.abs(paso) === 99 ? (paso > 0 ? DEFENSAS.length - 1 : 0) : i + paso))
      pestanas[sig]?.focus()
      seleccionar(DEFENSAS[sig]!, true)
    })
  })

  parrafos.hidden = true
  banco.hidden = false
  seleccionar(activa, false)
}
