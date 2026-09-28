// La partitura de /automatizaciones en el navegador: entrada, lectura al
// apuntar y el simulacro de corte del programador externo.
//
// El servidor ya dejó la partitura pintada; esto solo la repinta cuando el
// tiempo se mueve (el simulacro) y con el MISMO modelo puro que usó el
// servidor (`construirPartitura`), así lo que se ve durante el simulacro no
// puede divergir de lo que se vería con datos reales en ese instante.
//
// Fail-open: si algo falla al montar, la partitura del servidor queda como está.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { CRONS } from '../../data/automatizaciones'
import { interpolate } from '../../i18n/format'
import { toleranciaMin } from '../cron-silencio'
import {
  ANCHO,
  JOB_VIGILANTE,
  construirPartitura,
  horaUTC,
  marcasEje,
  pathFantasmas,
  pathMarcas,
  posicion,
  simularCorte,
  type Carril,
  type Corrida,
  type Partitura,
  type Simulacro,
} from './partitura'

type TextosPartitura = {
  lecturaInicial: string
  lecturaCorrida: string
  lecturaHueco: string
  lecturaCarril: string
  lecturaVacia: string
  ok: string
  fallo: string
  ahora: string
}
type TextosSim = {
  boton: string
  restaurar: string
  reloj: string
  callado: string
  espera: string
  sinCheck: string
  alarma: string
  sinAlarma: string
  revision: string
}
type Carga = {
  datos: { hasta: number; jobs: string[]; c: [number, number, number, number][] }
  textos: { dur: string; durMin: string; p: TextosPartitura; s: TextosSim }
}

const MIN = 60_000
const HORA = 60 * MIN
const VENTANA = 24 * HORA
// Holgura tras la alarma para que se vea la revisión que avisó y un poco de
// lo que sigue, en vez de congelar el cabezal justo encima.
const COLA_TRAS_ALARMA = 12 * MIN
// Píxeles alrededor del cursor en los que una marca cuenta como "apuntada".
const RADIO_PX = 7

export function montarPartitura(opciones: { reducido: boolean }): void {
  const fig = document.querySelector<HTMLElement>('[data-partitura]')
  const script = document.getElementById('au-datos')
  if (!fig || !script) return
  try {
    montar(fig, JSON.parse(script.textContent ?? '{}') as Carga, opciones.reducido)
  } catch (err) {
    console.warn('[automatizaciones] partitura sin motion tras un fallo', err)
    gsap.set(fig.querySelectorAll('.au-pista'), { clearProps: 'clipPath' })
  }
}

function montar(fig: HTMLElement, carga: Carga, reducido: boolean) {
  const { datos, textos } = carga
  const tp = textos.p
  const ts = textos.s
  const corridas: Corrida[] = datos.c.map(([j, s, ok, ms]) => ({
    job: datos.jobs[j],
    at: datos.hasta + s * 1000,
    ok: ok === 1,
    ms: ms < 0 ? null : ms,
  }))

  const rejilla = fig.querySelector<HTMLElement>('[data-rejilla]')!
  const capa = fig.querySelector<HTMLElement>('[data-capa]')!
  const lectura = fig.querySelector<HTMLElement>('[data-lectura]')!
  const cursor = capa.querySelector<HTMLElement>('[data-cursor]')!
  const cursorHora = capa.querySelector<HTMLElement>('[data-cursor-hora]')!
  const cabezal = capa.querySelector<HTMLElement>('[data-cabezal]')!
  const corteEl = capa.querySelector<HTMLElement>('[data-corte]')!
  const ahoraEl = capa.querySelector<HTMLElement>('[data-ahora] b')!
  const revisionesEl = capa.querySelector<HTMLElement>('[data-revisiones]')!
  const eje = fig.querySelector<HTMLElement>('[data-eje]')!
  const pistas = new Map<string, HTMLElement>()
  fig.querySelectorAll<HTMLElement>('[data-pista]').forEach((el) => pistas.set(el.dataset.pista!, el))
  const nombres = new Map<string, HTMLElement>()
  fig.querySelectorAll<HTMLElement>('[data-carril]').forEach((el) => nombres.set(el.dataset.carril!, el))

  const dur = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.floor(min % 60)
    if (h === 0) return interpolate(textos.durMin, { m })
    // "36 h 0 min" se lee como un dato de relleno: sin minutos, solo horas.
    return m === 0 ? interpolate(textos.dur, { h, m }).replace(/\s*0\s*min$/, '') : interpolate(textos.dur, { h, m })
  }

  // El modelo en pantalla. Empieza siendo el mismo que pintó el servidor.
  let modelo: Partitura = construirPartitura(corridas, CRONS, datos.hasta)

  // ── Pintado ────────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg'
  function pintarCarril(c: Carril) {
    const pista = pistas.get(c.job)
    if (!pista) return
    pista.querySelector('[data-ok]')?.setAttribute('d', pathMarcas(c.marcas.filter((m) => m.ok).map((m) => m.x)))
    pista.querySelector('[data-fallo]')?.setAttribute('d', pathMarcas(c.marcas.filter((m) => !m.ok).map((m) => m.x)))
    pista.querySelector('[data-fantasmas]')?.setAttribute('d', pathFantasmas(c.fantasmas))
    const g = pista.querySelector('[data-huecos]')!
    g.replaceChildren(
      ...c.huecos.map((h) => {
        const r = document.createElementNS(NS, 'rect')
        r.setAttribute('class', h.abierto ? 'au-hueco au-hueco-abierto' : 'au-hueco')
        r.setAttribute('x', String(h.x0 * ANCHO))
        r.setAttribute('width', String(Math.max(0, (h.x1 - h.x0) * ANCHO)))
        r.setAttribute('y', '0')
        r.setAttribute('height', '24')
        return r
      })
    )
    const notas = pista.querySelector('[data-notas]')!
    notas.replaceChildren(
      ...(c.cadaMin >= 60 ? c.marcas : []).map((mk) => {
        const n = document.createElement('span')
        n.className = 'au-nota'
        if (!mk.ok) n.dataset.fallo = ''
        n.style.left = `${(mk.x * 100).toFixed(2)}%`
        return n
      })
    )
    const rot = pista.querySelector('[data-rotulos]')!
    rot.replaceChildren(
      ...c.huecos
        .filter((h) => h.x1 - h.x0 > 0.035)
        .map((h) => {
          const s = document.createElement('span')
          s.className = 'au-rotulo'
          s.style.left = `${(((h.x0 + h.x1) / 2) * 100).toFixed(2)}%`
          s.textContent = dur(h.min)
          return s
        })
    )
    pista.dataset.silencio = c.huecos.some((h) => h.abierto) ? 'si' : 'no'
  }

  function pintar(p: Partitura) {
    modelo = p
    p.carriles.forEach(pintarCarril)
    eje.replaceChildren(
      ...marcasEje(p.desde, p.hasta).map((e) => {
        const s = document.createElement('span')
        s.style.left = `${(e.x * 100).toFixed(2)}%`
        s.textContent = e.hora
        return s
      })
    )
  }

  // ── Lectura al apuntar ─────────────────────────────────────────────────
  let activo: string | null = null
  function activar(job: string | null) {
    if (job === activo) return
    if (activo) {
      pistas.get(activo)?.classList.remove('au-activo')
      nombres.get(activo)?.classList.remove('au-activo')
    }
    activo = job
    rejilla.classList.toggle('au-enfoque', job !== null)
    if (job) {
      pistas.get(job)?.classList.add('au-activo')
      nombres.get(job)?.classList.add('au-activo')
    }
  }

  function leerCarril(c: Carril): string {
    if (c.total === 0) return interpolate(tp.lecturaVacia, { job: c.job })
    return interpolate(tp.lecturaCarril, { job: c.job, n: c.total, fallidas: c.fallidas, tol: dur(toleranciaMin(c.cadaMin)) })
  }

  function leerEn(c: Carril, x: number, anchoPx: number): string {
    const radio = RADIO_PX / anchoPx
    let mejor: (typeof c.marcas)[number] | null = null
    for (const m of c.marcas) {
      const d = Math.abs(m.x - x)
      if (d <= radio && (!mejor || d < Math.abs(mejor.x - x))) mejor = m
    }
    if (mejor) {
      const d = mejor.ms !== null && mejor.ms >= 0 ? ` · ${(mejor.ms / 1000).toFixed(1)} s` : ''
      return interpolate(tp.lecturaCorrida, { job: c.job, hora: horaUTC(mejor.at), estado: mejor.ok ? tp.ok : tp.fallo, dur: d })
    }
    const h = c.huecos.find((hu) => x >= hu.x0 && x <= hu.x1)
    if (h) return interpolate(tp.lecturaHueco, { job: c.job, dur: dur(h.min), hora: horaUTC(h.desde), tol: dur(c.toleranciaMin) })
    return leerCarril(c)
  }

  const lecturaBase = () => (enSimulacro ? lectura.textContent ?? '' : tp.lecturaInicial)

  rejilla.addEventListener('pointermove', (e) => {
    const r = capa.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const objetivo = (e.target as HTMLElement).closest<HTMLElement>('[data-pista],[data-carril]')
    const job = objetivo?.dataset.pista ?? objetivo?.dataset.carril ?? null
    if (x < 0 || x > 1 || !job) {
      cursor.hidden = true
      activar(job)
      if (job) lectura.textContent = leerCarril(modelo.carriles.find((c) => c.job === job)!)
      return
    }
    const c = modelo.carriles.find((cc) => cc.job === job)
    if (!c) return
    activar(job)
    cursor.hidden = false
    cursor.style.left = `${(x * 100).toFixed(3)}%`
    cursorHora.textContent = horaUTC(modelo.desde + x * (modelo.hasta - modelo.desde))
    lectura.textContent = objetivo?.dataset.pista ? leerEn(c, x, r.width) : leerCarril(c)
  })
  rejilla.addEventListener('pointerleave', () => {
    cursor.hidden = true
    activar(null)
    if (!enSimulacro) lectura.textContent = lecturaBase()
  })
  nombres.forEach((btn, job) => {
    btn.addEventListener('focus', () => {
      activar(job)
      lectura.textContent = leerCarril(modelo.carriles.find((c) => c.job === job)!)
    })
    btn.addEventListener('blur', () => {
      activar(null)
      if (!enSimulacro) lectura.textContent = lecturaBase()
    })
  })

  // ── Entrada ────────────────────────────────────────────────────────────
  // Las pistas se destapan de izquierda a derecha detrás de un cabezal, como
  // si la bitácora se leyera en ese momento. El estado final es el del
  // servidor: la animación solo llega a él.
  if (!reducido) {
    const pistasEl = [...pistas.values()]
    gsap.set(pistasEl, { clipPath: 'inset(-20% 100% -20% 0%)' })
    const tl = gsap.timeline({ delay: 0.55 })
    tl.to(cabezal, { opacity: 1, duration: 0.2 }, 0)
      .fromTo(cabezal, { left: '0%' }, { left: '100%', duration: 2.1, ease: 'power2.inOut' }, 0)
      .to(pistasEl, { clipPath: 'inset(-20% 0% -20% 0%)', duration: 2.1, ease: 'power2.inOut', stagger: 0.035, clearProps: 'clipPath' }, 0)
      .to(cabezal, { opacity: 0, duration: 0.5 }, 2.1)
  }

  // ── Simulacro ──────────────────────────────────────────────────────────
  const sim = fig.querySelector<HTMLElement>('[data-sim]')
  let enSimulacro = false
  if (!sim) return
  sim.hidden = false
  const boton = sim.querySelector<HTMLButtonElement>('[data-sim-boton]')!
  const rotulo = sim.querySelector<HTMLElement>('[data-sim-rotulo]')!
  const panel = sim.querySelector<HTMLElement>('[data-sim-panel]')!
  const reloj = sim.querySelector<HTMLElement>('[data-sim-reloj]')!
  const callados = sim.querySelector<HTMLElement>('[data-sim-callados]')!
  const espera = sim.querySelector<HTMLElement>('[data-sim-espera]')!
  const aviso = sim.querySelector<HTMLElement>('[data-sim-aviso]')!
  const avisoTitulo = sim.querySelector<HTMLElement>('[data-sim-aviso-titulo]')!
  const avisoTexto = sim.querySelector<HTMLElement>('[data-sim-aviso-texto]')!

  const real = modelo
  let tween: gsap.core.Tween | null = null
  let resultado: Simulacro | null = null

  // Los jobs que se vigilan en el panel: los que se callan del todo y el
  // vigilante, que baja a su ritmo diario.
  function vigiladosSim(s: Simulacro): string[] {
    return [JOB_VIGILANTE, ...s.callados.filter((j) => j !== JOB_VIGILANTE)]
  }

  function ultimaAntes(todas: Corrida[], job: string, t: number): number | null {
    let u: number | null = null
    for (const c of todas) if (c.job === job && c.at <= t && (u === null || c.at > u)) u = c.at
    return u
  }

  function fotograma(s: Simulacro, todas: Corrida[], t: number) {
    // El panel se congela en la revisión que avisa: lo que cuenta es lo que el
    // vigilante vio al mirar. Después, la corrida diaria que lo hospeda ya
    // quedó anotada y el silencio de ese job, para la bitácora, se rompió.
    const tPanel = s.alarma ? Math.min(t, s.alarma.at) : t
    const visibles = todas.filter((c) => c.at <= t)
    pintar(construirPartitura(visibles, CRONS, t))
    const desde = t - VENTANA
    corteEl.hidden = false
    corteEl.style.left = `${(posicion(s.corte, desde, t) * 100).toFixed(3)}%`
    ahoraEl.textContent = `${horaUTC(t)} UTC`
    reloj.textContent = interpolate(ts.reloj, { dur: dur((tPanel - s.corte) / MIN) })

    callados.replaceChildren(
      ...vigiladosSim(s).map((job) => {
        const cron = modelo.carriles.find((c) => c.job === job)!
        const u = ultimaAntes(todas, job, s.corte) ?? s.corte
        const silencio = (tPanel - u) / MIN
        const li = document.createElement('li')
        li.textContent = interpolate(ts.callado, { job, dur: dur(silencio), tol: dur(cron.toleranciaMin) })
        if (silencio > cron.toleranciaMin) li.dataset.fuera = ''
        return li
      })
    )

    const siguiente = s.futuras.find((f) => f.job === JOB_VIGILANTE && f.at > t)
    const revHechas = s.revisiones.filter((r) => r.at <= t)
    revisionesEl.replaceChildren(
      ...s.revisiones
        .filter((r) => r.at <= t && r.at >= desde)
        .map((r) => {
          const el = document.createElement('span')
          el.className = 'au-revision'
          el.style.left = `${(posicion(r.at, desde, t) * 100).toFixed(3)}%`
          if (r.avisos.length) el.dataset.aviso = ''
          if (posicion(r.at, desde, t) > 0.85) el.dataset.izquierda = ''
          const b = document.createElement('b')
          b.textContent = ts.revision
          el.appendChild(b)
          return el
        })
    )

    const alarmaVista = s.alarma && t >= s.alarma.at
    if (alarmaVista && s.alarma) {
      espera.textContent = ''
      aviso.hidden = false
      avisoTitulo.textContent = interpolate(ts.alarma, { hora: horaUTC(s.alarma.at), dur: dur((s.alarma.at - s.corte) / MIN) })
      avisoTexto.textContent = s.alarma.textos.join('\n')
    } else {
      aviso.hidden = true
      // Una corrida diaria que ya pasó sin revisar (la anterior era de hace
      // menos de una hora) se cuenta; si no, se anuncia la próxima.
      const saltada = s.futuras.find(
        (f) => f.job === JOB_VIGILANTE && f.at <= t && !s.revisiones.some((r) => r.at === f.at)
      )
      if (saltada && !revHechas.length) espera.textContent = interpolate(ts.sinCheck, { hora: horaUTC(saltada.at) })
      else if (siguiente) espera.textContent = interpolate(ts.espera, { hora: horaUTC(siguiente.at) })
      else if (!s.alarma) espera.textContent = interpolate(ts.sinAlarma, { h: Math.round((t - s.corte) / HORA) })
    }
  }

  function empezar() {
    enSimulacro = true
    boton.setAttribute('aria-pressed', 'true')
    rotulo.textContent = ts.restaurar
    panel.classList.add('au-activo')
    const s = simularCorte(corridas, CRONS, real.hasta)
    resultado = s
    const todas = corridas.concat(s.futuras)
    const fin = s.alarma ? s.alarma.at + COLA_TRAS_ALARMA : s.corte + 36 * HORA
    if (reducido) {
      fotograma(s, todas, fin)
      return
    }
    const estado = { t: s.corte }
    // Unos 0,45 s por hora simulada, entre 5 y 12 s: un corte a las 06:30 no
    // debe pasar en un parpadeo ni uno a las 07:30 durar medio minuto.
    const segundos = Math.min(12, Math.max(5, ((fin - s.corte) / HORA) * 0.45))
    tween = gsap.to(estado, {
      t: fin,
      duration: segundos,
      ease: 'power1.inOut',
      onUpdate: () => fotograma(s, todas, estado.t),
    })
  }

  function restaurar() {
    tween?.kill()
    tween = null
    resultado = null
    enSimulacro = false
    boton.setAttribute('aria-pressed', 'false')
    rotulo.textContent = ts.boton
    panel.classList.remove('au-activo')
    aviso.hidden = true
    corteEl.hidden = true
    revisionesEl.replaceChildren()
    ahoraEl.textContent = tp.ahora
    lectura.textContent = tp.lecturaInicial
    pintar(real)
  }

  boton.addEventListener('click', () => (resultado ? restaurar() : empezar()))
}
