// Motor del reloj de sesiones de /log sobre un lienzo 2D. Mientras GitHub
// responde, un cabezal barre la rejilla vacía ("leyendo"); cuando llegan los
// datos, el cabezal recorre el mes de arriba (hace 30 días) abajo (hoy): los
// commits de cada fila caen en su hora y enseguida se funden en sesiones,
// mientras las cifras de arriba se van sumando con lo que se dibuja. Al
// terminar, la racha se enciende día a día y el histograma por hora sube.
//
// Solo pinta cuando hay algo que mover (escaneo, resalte, lectura, commits
// nuevos) y nunca fuera de pantalla. Con movimiento reducido se pinta el
// estado final de una vez.
//
// Módulo solo de navegador.

import { diaBogota, horaBogota } from '../actividad'
import {
  anchoUtil,
  baseHisto,
  cabezal,
  duracionEscaneo,
  faseFila,
  fechaDeDia,
  leerEn,
  medidasReloj,
  minutosDe,
  reloj24,
  xDeHora,
  yDeFila,
  type Lectura,
  type Medidas,
  type ModeloReloj,
  type ModoResalte,
} from './reloj'

export type TextosReloj = {
  ahora: string
  porHora: string
  horasDia: string
  privado: string
  privadoNota: string
  sesion: string
  sesionDetalle: string
  sesionUno: string
  sinCommits: string
  fila: string
  filaUna: string
  fuera: string
  hoy: string
}

export type Progreso = {
  horasMes: number
  horasSemana: number
  commits: number
  racha: number
  terminado: boolean
}

export type Reloj = {
  /** Pinta un modelo. La primera vez lo escanea; después marca los commits nuevos. */
  cargar(modelo: ModeloReloj, nuevos?: Set<number>): void
  resaltar(modo: ModoResalte | null): void
  destruir(): void
}

type Opciones = {
  reducido: boolean
  textos: TextosReloj
  intl: string
  /** Lo que se publica de un commit público (el reloj solo guarda su índice). */
  describir: (ref: number) => { sha: string; repo: string; mensaje: string } | null
  alProgreso?: (p: Progreso) => void
}

// Paleta en hex: los tweens y el lienzo no entienden var(--color).
const CIAN = '0, 242, 255'
const CIAN_CLARO = '#9bfaff'
const GRIS = '#85858f'
const LIMA = '201, 255, 91'
const TINTA = '133, 133, 143'
const FUENTE = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

const f2 = (n: number) => Math.round(n * 10) / 10
const interpolar = (plantilla: string, v: Record<string, string | number>) =>
  plantilla.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

/** Sprite del brillo de un commit público: un drawImage por punto en vez de shadowBlur. */
function spriteBrillo(dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  const r = Math.round(6 * dpr)
  c.width = c.height = r * 2
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, `rgba(${CIAN}, 0.3)`)
  grad.addColorStop(0.4, `rgba(${CIAN}, 0.08)`)
  grad.addColorStop(1, `rgba(${CIAN}, 0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, r * 2, r * 2)
  return c
}

/** Rayado diagonal: los 30 min previos y lo que queda antes de la ventana. */
function rayado(ctx: CanvasRenderingContext2D, color: string, paso: number): CanvasPattern | null {
  const c = document.createElement('canvas')
  c.width = c.height = paso
  const g = c.getContext('2d')!
  g.strokeStyle = color
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(0, paso)
  g.lineTo(paso, 0)
  g.moveTo(-1, 1)
  g.lineTo(1, -1)
  g.moveTo(paso - 1, paso + 1)
  g.lineTo(paso + 1, paso - 1)
  g.stroke()
  return ctx.createPattern(c, 'repeat')
}

export function montarReloj(raiz: HTMLElement, op: Opciones): Reloj {
  const lienzo = raiz.querySelector<HTMLCanvasElement>('canvas')!
  const ctx = lienzo.getContext('2d')
  const tip = raiz.querySelector<HTMLElement>('[data-reloj-tip]')
  const marcaAhora = raiz.querySelector<HTMLElement>('[data-reloj-ahora]')
  if (!ctx) throw new Error('sin contexto 2D')

  const FILAS = 31
  let m: Medidas = medidasReloj(raiz.clientWidth || 360, FILAS)
  let dpr = Math.min(window.devicePixelRatio || 1, 2)
  let brillo = spriteBrillo(dpr)
  let rayaPrevio = rayado(ctx, `rgba(${CIAN}, 0.45)`, 4)
  let rayaFuera = rayado(ctx, 'rgba(255,255,255,0.07)', 5)

  let modelo: ModeloReloj | null = null
  let horasSemanaFila: number[] = []
  // Reloj propio en segundos, con el paso acotado: si la pestaña se oculta a
  // mitad del escaneo, al volver sigue donde iba en vez de saltar al final.
  let tiempo = 0
  let tEscaneo: number | null = null
  let escaneado = false
  let tFinal: number | null = null
  let resalte: ModoResalte | null = null
  let mezcla = 0
  let lectura: Lectura = null
  let puntero: { x: number; y: number } | null = null
  let ondas: { x: number; y: number; t0: number }[] = []
  let visible = false
  let raf = 0
  let ultimo = 0

  const formatoDia = new Intl.DateTimeFormat(op.intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const formatoNum = new Intl.NumberFormat(op.intl, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const diaSemana = new Intl.DateTimeFormat(op.intl, { weekday: 'narrow', timeZone: 'UTC' })

  function medir() {
    const ancho = raiz.clientWidth
    if (!ancho) return
    m = medidasReloj(ancho, FILAS)
    const nuevoDpr = Math.min(window.devicePixelRatio || 1, 2)
    if (nuevoDpr !== dpr) {
      dpr = nuevoDpr
      brillo = spriteBrillo(dpr)
    }
    lienzo.width = Math.round(m.ancho * dpr)
    lienzo.height = Math.round(m.alto * dpr)
    lienzo.style.height = `${m.alto}px`
    raiz.style.height = `${m.alto}px`
    rayaPrevio = rayado(ctx!, `rgba(${CIAN}, 0.45)`, 4)
    rayaFuera = rayado(ctx!, 'rgba(255,255,255,0.07)', 5)
    colocarAhora()
  }

  function colocarAhora() {
    if (!marcaAhora) return
    if (!modelo || (!escaneado && !op.reducido)) {
      marcaAhora.hidden = true
      return
    }
    marcaAhora.hidden = false
    marcaAhora.style.left = `${xDeHora(m, modelo.hAhora)}px`
    marcaAhora.style.top = `${yDeFila(m, modelo.dias.length - 1)}px`
    marcaAhora.style.height = `${m.altoFila}px`
  }

  // ── Ciclo ────────────────────────────────────────────────────────────────

  function animando(): boolean {
    if (!modelo) return !op.reducido // cabezal de "leyendo"
    if (tEscaneo !== null && !escaneado) return true
    if (tFinal !== null && tiempo - tFinal < 1.6) return true
    if (Math.abs(mezcla - (resalte ? 1 : 0)) > 0.01) return true
    return ondas.length > 0
  }

  function pedir() {
    if (!raf && visible) {
      ultimo = performance.now()
      raf = requestAnimationFrame(cuadro)
    }
  }

  function cuadro(ahora: number) {
    raf = 0
    const dt = Math.min(0.05, (ahora - ultimo) / 1000)
    ultimo = ahora
    tiempo += dt
    const objetivo = resalte ? 1 : 0
    mezcla += (objetivo - mezcla) * Math.min(1, dt * 10)

    if (modelo && tEscaneo === null && visible) tEscaneo = tiempo
    if (modelo && tEscaneo !== null && !escaneado && tiempo - tEscaneo >= duracionEscaneo(FILAS)) {
      escaneado = true
      tFinal = tiempo
      colocarAhora()
    }
    ondas = ondas.filter((o) => tiempo - o.t0 < 1.4)
    pintar()
    informar()
    if (animando()) pedir()
  }

  // ── Progreso de las cifras ───────────────────────────────────────────────

  let ultimoInforme = ''
  function informar() {
    if (!modelo || !op.alProgreso) return
    let p: Progreso
    if (escaneado || op.reducido) {
      const fr = tFinal === null ? 1 : Math.min(1, (tiempo - tFinal) / 0.8)
      p = {
        horasMes: f2(modelo.horasFila.reduce((a, b) => a + b, 0)),
        horasSemana: f2(horasSemanaFila.reduce((a, b) => a + b, 0)),
        commits: modelo.puntos.length,
        racha: op.reducido ? modelo.rachaDias : Math.round(modelo.rachaDias * fr),
        terminado: op.reducido || fr >= 1,
      }
    } else {
      const cab = tEscaneo === null ? 0 : cabezal(tiempo - tEscaneo, FILAS)
      let hm = 0
      let hs = 0
      let c = 0
      modelo.dias.forEach((_, f) => {
        const fase = faseFila(cab, f)
        hm += modelo!.horasFila[f] * fase.fusion
        hs += horasSemanaFila[f] * fase.fusion
        c += modelo!.commitsFila[f] * fase.puntos
      })
      p = { horasMes: f2(hm), horasSemana: f2(hs), commits: Math.round(c), racha: 0, terminado: false }
    }
    const clave = JSON.stringify(p)
    if (clave !== ultimoInforme) {
      ultimoInforme = clave
      op.alProgreso(p)
    }
  }

  // ── Pintura ──────────────────────────────────────────────────────────────

  function pintar() {
    const c = ctx!
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, m.ancho, m.alto)
    const filas = FILAS
    const x0 = m.izq
    const x1 = m.ancho - m.der
    const util = anchoUtil(m)
    const cab = !modelo ? -1 : escaneado || op.reducido ? filas + 2 : tEscaneo === null ? 0 : cabezal(tiempo - tEscaneo, filas)
    const dias = modelo?.dias ?? []

    // Fines de semana: una banda apenas más clara, para leer de un vistazo
    // cuándo se trabajó en sábado o domingo.
    dias.forEach((d, f) => {
      const dow = fechaDeDia(d).getUTCDay()
      if (dow === 0 || dow === 6) {
        c.fillStyle = 'rgba(255,255,255,0.022)'
        c.fillRect(x0, yDeFila(m, f), util, m.altoFila)
      }
    })

    // Resalte de fondo: la ventana de 7 días desde su hora exacta, o las filas de la racha.
    if (modelo && mezcla > 0.01) {
      if (resalte === 'semana') {
        const fs = diaBogota(modelo.inicioSemana) - dias[0]
        const hS = horaBogota(modelo.inicioSemana)
        c.fillStyle = `rgba(${CIAN}, ${0.05 * mezcla})`
        for (let f = Math.max(0, fs); f < filas; f++) {
          const desde = f === fs ? xDeHora(m, hS) : x0
          const hasta = f === filas - 1 ? xDeHora(m, modelo.hAhora) : x1
          c.fillRect(desde, yDeFila(m, f), hasta - desde, m.altoFila)
        }
      } else if (resalte === 'racha') {
        c.fillStyle = `rgba(${LIMA}, ${0.07 * mezcla})`
        modelo.filasRacha.forEach((f) => c.fillRect(x0, yDeFila(m, f), util, m.altoFila))
      }
    }

    // Rejilla de horas.
    for (let h = 0; h <= 24; h++) {
      const x = Math.round(xDeHora(m, h)) + 0.5
      c.strokeStyle = h % 6 === 0 ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.03)'
      c.beginPath()
      c.moveTo(x, m.arriba - 4)
      c.lineTo(x, yDeFila(m, filas))
      c.stroke()
    }

    // Eje de horas.
    c.font = `${m.compacto ? 9 : 10}px ${FUENTE}`
    c.textBaseline = 'alphabetic'
    c.textAlign = 'center'
    c.fillStyle = `rgba(${TINTA}, 0.9)`
    const pasoHora = m.compacto ? 6 : 3
    for (let h = 0; h <= 24; h += pasoHora) c.fillText(String(h).padStart(2, '0'), xDeHora(m, h), m.arriba - 10)

    // Lectura bajo el cursor: fila y columna.
    if (lectura && puntero) {
      c.fillStyle = 'rgba(255,255,255,0.045)'
      c.fillRect(x0, yDeFila(m, lectura.fila), util, m.altoFila)
      c.strokeStyle = `rgba(${CIAN}, 0.25)`
      c.beginPath()
      c.moveTo(Math.round(puntero.x) + 0.5, m.arriba - 4)
      c.lineTo(Math.round(puntero.x) + 0.5, yDeFila(m, filas))
      c.stroke()
    }

    // Etiquetas de día.
    c.textAlign = 'right'
    c.textBaseline = 'middle'
    dias.forEach((d, f) => {
      const esHoy = f === filas - 1
      const bajoCursor = lectura?.fila === f
      const mostrar = !m.compacto || esHoy || bajoCursor || (filas - 1 - f) % 7 === 0
      if (!mostrar) return
      const fecha = fechaDeDia(d)
      const y = yDeFila(m, f) + m.altoFila / 2 + 0.5
      const alcanzada = cab >= f
      c.fillStyle = esHoy ? `rgba(${CIAN}, ${alcanzada ? 1 : 0.35})` : bajoCursor ? '#e7e7ec' : `rgba(${TINTA}, ${alcanzada ? 0.95 : 0.4})`
      const texto = esHoy ? op.textos.hoy : String(fecha.getUTCDate())
      c.fillText(texto, x0 - (m.compacto ? 6 : 26), y)
      if (!m.compacto) {
        c.fillStyle = `rgba(${TINTA}, ${alcanzada ? 0.55 : 0.25})`
        c.fillText(diaSemana.format(fecha).toUpperCase(), x0 - 8, y)
      }
    })

    if (!modelo) {
      pintarCabezalLectura(c)
      return
    }

    // Antes de la ventana consultada (la fila más antigua empieza a mitad de día).
    if (rayaFuera && modelo.hInicioVentana > 0) {
      c.fillStyle = rayaFuera
      c.fillRect(x0, yDeFila(m, 0) + 1, xDeHora(m, modelo.hInicioVentana) - x0, m.altoFila - 2)
    }

    const atenuar = (activo: boolean) => (activo ? 1 : 1 - 0.78 * mezcla)
    const altoBarra = Math.max(4, m.altoFila * 0.5)

    // Sesiones: la parte de commits nace en el primer commit y se estira hasta
    // el último; los 30 min previos crecen hacia atrás, rayados.
    const sesionBajo = lectura?.tipo === 'sesion' ? lectura.sesion : lectura?.tipo === 'punto' ? lectura.punto.sesion : -1
    for (const tr of modelo.tramos) {
      const fase = faseFila(cab, tr.fila)
      if (fase.fusion <= 0) continue
      const s = modelo.sesiones[tr.sesion]
      const activo =
        resalte === 'semana' ? s.enSemana : resalte === 'racha' ? modelo.filasRacha.has(tr.fila) : resalte !== 'commits'
      const a = atenuar(activo) * (resalte === 'mes' ? 1 + 0.4 * mezcla : 1)
      const xa = xDeHora(m, tr.h0)
      const xb = xDeHora(m, tr.h1)
      const ancho = (xb - xa) * fase.fusion
      const x = tr.previo ? xb - ancho : xa
      const y = yDeFila(m, tr.fila) + (m.altoFila - altoBarra) / 2
      if (ancho < 0.5) continue
      c.globalAlpha = Math.min(1, a)
      if (tr.previo) {
        c.fillStyle = `rgba(${CIAN}, 0.07)`
        redondeado(c, x, y, ancho, altoBarra, 2)
        c.fill()
        if (rayaPrevio) {
          c.fillStyle = rayaPrevio
          c.fill()
        }
      } else {
        c.fillStyle = `rgba(${CIAN}, ${tr.sesion === sesionBajo ? 0.42 : 0.24})`
        redondeado(c, x, y, ancho, altoBarra, 2)
        c.fill()
        c.fillStyle = `rgba(${CIAN}, 0.75)`
        c.fillRect(x, y, ancho, 1)
      }
      c.globalAlpha = 1
    }

    // Commits.
    const r = m.compacto ? 1.5 : 1.9
    const tam = brillo.width / dpr
    for (const p of modelo.puntos) {
      const fase = faseFila(cab, p.fila)
      if (fase.puntos <= 0) continue
      const s = modelo.sesiones[p.sesion]
      const activo =
        resalte === 'semana' ? s.enSemana : resalte === 'racha' ? modelo.filasRacha.has(p.fila) : resalte !== 'mes'
      const a = fase.puntos * atenuar(activo)
      const x = xDeHora(m, p.h)
      // Caen desde un poco más arriba al aparecer su fila.
      const y = yDeFila(m, p.fila) + m.altoFila / 2 - (1 - fase.puntos) * 6
      const rr = r * (resalte === 'commits' ? 1 + 0.35 * mezcla : 1)
      c.globalAlpha = a
      if (p.publico) c.drawImage(brillo, x - tam / 2, y - tam / 2, tam, tam)
      c.fillStyle = p.publico ? CIAN_CLARO : GRIS
      c.beginPath()
      c.arc(x, y, rr, 0, Math.PI * 2)
      c.fill()
      c.globalAlpha = 1
    }

    // Commit bajo el cursor: anillo.
    if (lectura?.tipo === 'punto') {
      const p = lectura.punto
      c.strokeStyle = p.publico ? CIAN_CLARO : '#c4c4cc'
      c.lineWidth = 1.25
      c.beginPath()
      c.arc(xDeHora(m, p.h), yDeFila(m, p.fila) + m.altoFila / 2, r + 3.5, 0, Math.PI * 2)
      c.stroke()
      c.lineWidth = 1
    }

    // Commits recién llegados: una onda que se abre donde cayeron.
    for (const o of ondas) {
      const k = (tiempo - o.t0) / 1.4
      c.strokeStyle = `rgba(${CIAN}, ${0.8 * (1 - k)})`
      c.beginPath()
      c.arc(o.x, o.y, 3 + k * 22, 0, Math.PI * 2)
      c.stroke()
    }

    // Canal derecho: horas de sesión por día.
    const maxH = Math.max(1, ...modelo.horasFila)
    const bx = x1 + (m.compacto ? 6 : 12)
    const bMax = m.der - (m.compacto ? 10 : 46)
    c.textAlign = 'right'
    if (!m.compacto) {
      c.fillStyle = `rgba(${TINTA}, 0.9)`
      c.textBaseline = 'alphabetic'
      c.fillText(op.textos.horasDia, m.ancho - 2, m.arriba - 10)
    }
    c.textBaseline = 'middle'
    modelo.dias.forEach((_, f) => {
      const fase = faseFila(cab, f)
      const h = modelo!.horasFila[f]
      if (h <= 0 || fase.fusion <= 0) return
      const activo = resalte === 'racha' ? modelo!.filasRacha.has(f) : true
      const y = yDeFila(m, f) + m.altoFila / 2
      c.globalAlpha = atenuar(activo)
      c.fillStyle = lectura?.fila === f ? CIAN_CLARO : `rgba(${CIAN}, 0.5)`
      c.fillRect(bx, y - 1.5, Math.max(1.5, (h / maxH) * bMax * fase.fusion), 3)
      if (!m.compacto) {
        c.fillStyle = lectura?.fila === f ? '#e7e7ec' : `rgba(${TINTA}, 0.9)`
        c.fillText(formatoNum.format(h * fase.fusion), m.ancho - 2, y + 0.5)
      }
      c.globalAlpha = 1
    })

    // Racha: al terminar el escaneo, un trazo lima baja por el borde izquierdo
    // de los días seguidos, uno tras otro.
    if (modelo.rachaDias > 0 && (escaneado || op.reducido)) {
      const filasR = [...modelo.filasRacha].sort((a, b) => a - b)
      const fr = op.reducido || tFinal === null ? 1 : Math.min(1, (tiempo - tFinal) / 0.8)
      const encendidas = Math.round(filasR.length * fr)
      c.fillStyle = `rgba(${LIMA}, ${resalte === 'racha' ? 0.95 : 0.55})`
      filasR.slice(0, encendidas).forEach((f) => c.fillRect(x0 - 3, yDeFila(m, f) + 2, 2, m.altoFila - 4))
    }

    // Histograma por hora del día.
    const yb = baseHisto(m, filas)
    const maxHora = Math.max(1, ...modelo.porHora)
    const pico = modelo.porHora.indexOf(maxHora)
    const crecer = op.reducido ? 1 : tFinal === null ? 0 : Math.min(1, (tiempo - tFinal) / 0.9)
    const anchoHora = util / 24
    modelo.porHora.forEach((n, h) => {
      if (!n) return
      const alto = (n / maxHora) * m.histo * easeOut(Math.max(0, Math.min(1, crecer * 1.4 - h / 40)))
      const activo = resalte !== 'mes' && resalte !== 'semana' && resalte !== 'racha'
      c.fillStyle = h === pico ? `rgba(${CIAN}, ${0.7 * atenuar(activo)})` : `rgba(255,255,255,${0.15 * atenuar(activo)})`
      c.fillRect(xDeHora(m, h) + 1, yb - alto, anchoHora - 2, alto)
    })
    c.fillStyle = 'rgba(255,255,255,0.08)'
    c.fillRect(x0, yb, util, 1)
    c.textAlign = 'left'
    c.textBaseline = 'alphabetic'
    c.fillStyle = `rgba(${TINTA}, 0.9)`
    c.font = `${m.compacto ? 9 : 10}px ${FUENTE}`
    c.fillText(op.textos.porHora, x0, yb + (m.compacto ? 12 : 14))

    // Cabezal del escaneo.
    if (!escaneado && !op.reducido && tEscaneo !== null) pintarCabezal(c, cab, 1)
  }

  function pintarCabezal(c: CanvasRenderingContext2D, cab: number, intensidad: number) {
    const y = m.arriba + Math.min(cab, FILAS) * m.altoFila
    if (y > yDeFila(m, FILAS) + 1) return
    const grad = c.createLinearGradient(0, y - 28, 0, y)
    grad.addColorStop(0, `rgba(${CIAN}, 0)`)
    grad.addColorStop(1, `rgba(${CIAN}, ${0.13 * intensidad})`)
    c.fillStyle = grad
    c.fillRect(m.izq, y - 28, anchoUtil(m), 28)
    c.fillStyle = `rgba(${CIAN}, ${0.85 * intensidad})`
    c.fillRect(m.izq, y - 0.5, anchoUtil(m), 1)
    c.beginPath()
    c.arc(m.izq, y, 2.5, 0, Math.PI * 2)
    c.fill()
  }

  function pintarCabezalLectura(c: CanvasRenderingContext2D) {
    if (op.reducido) return
    const vuelta = (tiempo % 2.2) / 2.2
    pintarCabezal(c, vuelta * FILAS, 0.45)
  }

  // ── Lectura bajo el cursor ───────────────────────────────────────────────

  function mostrarTip(l: Lectura, x: number, y: number) {
    if (!tip || !modelo) return
    if (!l) {
      tip.hidden = true
      return
    }
    const fecha = formatoDia.format(fechaDeDia(modelo.dias[l.fila]))
    const lineas: [string, string][] = [['lg-tip-fecha', fecha]]
    if (l.tipo === 'punto') {
      const p = l.punto
      const pub = p.publico ? op.describir(p.ref) : null
      lineas[0][1] = `${fecha} · ${reloj24(p.h)}`
      if (pub) {
        lineas.push(['lg-tip-meta', `${pub.sha} · ${pub.repo}`])
        lineas.push(['lg-tip-texto', pub.mensaje])
      } else {
        lineas.push(['lg-tip-texto', op.textos.privado])
        lineas.push(['lg-tip-nota', op.textos.privadoNota])
      }
    } else if (l.tipo === 'sesion') {
      const s = modelo.sesiones[l.sesion]
      const previo = horaBogota(s.inicio) - 0.5
      lineas.push([
        'lg-tip-texto',
        interpolar(op.textos.sesion, { desde: reloj24((previo + 24) % 24), hasta: reloj24(horaBogota(s.fin)) }),
      ])
      lineas.push([
        'lg-tip-meta',
        interpolar(s.commits === 1 ? op.textos.sesionUno : op.textos.sesionDetalle, {
          horas: formatoNum.format(minutosDe(s) / 60),
          n: s.commits,
        }),
      ])
    } else {
      const f = l.fila
      const h = ((x - m.izq) / anchoUtil(m)) * 24
      if (f === 0 && h < modelo.hInicioVentana) {
        lineas.push(['lg-tip-nota', op.textos.fuera])
      } else {
        const sesionesFila = new Set(modelo.tramos.filter((t) => t.fila === f && !t.previo).map((t) => t.sesion)).size
        lineas.push([
          'lg-tip-meta',
          modelo.commitsFila[f] === 0
            ? op.textos.sinCommits
            : interpolar(sesionesFila === 1 ? op.textos.filaUna : op.textos.fila, {
                n: sesionesFila,
                horas: formatoNum.format(modelo.horasFila[f]),
              }),
        ])
      }
    }
    tip.replaceChildren(
      ...lineas.map(([clase, texto]) => {
        const s = document.createElement('span')
        s.className = clase
        s.textContent = texto
        return s
      }),
    )
    tip.hidden = false
    // Dentro del lienzo siempre: pegado al cursor, del lado que tenga sitio.
    const ancho = tip.offsetWidth
    const alto = tip.offsetHeight
    let left = x + 14
    if (left + ancho > m.ancho - 4) left = x - 14 - ancho
    left = Math.max(4, Math.min(left, m.ancho - ancho - 4))
    let top = y - alto - 12
    if (top < 0) top = y + 16
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  function alMover(e: PointerEvent) {
    if (!modelo || (!escaneado && !op.reducido)) return
    const r = lienzo.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const l = leerEn(modelo, m, x, y, e.pointerType === 'touch' ? 12 : 7)
    lectura = l
    puntero = l ? { x, y } : null
    mostrarTip(l, x, y)
    pintar()
  }

  function alSalir(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    lectura = null
    puntero = null
    if (tip) tip.hidden = true
    pintar()
  }

  // En táctil la lectura se queda hasta tocar fuera del reloj.
  function alTocarFuera(e: PointerEvent) {
    if (e.pointerType !== 'touch' || raiz.contains(e.target as Node)) return
    lectura = null
    puntero = null
    if (tip) tip.hidden = true
    pintar()
  }

  lienzo.addEventListener('pointermove', alMover)
  lienzo.addEventListener('pointerdown', alMover)
  lienzo.addEventListener('pointerleave', alSalir)
  document.addEventListener('pointerdown', alTocarFuera)

  const io = new IntersectionObserver((entradas) => {
    visible = entradas.some((e) => e.isIntersecting)
    if (visible && animando()) pedir()
  })
  io.observe(raiz)
  const ro = new ResizeObserver(() => {
    medir()
    pintar()
  })
  ro.observe(raiz)
  medir()
  pintar()

  return {
    cargar(nuevo, nuevos) {
      const anterior = modelo
      modelo = nuevo
      horasSemanaFila = new Array<number>(nuevo.dias.length).fill(0)
      for (const tr of nuevo.tramos) if (nuevo.sesiones[tr.sesion].enSemana) horasSemanaFila[tr.fila] += tr.h1 - tr.h0
      if (anterior && nuevos?.size) {
        for (const p of nuevo.puntos) {
          if (nuevos.has(p.t)) ondas.push({ x: xDeHora(m, p.h), y: yDeFila(m, p.fila) + m.altoFila / 2, t0: tiempo })
        }
      }
      if (op.reducido) escaneado = true
      colocarAhora()
      pintar()
      informar()
      pedir()
    },
    resaltar(modo) {
      resalte = modo
      pedir()
      if (!visible || op.reducido) {
        mezcla = modo ? 1 : 0
        pintar()
      }
    },
    destruir() {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('pointerdown', alTocarFuera)
    },
  }
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

function redondeado(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.roundRect(x, y, w, h, rr)
}
