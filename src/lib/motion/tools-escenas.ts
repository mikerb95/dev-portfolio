// Motion de los casos de /tools (bajo el hero).
//
// En escritorio, el texto de los casos corre a la izquierda y una ventana fija
// a la derecha muestra la herramienta del caso que se está leyendo: el script
// mueve cada escena de su caso a esa ventana y la activa cuando su caso cruza
// el centro de la pantalla. En móvil (y sin JS, o con movimiento reducido)
// cada escena se queda dentro de su caso.
//
// Cada escena es un bucle que demuestra lo que dice su caso, y solo corre
// mientras se ve: en la ventana, la del caso activo; en móvil, la que está en
// pantalla. Todas parten de un estado inicial que fijan ellas mismas y
// terminan en el estado que pintó el servidor, así que si algo falla, lo que
// queda es la escena completa.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { mmss } from './circuito'

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin)

type Bucle = gsap.core.Timeline

const HEX = '0123456789abcdef'
const DIGITOS = '0123456789'
const q = <T extends Element = HTMLElement>(el: ParentNode, sel: string) => el.querySelector<T & HTMLElement>(sel)
const qa = <T extends Element = HTMLElement>(el: ParentNode, sel: string) => [...el.querySelectorAll<T & HTMLElement>(sel)]
const bucle = (repeatDelay = 0.9): Bucle => gsap.timeline({ repeat: -1, repeatDelay, paused: true })

/** Destello de "sondeo": una sombra interior que se apaga, sin pisar el fondo del estado. */
const destello = (tl: Bucle, el: Element, pos: number, color = 'rgba(0, 242, 255, 0.10)') =>
  tl.fromTo(
    el,
    { boxShadow: `inset 0 0 0 999px ${color}` },
    { boxShadow: 'inset 0 0 0 999px rgba(0, 0, 0, 0)', duration: 0.8, ease: 'power2.out', clearProps: 'boxShadow' },
    pos,
  )

// ── 01 Monitores ─────────────────────────────────────────────────────────

function monitores(el: HTMLElement): Bucle | null {
  const filas = qa(el, '[data-fila]')
  const tienda = filas[2]
  const presupuesto = q(el, '[data-presupuesto]')
  const restante = q(el, '[data-restante]')
  const burn = q(el, '[data-burn]')
  const toast = q(el, '[data-toast]')
  if (!tienda || !presupuesto || !restante || !burn || !toast) return null
  const contenido = q(tienda, '[data-check="contenido"]')!
  const marca = q(contenido, '[data-marca]')!
  const hoy = q(tienda, '[data-hoy]')!
  const inc = q(tienda, '[data-incidente]')!
  const textoInc = inc.textContent ?? ''
  const antes = { ancho: `${presupuesto.dataset.antes}%`, restante: restante.textContent ?? '', burn: burn.textContent ?? '' }
  const despues = { ancho: `${presupuesto.dataset.despues}%`, restante: restante.dataset.despues ?? '', burn: burn.dataset.despues ?? '' }

  const estadoTienda = (mal: boolean) => {
    tienda.dataset.estado = mal ? 'error' : 'ok'
    contenido.classList.toggle('is-mal', mal)
    marca.textContent = mal ? '✕' : '✓'
  }
  const reinicio = () => {
    estadoTienda(false)
    hoy.classList.remove('es-barra-caida')
    inc.classList.remove('is-on', 'is-cerrado')
    inc.textContent = textoInc
    gsap.set(presupuesto, { width: antes.ancho })
    restante.textContent = antes.restante
    burn.textContent = antes.burn
    gsap.set(toast, { autoAlpha: 0 })
  }

  const tl = bucle()
  tl.call(reinicio, [], 0.01)
  // Primera pasada: los tres sondeos validan código, contenido y latencia.
  filas.forEach((f, i) => {
    destello(tl, f, 0.2 + i * 0.35)
    tl.fromTo(qa(f, '.es-check'), { opacity: 0.25 }, { opacity: 1, stagger: 0.1, duration: 0.25 }, 0.25 + i * 0.35)
  })
  // Segunda pasada sobre la tienda: 200, pero con la página equivocada.
  destello(tl, tienda, 2.0, 'rgba(255, 107, 61, 0.14)')
  tl.call(() => estadoTienda(true), [], 2.3)
    .call(() => {
      hoy.classList.add('es-barra-caida')
      inc.classList.add('is-on')
    }, [], 2.5)
    .fromTo(hoy, { scaleY: 0.2 }, { scaleY: 1, duration: 0.5, ease: 'back.out(3)' }, 2.5)
    .fromTo(toast, { autoAlpha: 0, x: 24 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'power3.out' }, 2.8)
    .to(presupuesto, { width: despues.ancho, duration: 1.2, ease: 'power2.inOut' }, 3.1)
    .to(restante, { duration: 0.8, scrambleText: { text: despues.restante, chars: DIGITOS } }, 3.1)
    .to(burn, { duration: 0.8, scrambleText: { text: despues.burn, chars: DIGITOS } }, 3.1)
  // Tercera pasada: vuelve el contenido esperado y el incidente se cierra.
  destello(tl, tienda, 5.4)
  tl.call(() => {
    estadoTienda(false)
    inc.classList.add('is-cerrado')
  }, [], 5.7)
    .to(inc, { duration: 0.5, scrambleText: { text: inc.dataset.cerrado ?? '', chars: 'lowerCase' } }, 5.7)
    .to(toast, { autoAlpha: 0, x: 24, duration: 0.35 }, 6.2)
    .to({}, { duration: 1.6 })
  return tl
}

// ── 02 P&L ───────────────────────────────────────────────────────────────

function pnl(el: HTMLElement): Bucle | null {
  const filas = qa(el, '[data-fila]')
  const total = q(el, '[data-total]')
  const margen = q(el, '[data-margen]')
  const pagada = q(el, '[data-pagada]')
  const pendiente = q(el, '[data-parte="pendiente"]')
  if (!total || !margen || !pagada || !pendiente) return null
  const partes = qa(el, '[data-parte]')
  const margenAntes = margen.textContent ?? ''

  const reinicio = () => {
    filas.forEach((f) => {
      const mes = q(f, '[data-mes]')
      if (mes) mes.textContent = '·'
    })
    total.textContent = '·'
    margen.textContent = '·'
    pendiente.classList.remove('is-cobrado')
    gsap.set(pagada, { autoAlpha: 0 })
    gsap.set(partes, { scaleX: 0 })
    gsap.set(qa(el, '[data-div]'), { opacity: 0 })
  }

  const tl = bucle(1.2)
  tl.call(reinicio, [], 0.01)
  // Cada servicio llega con su ciclo y su moneda, y se normaliza a USD al mes.
  filas.forEach((f, i) => {
    const t0 = 0.3 + i * 0.55
    const mes = q(f, '[data-mes]')!
    destello(tl, f, t0)
    tl.fromTo(q(f, '[data-div]'), { opacity: 0, x: -8 }, { opacity: 0.85, x: 0, duration: 0.3 }, t0 + 0.1).to(
      mes,
      { duration: 0.5, scrambleText: { text: mes.dataset.mes ?? '', chars: DIGITOS } },
      t0 + 0.3,
    )
  })
  tl.to(total, { duration: 0.6, scrambleText: { text: total.dataset.total ?? '', chars: DIGITOS } }, 2.7)
    .to(partes, { scaleX: 1, duration: 0.6, ease: 'power3.out', stagger: 0.22 }, 3.2)
    .to(margen, { duration: 0.8, scrambleText: { text: margenAntes, chars: DIGITOS } }, 4.0)
    // La factura pendiente se paga: pasa a cobrado y el margen se recalcula.
    .fromTo(pagada, { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, 5.6)
    .call(() => pendiente.classList.add('is-cobrado'), [], 5.8)
    .to(margen, { duration: 0.8, scrambleText: { text: margen.dataset.despues ?? '', chars: DIGITOS } }, 5.9)
    .to({}, { duration: 2 })
  return tl
}

// ── 03 Seguimiento ───────────────────────────────────────────────────────

function seguimiento(el: HTMLElement): Bucle | null {
  const items = qa(el, '[data-item]')
  const interno = q(el, '[data-interno]')
  const oculto = q(el, '[data-oculto]')
  const luz = q(el, '[data-toggle-luz]')
  const ops = qa(el, '[data-op]')
  if (!interno || !oculto || !luz || ops.length < 2) return null

  const vista = (i: number, animar: boolean) => {
    const op = ops[i]
    ops.forEach((o, j) => o.classList.toggle('is-on', j === i))
    const pos = { x: op.offsetLeft - 3, width: op.offsetWidth }
    if (animar) gsap.to(luz, { ...pos, duration: 0.45, ease: 'power3.inOut' })
    else gsap.set(luz, pos)
  }
  vista(0, false)

  const reinicio = () => {
    vista(0, false)
    gsap.set(items, { autoAlpha: 0, y: 8 })
    gsap.set(interno, { clearProps: 'height,paddingTop,paddingBottom,borderWidth,marginTop' })
    gsap.set(oculto, { opacity: 0 })
  }

  const tl = bucle(1)
  tl.call(reinicio, [], 0.01)
    // El historial se arma del más viejo al más nuevo.
    .to(items, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power3.out', stagger: { each: 0.3, from: 'end' } }, 0.2)
    .call(() => vista(1, true), [], 2.4)
    .to(oculto, { opacity: 1, duration: 0.3 }, 2.8)
    // En la vista del cliente, lo interno no existe: se cierra, no se atenúa.
    .to(interno, { height: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0, marginTop: -6, duration: 0.5, ease: 'power3.inOut' }, 3.9)
    .call(() => vista(0, true), [], 6.0)
    .to(interno, { height: 'auto', paddingTop: 8, paddingBottom: 8, borderWidth: 1, marginTop: 0, duration: 0.5, ease: 'power3.inOut' }, 6.1)
    .to(oculto, { opacity: 0, duration: 0.3 }, 6.4)
    .call(() => gsap.set(interno, { clearProps: 'height,paddingTop,paddingBottom,borderWidth,marginTop' }), [], 6.7)
    .to({}, { duration: 1.4 })
  return tl
}

// ── 04 Bóveda ────────────────────────────────────────────────────────────

function boveda(el: HTMLElement): Bucle | null {
  const claro = q(el, '[data-claro]')
  const cursor = q(el, '[data-cursor]')
  const guardar = q(el, '[data-guardar]')
  const paso = q(el, '[data-paso]')
  const byte = q(el, '[data-byte]')
  const alt = q(el, '[data-alt]')
  const rechazo = q(el, '[data-rechazo]')
  const cifra = q(el, '[data-cifra]')
  if (!claro || !cursor || !guardar || !paso || !byte || !alt || !rechazo || !cifra) return null
  const texto = claro.dataset.texto ?? ''
  const originalByte = byte.textContent ?? ''
  const trozos = [q(el, '.es-iv'), q(el, '.es-tag'), q(el, '[data-ct-a]'), byte, q(el, '[data-ct-b]')].filter(Boolean) as HTMLElement[]
  const originales = trozos.map((t) => t.textContent ?? '')
  const escrito = { n: 0 }

  const reinicio = () => {
    claro.textContent = ''
    escrito.n = 0
    byte.textContent = originalByte
    byte.classList.remove('is-alterado')
    trozos.forEach((t) => (t.textContent = ''))
    gsap.set([alt, rechazo], { autoAlpha: 0 })
    gsap.set(paso, { opacity: 0.3 })
    gsap.set(cursor, { opacity: 1 })
  }

  const tl = bucle(1.2)
  tl.call(reinicio, [], 0.01)
    .to(escrito, {
      n: texto.length,
      duration: 1.1,
      ease: 'none',
      onUpdate: () => (claro.textContent = texto.slice(0, Math.round(escrito.n))),
    }, 0.3)
    .to(guardar, { scale: 0.9, duration: 0.1, yoyo: true, repeat: 1 }, 1.6)
    .set(cursor, { opacity: 0 }, 1.6)
    .to(paso, { opacity: 1, duration: 0.3 }, 1.8)
  // El valor llega a la base ya cifrado: iv, tag y texto cifrado, cada uno en su color.
  trozos.forEach((t, i) => {
    tl.to(t, { duration: 0.7, scrambleText: { text: originales[i], chars: HEX, speed: 1 } }, 2.0 + Math.min(i, 2) * 0.25)
  })
  // Alguien cambia un byte en la base: GCM no lo descifra "casi bien", lo rechaza.
  tl.call(() => {
    byte.textContent = byte.dataset.alterado ?? originalByte
    byte.classList.add('is-alterado')
  }, [], 4.2)
    .fromTo(alt, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35 }, 4.4)
    .fromTo(rechazo, { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, 5.2)
    .fromTo(cifra, { x: 0 }, { x: 4, duration: 0.06, yoyo: true, repeat: 5, clearProps: 'transform' }, 5.2)
    .to({}, { duration: 2.2 })
  return tl
}

// ── 05 Pipeline ──────────────────────────────────────────────────────────

function pipeline(el: HTMLElement): Bucle | null {
  const etapas = qa(el, '[data-etapa]')
  const luz = q(el, '[data-ci-luz]')
  const rollback = q(el, '[data-rollback]')
  const sha = q(el, '[data-run-sha]')
  const prod = q(el, '[data-prod]')
  const filas = qa(el, '[data-historial] > li')
  if (!luz || !rollback || !sha || !prod || etapas.length === 0 || filas.length < 3) return null
  const [filaFallo, filaExito] = filas

  const estado = (i: number, e: string) => (etapas[i].dataset.estado = e)
  const reinicio = () => {
    etapas.forEach((_, i) => estado(i, 'cola'))
    gsap.set(luz, { scaleX: 0 })
    gsap.set(rollback, { autoAlpha: 0 })
    gsap.set([filaFallo, filaExito], { autoAlpha: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginBottom: -5 })
    prod.textContent = '8c04b77'
  }
  const corrida = (tl: Bucle, t0: number, id: string, falla: boolean) => {
    tl.call(() => {
      etapas.forEach((_, i) => estado(i, 'cola'))
      sha.textContent = id
    }, [], t0)
      .set(luz, { scaleX: 0 }, t0)
    etapas.forEach((_, i) => {
      const t = t0 + 0.2 + i * 0.5
      tl.call(() => estado(i, 'curso'), [], t)
        .to(luz, { scaleX: i / (etapas.length - 1), duration: 0.45, ease: 'power1.inOut' }, t)
        .call(() => estado(i, falla && i === etapas.length - 1 ? 'fallo' : 'listo'), [], t + 0.45)
      // El deploy cambia lo que está en producción antes de la verificación.
      if (i === 3) tl.to(prod, { duration: 0.4, scrambleText: { text: id, chars: HEX } }, t + 0.45)
    })
    return t0 + 0.2 + etapas.length * 0.5
  }
  const mostrar = (tl: Bucle, fila: HTMLElement, t: number) =>
    tl.to(fila, { autoAlpha: 1, height: 'auto', paddingTop: 7, paddingBottom: 7, marginBottom: 0, duration: 0.45, ease: 'power3.out', clearProps: 'height,paddingTop,paddingBottom,marginBottom' }, t)

  const tl = bucle(1)
  tl.call(reinicio, [], 0.01)
  const finA = corrida(tl, 0.2, 'a3f9e21', false)
  mostrar(tl, filaExito, finA + 0.1)
  const finB = corrida(tl, finA + 1, 'f51d0ac', true)
  // El health check falla: el pipeline revierte solo al último deploy sano.
  tl.fromTo(rollback, { autoAlpha: 0, y: -6 }, { autoAlpha: 1, y: 0, duration: 0.4 }, finB + 0.2)
    .to(luz, { scaleX: 0.75, duration: 0.6, ease: 'power2.inOut' }, finB + 0.3)
    .to(prod, { duration: 0.5, scrambleText: { text: 'a3f9e21', chars: HEX } }, finB + 0.6)
  mostrar(tl, filaFallo, finB + 1.1)
  tl.to({}, { duration: 1.6 })
  return tl
}

// ── 06 Caos ──────────────────────────────────────────────────────────────

function caos(el: HTMLElement): Bucle | null {
  const flag = q(el, '[data-flag]')
  const ttl = flag ? q(flag, '[data-ttl]') : null
  const tienda = q(el, '[data-carril="tienda"]')
  const admin = q(el, '[data-carril="admin"]')
  const detectado = q(el, '[data-detectado]')
  const panico = q(el, '[data-panico]')
  if (!flag || !ttl || !tienda || !admin || !detectado || !panico) return null
  const ttlMax = ttl.dataset.ttl ?? '15:00'
  const [mm, ss] = ttlMax.split(':').map(Number)
  const reloj = { s: mm * 60 + ss }

  const emitir = () => {
    for (const carril of [tienda, admin]) {
      const resp = q(carril, '[data-resp]')
      if (!resp) continue
      const mal = carril.dataset.estado === 'mal'
      const pill = document.createElement('span')
      pill.className = `es-resp ${mal ? 'es-resp-mal' : 'es-resp-ok'}`
      pill.textContent = mal ? '500' : '200'
      resp.prepend(pill)
      gsap.fromTo(pill, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.3 })
      while (resp.children.length > 9) resp.lastElementChild?.remove()
    }
  }
  const encender = (on: boolean) => {
    if (on) flag.dataset.on = ''
    else delete flag.dataset.on
    tienda.dataset.estado = on ? 'mal' : 'ok'
  }
  const reinicio = () => {
    encender(false)
    reloj.s = mm * 60 + ss
    ttl.textContent = 'TTL -'
    gsap.set(detectado, { autoAlpha: 0 })
  }

  const tl = bucle(0.6)
  tl.call(reinicio, [], 0.01)
  const DUR = 8
  // Peticiones reales al ritmo de la escena: /admin nunca recibe caos.
  for (let t = 0.1; t < DUR; t += 0.45) tl.call(emitir, [], t)
  tl.call(() => encender(true), [], 1.2)
    .call(() => (ttl.textContent = `TTL ${mmss(reloj.s)}`), [], 1.2)
    .to(reloj, { s: reloj.s - 38, duration: 3.8, ease: 'none', onUpdate: () => (ttl.textContent = `TTL ${mmss(reloj.s)}`) }, 1.3)
    .fromTo(detectado, { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.4 }, 3.1)
    // Pánico: todo se apaga de una vez, sin esperar al TTL.
    .to(panico, { scale: 0.93, duration: 0.12, yoyo: true, repeat: 1 }, 5.2)
    .call(() => {
      encender(false)
      ttl.textContent = 'TTL -'
    }, [], 5.3)
    .to(detectado, { autoAlpha: 0, duration: 0.4 }, 6.6)
    .to({}, { duration: DUR - 7 })
  return tl
}

// ── 07 Seguridad ─────────────────────────────────────────────────────────

function seguridad(el: HTMLElement): Bucle | null {
  const eventos = qa(el, '[data-eventos] > li')
  const cols = qa(el, '[data-col]')
  const marca = q(el, '[data-marca-anomalia]')
  const escalones = qa(el, '[data-escalon]')
  if (!marca || eventos.length === 0 || escalones.length < 3) return null

  const reinicio = () => {
    gsap.set(eventos, { autoAlpha: 0, y: -8 })
    gsap.set(cols, { scaleY: 0 })
    gsap.set(marca, { autoAlpha: 0 })
    escalones.forEach((e) => e.classList.remove('is-on'))
  }
  const escalar = (i: number) => escalones[i].classList.add('is-on')

  const tl = bucle(1)
  tl.call(reinicio, [], 0.01)
  // Los eventos llegan del más viejo al más nuevo; el mismo origen reincide.
  const orden = [...eventos].reverse()
  orden.forEach((ev, i) => {
    const t = 0.3 + i * 0.7
    tl.to(ev, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out' }, t)
    const repetido = orden.slice(0, i).some((o) => o.dataset.ip === ev.dataset.ip)
    if (i === 0) tl.call(() => escalar(0), [], t + 0.2)
    if (repetido) {
      destello(tl, ev, t + 0.2, 'rgba(255, 107, 61, 0.18)')
      tl.call(() => escalar(1), [], t + 0.3)
    }
  })
  tl.to(cols.slice(0, -1), { scaleY: 1, duration: 0.4, ease: 'power2.out', stagger: 0.05 }, 0.5)
    .to(cols.at(-1)!, { scaleY: 1, duration: 0.6, ease: 'back.out(1.6)' }, 3.4)
    .fromTo(marca, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 3.9)
    .call(() => escalar(2), [], 4.6)
    .to({}, { duration: 2.4 })
  return tl
}

const CONSTRUCTORES: Record<string, (el: HTMLElement) => Bucle | null> = {
  monitors: monitores,
  pnl,
  seguimiento,
  vault: boveda,
  pipeline,
  chaos: caos,
  security: seguridad,
}

// ── Montaje ──────────────────────────────────────────────────────────────

export function montarCasos(raiz: HTMLElement, opciones: { reducido: boolean }): void {
  if (opciones.reducido) return
  const casos = qa(raiz, '[data-caso]')
  const pila = q(raiz, '[data-pila]')
  const rutaVentana = q(raiz, '[data-ventana-ruta]')
  const indice = qa(raiz, '[data-indice]')

  // Una escena por caso, con su bucle. Si una escena no se puede construir,
  // se queda quieta y completa: las demás siguen.
  const escenas = casos.map((caso) => {
    const num = caso.dataset.caso ?? ''
    const caja = q(raiz, `[data-escena-caja="${num}"]`)
    const el = caja ? q(caja, '[data-escena]') : null
    let tl: Bucle | null = null
    if (el) {
      try {
        tl = CONSTRUCTORES[el.dataset.escena ?? '']?.(el) ?? null
      } catch (err) {
        console.warn(`[tools] escena ${num} sin motion`, err)
        tl?.kill()
        tl = null
      }
    }
    return { num, caso, caja, el, tl }
  })

  let oculta = document.visibilityState === 'hidden'
  let activa = -1
  let enVentana = false
  // Escenas en pantalla en modo móvil, para reanudarlas al volver a la pestaña.
  const enPantalla = new Set<Bucle>()

  function activar(i: number, animar = true) {
    if (i === activa) return
    const prev = escenas[activa]
    const sig = escenas[i]
    activa = i
    if (!sig?.el) return
    prev?.tl?.pause()
    if (prev?.el) {
      prev.el.classList.remove('is-activa')
      if (animar) gsap.to(prev.el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.45, ease: 'power3.in' })
      else gsap.set(prev.el, { clipPath: 'inset(0% 0% 100% 0%)' })
    }
    sig.el.classList.add('is-activa')
    // Barrido de abajo hacia arriba, como una vista del panel que se carga.
    if (animar) gsap.fromTo(sig.el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'power3.out', delay: 0.15 })
    else gsap.set(sig.el, { clipPath: 'inset(0% 0% 0% 0%)' })
    const ruta = indice[i]?.dataset.ruta ?? ''
    if (rutaVentana) {
      if (animar) gsap.to(rutaVentana, { duration: 0.5, scrambleText: { text: ruta, chars: 'lowerCase' } })
      else rutaVentana.textContent = ruta
    }
    indice.forEach((a, j) => a.classList.toggle('is-activo', j === i))
    if (!oculta) sig.tl?.restart()
  }

  const mm = gsap.matchMedia()

  // Escritorio: la ventana fija.
  mm.add('(min-width: 1024px)', () => {
    if (!pila) return
    enVentana = true
    raiz.classList.add('modo-ventana')
    for (const e of escenas) {
      if (!e.el) continue
      e.el.dataset.caso = e.num
      pila.appendChild(e.el)
      gsap.set(e.el, { clipPath: 'inset(0% 0% 100% 0%)' })
    }
    activa = -1
    activar(0, false)
    escenas.forEach((e) => e.tl?.pause())

    const triggers = escenas.map((e, i) =>
      ScrollTrigger.create({
        trigger: e.caso,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => self.isActive && activar(i),
        onUpdate: (self) => {
          const barra = indice[i]?.querySelector<HTMLElement>('span > span')
          if (barra) gsap.set(barra, { scaleX: self.progress })
        },
      }),
    )
    // Con la sección fuera de pantalla, ni la escena activa gasta fotogramas.
    const seccion = ScrollTrigger.create({
      trigger: raiz,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => {
        const tl = escenas[activa]?.tl
        if (!tl) return
        if (self.isActive && !oculta) tl.resume()
        else tl.pause()
      },
    })
    if (!seccion.isActive) escenas[activa]?.tl?.pause()
    else if (!oculta) escenas[activa]?.tl?.restart()

    return () => {
      enVentana = false
      triggers.forEach((t) => t.kill())
      seccion.kill()
      for (const e of escenas) {
        if (!e.el || !e.caja) continue
        e.tl?.pause()
        e.el.classList.remove('is-activa')
        gsap.set(e.el, { clearProps: 'clipPath' })
        e.caja.appendChild(e.el)
      }
      raiz.classList.remove('modo-ventana')
      activa = -1
    }
  })

  // Móvil y tableta: cada escena en su caso, y corre solo mientras se ve.
  mm.add('(max-width: 1023px)', () => {
    const io = new IntersectionObserver(
      (entradas) => {
        for (const en of entradas) {
          const e = escenas.find((x) => x.el === en.target)
          if (!e?.tl) continue
          if (en.isIntersecting) enPantalla.add(e.tl)
          else enPantalla.delete(e.tl)
          if (en.isIntersecting && !oculta) e.tl.play()
          else e.tl.pause()
        }
      },
      { threshold: 0.3 },
    )
    escenas.forEach((e) => e.el && io.observe(e.el))
    return () => {
      io.disconnect()
      enPantalla.clear()
      escenas.forEach((e) => e.tl?.pause())
    }
  })

  document.addEventListener('visibilitychange', () => {
    oculta = document.visibilityState === 'hidden'
    if (oculta) escenas.forEach((e) => e.tl?.pause())
    else if (enVentana) escenas[activa]?.tl?.resume()
    else enPantalla.forEach((tl) => tl.resume())
  })
}
