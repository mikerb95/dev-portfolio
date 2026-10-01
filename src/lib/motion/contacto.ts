// Motion de /contact: la ruta real del mensaje, el celular que recibe el
// aviso y la franja con la hora de Bogotá.
//
// El script de la página sigue siendo dueño del formulario (validación,
// envío, mensajes de estado) y le cuenta a la ruta lo que pasa: qué campos
// están listos, cuándo sale el envío y qué respondió el servidor. La ruta no
// adivina: se detiene donde el envío se detuvo de verdad (tramoFallido).
//
// Con movimiento reducido los estados cambian igual, sin el viaje del paquete
// ni la caída del aviso. Módulo solo de navegador.

import gsap from 'gsap'
import { avisoContacto } from '../contacto-aviso'
import { interpolate } from '../../i18n'
import type { Dictionary } from '../../i18n'
import {
  CAMPOS_REQUERIDOS,
  esDiaHabil,
  formatoBogota,
  limiteRespuesta,
  partesBogota,
  tramoFallido,
  type CampoRequerido,
  type Resultado,
} from './contacto-datos'
import { revelarPalabras } from './efectos'
import { montarLanding } from './landing'

type TextosContacto = Dictionary['contact']

export interface DatosForm {
  name: string
  email: string
  subject: string
  body: string
}

export interface RutaContacto {
  /** Cada cambio del formulario: qué campos valen y lo escrito. */
  campos(validos: Record<CampoRequerido, boolean>, datos: DatosForm): void
  /** El envío salió del navegador. */
  enviar(): void
  /** Lo que respondió el servidor (o 'red' si ni siquiera hubo respuesta). */
  resultado(r: Resultado, mensajeServidor?: string): void
}

const nada: RutaContacto = { campos() {}, enviar() {}, resultado() {} }
const dosDigitos = (n: number) => String(n).padStart(2, '0')

export function montarRuta(c: TextosContacto, reducido: boolean): RutaContacto {
  const raiz = document.querySelector<HTMLElement>('[data-ruta]')
  if (!raiz) return nada
  const r = c.ruta
  const tramos = Array.from(raiz.querySelectorAll<HTMLElement>('[data-tramo]'))
  const paquete = raiz.querySelector<HTMLElement>('.rm-paquete')!
  const falla = raiz.querySelector<HTMLElement>('[data-falla]')!
  const pips = Array.from(raiz.querySelectorAll<HTMLElement>('[data-pip]'))
  const pipsTxt = raiz.querySelector<HTMLElement>('[data-pips-txt]')
  const cel = raiz.querySelector<HTMLElement>('[data-cel]')!
  const etq = raiz.querySelector<HTMLElement>('[data-cel-etq]')!
  const aviso = raiz.querySelector<HTMLElement>('[data-aviso]')!
  const avisoT = raiz.querySelector<HTMLElement>('[data-aviso-t]')!
  const avisoC = raiz.querySelector<HTMLElement>('[data-aviso-c]')!

  const estado = (i: number, e: 'espera' | 'activo' | 'listo' | 'fallo') => (tramos[i].dataset.estado = e)
  const descripcion = (i: number, texto: string) => {
    tramos[i].querySelector<HTMLElement>('[data-tramo-d]')!.textContent = texto
  }

  // Centro de un nodo dentro de la lista. offsetLeft/offsetTop y no
  // getBoundingClientRect: la columna puede estar entrando desplazada.
  const centro = (i: number) => {
    const t = tramos[i]
    const n = t.querySelector<HTMLElement>('.rm-nodo')!
    return { x: t.offsetLeft + n.offsetLeft + n.offsetWidth / 2 - 11, y: t.offsetTop + n.offsetTop + n.offsetHeight / 2 - 11 }
  }

  // Un envío en curso o terminado congela la ruta hasta que se vuelva a
  // escribir: el formulario se vacía al enviar con éxito, y ese vaciado no
  // puede borrar el resultado que la persona acaba de ver.
  let congelada = false
  let viaje: Promise<void> = Promise.resolve()

  const reiniciar = () => {
    congelada = false
    tramos.forEach((_, i) => {
      estado(i, 'espera')
      descripcion(i, r.tramos[i].d)
    })
    falla.hidden = true
    gsap.killTweensOf(paquete)
    gsap.set(paquete, { opacity: 0 })
    paquete.style.removeProperty('background')
    aviso.dataset.estado = 'borrador'
    cel.removeAttribute('data-llego')
    etq.textContent = r.celular.asi
  }

  const pintarAviso = (d: DatosForm) => {
    const a = avisoContacto({
      name: d.name || r.celular.nombreVacio,
      email: d.email || '…',
      subject: d.subject,
      body: d.body,
    })
    avisoT.textContent = a.titulo
    avisoC.textContent = d.body ? a.cuerpo : r.celular.cuerpoVacio
  }

  const mover = (i: number, dur: number) => {
    const p = centro(i)
    if (reducido) {
      gsap.set(paquete, p)
      return Promise.resolve()
    }
    return new Promise<void>((fin) => {
      gsap.to(paquete, { ...p, duration: dur, ease: 'power2.inOut', onComplete: () => fin() })
    })
  }

  const caerAviso = () => {
    aviso.dataset.estado = 'llego'
    cel.setAttribute('data-llego', '')
    etq.textContent = r.celular.llego
    if (reducido) return
    gsap.fromTo(aviso, { y: -46, scale: 0.94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.75, ease: 'back.out(1.7)', clearProps: 'transform,opacity' })
    // El celular vibra: tres sacudidas cortas, como al llegar un push.
    gsap.fromTo(cel, { x: 0 }, { keyframes: { x: [0, -3, 3, -2, 2, 0] }, duration: 0.45, delay: 0.15, ease: 'none', clearProps: 'transform' })
  }

  return {
    campos(validos, datos) {
      const algo = Object.values(datos).some(Boolean)
      if (congelada) {
        if (!algo) return
        reiniciar()
      }
      pintarAviso(datos)
      const n = CAMPOS_REQUERIDOS.filter((k) => validos[k]).length
      pips.forEach((p) => p.classList.toggle('ok', validos[p.dataset.pip as CampoRequerido]))
      if (pipsTxt) pipsTxt.textContent = interpolate(r.camposListos, { n, total: CAMPOS_REQUERIDOS.length })
      const listo = n === CAMPOS_REQUERIDOS.length
      estado(0, listo ? 'listo' : algo ? 'activo' : 'espera')
      raiz.toggleAttribute('data-preparado', listo)
    },

    enviar() {
      congelada = true
      raiz.removeAttribute('data-preparado')
      falla.hidden = true
      estado(0, 'listo')
      estado(1, 'activo')
      descripcion(1, r.revisando)
      gsap.killTweensOf(paquete)
      gsap.set(paquete, { ...centro(0), opacity: 1 })
      viaje = mover(1, 0.55)
    },

    resultado(res, mensajeServidor) {
      const k = tramoFallido(res)
      viaje = viaje.then(async () => {
        if (k === null) {
          estado(1, 'listo')
          descripcion(1, r.tramos[1].d)
          await mover(2, 0.4)
          estado(2, 'listo')
          await mover(3, 0.4)
          estado(3, 'listo')
          descripcion(3, interpolate(r.llegaAntes, { fecha: formatoBogota(limiteRespuesta(Date.now()), c.franja.dias, c.franja.meses) }))
          if (!reducido) gsap.to(paquete, { opacity: 0, scale: 2.4, duration: 0.5, ease: 'power2.out', clearProps: 'scale' })
          else gsap.set(paquete, { opacity: 0 })
          caerAviso()
          return
        }
        const motivo = k === 0 ? r.sinRed : k === 2 ? r.falloGuardar : (mensajeServidor ?? c.form.errorStatus)
        if (k === 2) {
          estado(1, 'listo')
          descripcion(1, r.tramos[1].d)
          await mover(2, 0.4)
        }
        for (let i = k + 1; i < tramos.length; i++) estado(i, 'espera')
        if (k === 0) gsap.set(paquete, { opacity: 0 })
        else paquete.style.background = '#ff6b3d'
        estado(k, 'fallo')
        descripcion(k, motivo)
        falla.textContent = motivo
        falla.hidden = false
      })
    },
  }
}

// ── Hora de Bogotá ─────────────────────────────────────────────────────────

function montarReloj(c: TextosContacto) {
  const f = c.franja
  const hora = document.querySelector<HTMLElement>('[data-franja-hora]')
  const dia = document.querySelector<HTMLElement>('[data-franja-dia]')
  const limite = document.querySelector<HTMLElement>('[data-franja-limite]')
  const franja = document.querySelector<HTMLElement>('[data-franja]')
  const celHora = document.querySelector<HTMLElement>('[data-cel-hora]')
  const celReloj = document.querySelector<HTMLElement>('[data-cel-reloj]')
  const celFecha = document.querySelector<HTMLElement>('[data-cel-fecha]')

  const pintar = () => {
    const ahora = Date.now()
    const p = partesBogota(ahora)
    const hhmm = `${dosDigitos(p.h)}:${dosDigitos(p.m)}`
    if (hora) hora.textContent = interpolate(f.hora, { hora: hhmm })
    if (dia) dia.textContent = esDiaHabil(ahora) ? f.habil : f.finde
    if (limite) limite.textContent = interpolate(f.limite, { fecha: formatoBogota(limiteRespuesta(ahora), f.dias, f.meses) })
    franja?.setAttribute('data-vivo', esDiaHabil(ahora) ? 'habil' : 'finde')
    if (celHora) celHora.textContent = hhmm
    if (celReloj) celReloj.textContent = hhmm
    if (celFecha) celFecha.textContent = `${f.dias[p.dow]} ${p.dia} ${f.meses[p.mes]}`
  }
  pintar()
  // Resolución de minuto: basta con mirar cada 15 s, y con la pestaña oculta
  // no se mira.
  setInterval(() => {
    if (document.visibilityState === 'visible') pintar()
  }, 15_000)
}

// ── Montaje ────────────────────────────────────────────────────────────────

export function montarContacto(c: TextosContacto, reducido: boolean): RutaContacto {
  montarReloj(c)
  const ruta = montarRuta(c, reducido)
  if (!reducido) {
    try {
      const h1 = document.querySelector<HTMLElement>('[data-contacto-titulo]')
      if (h1) revelarPalabras(h1)
    } catch (err) {
      console.warn('[contacto] titular sin animación', err)
    }
    montarLanding()
  }
  return ruta
}
