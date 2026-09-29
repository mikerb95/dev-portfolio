// Entrada de /lab/fingerprint: la página lee tu navegador en dos tiempos y lo
// enseña ocurriendo. Al cargar, solo lo que cualquier sitio lee sin pedirte
// nada (pantalla, zona horaria, idioma, GPU...) y la huella se dibuja con eso.
// Al marcar el consentimiento se suman canvas, audio y fuentes, y la misma
// huella se transforma en la completa. Nada sale del navegador: la sala solo
// recibe algo cuando se pulsa "Crear sala" en otra página.
//
// El marcado del servidor es la lista de siempre, legible sin JS: aquí solo se
// le añaden los puntos de estado (clase `fl-vivo`) y se anima hacia el dato.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { montarHuella } from './huella-gl'
import { idCorto, parametrosDe } from './huella'
import { BITS_MAX, estadoLibro, unosEn } from './fingerprint-sala'
import { interpolate } from '../../i18n/format'

type Textos = Record<string, string>

type Lectura = { hash: string; claves: string[]; bits: number }

export function montarEntrada(opciones: { reducido: boolean; textos: Textos }): void {
  const { reducido, textos: T } = opciones
  const visor = document.querySelector<HTMLElement>('[data-huella]')
  const lienzo = visor?.querySelector<HTMLCanvasElement>('.huella-lienzo')
  const estado = visor?.querySelector<HTMLElement>('.huella-estado-txt')
  const libro = document.querySelector<HTMLElement>('[data-libro]')
  const medidor = document.querySelector<HTMLElement>('[data-medidor]')
  const consentimiento = document.getElementById('consent') as HTMLInputElement | null
  if (!visor || !lienzo || !estado || !libro || !medidor || !consentimiento) return

  const huella = montarHuella(lienzo, { reducido })
  if (huella) {
    new IntersectionObserver(([e]) => huella.activar(e.isIntersecting && !document.hidden), { rootMargin: '40px' }).observe(visor)
  } else {
    lienzo.hidden = true
  }

  const filas = [...libro.querySelectorAll<HTMLElement>('[data-fila]')]
  const marcas = [...medidor.querySelectorAll<HTMLElement>('[data-marca]')]
  const bitsTxt = medidor.querySelector<HTMLElement>('[data-bits]')!
  const unoEnTxt = medidor.querySelector<HTMLElement>('[data-uno-en]')!
  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'es-CO'

  // Valores visibles del medidor: se interpolan entre lecturas para que el
  // número "suba" en vez de saltar.
  const vista = { bits: 0 }
  const pintarMedidor = () => {
    const b = Math.round(vista.bits)
    bitsTxt.textContent = interpolate(T.bits ?? '', { bits: b })
    unoEnTxt.textContent = interpolate(T.unoEn ?? '', { n: Math.round(unosEn(vista.bits)).toLocaleString(locale) })
    marcas.forEach((m, i) => m.toggleAttribute('data-lleno', i < b))
  }

  const pintarLibro = (claves: string[]) => {
    const e = estadoLibro(claves)
    filas.forEach((fila, i) => {
      const l = e[i]
      if (!l) return
      fila.querySelectorAll<HTMLElement>('[data-clave]').forEach((p) => {
        p.toggleAttribute('data-leida', claves.includes(p.dataset.clave!))
      })
      const txt = fila.querySelector<HTMLElement>('[data-estado]')
      if (!txt) return
      const completa = !l.soloSala && l.leidas === l.total
      txt.textContent = l.soloSala
        ? T.estadoSala ?? ''
        : completa
          ? T.estadoLeida ?? ''
          : l.leidas === 0
            ? T.estadoEspera ?? ''
            : interpolate(T.estadoParcial ?? '', { n: l.leidas, total: l.total })
      fila.dataset.estado = l.soloSala ? 'sala' : completa ? 'leida' : l.leidas === 0 ? 'espera' : 'parcial'
    })
  }

  const mostrar = (lectura: Lectura, plantilla: string) => {
    huella?.fijar(parametrosDe(lectura.hash))
    pintarLibro(lectura.claves)
    estado.textContent = interpolate(plantilla, { n: lectura.claves.length, bits: lectura.bits, id: idCorto(lectura.hash) })
    visor.classList.add('huella-lista')
    visor.classList.remove('huella-bloqueada')
    if (reducido) {
      vista.bits = lectura.bits
      pintarMedidor()
    } else {
      gsap.to(vista, { bits: lectura.bits, duration: 1.4, ease: 'expo.out', onUpdate: pintarMedidor })
    }
  }

  let basica: Lectura | null = null
  let completa: Lectura | null = null

  const leer = async (pesadas: boolean): Promise<Lectura> => {
    // Import dinámico: el recolector (canvas, audio, fuentes) solo se
    // descarga si la página llega a leer algo, y las pesadas solo tras el sí.
    const cli = await import('../fingerprint-client')
    const r = pesadas ? await cli.collectSignals() : await cli.collectBasicSignals()
    return { hash: r.hash, claves: r.signals.filter((s) => s.bits > 0).map((s) => s.key), bits: r.entropyBits }
  }

  libro.classList.add('fl-vivo')
  medidor.classList.add('fl-vivo')
  pintarLibro([])
  pintarMedidor()

  const bloqueada = () => {
    estado.textContent = T.bloqueada ?? ''
    visor.classList.add('huella-bloqueada')
  }

  // Primer tiempo: lo que se lee sin pedir nada.
  leer(false)
    .then((l) => {
      basica = l
      if (!consentimiento.checked) mostrar(l, T.detalleBasico ?? '')
    })
    .catch(bloqueada)

  // Segundo tiempo: al aceptar se suman las señales pesadas; al retirar el
  // sí, la huella vuelve a lo que cualquier sitio ve de todos modos.
  consentimiento.addEventListener('change', async () => {
    try {
      if (consentimiento.checked) {
        completa ??= await leer(true)
        if (consentimiento.checked) mostrar(completa, T.detalleCompleto ?? '')
      } else if (basica) {
        mostrar(basica, T.detalleBasico ?? '')
      }
    } catch {
      bloqueada()
    }
  })
}
