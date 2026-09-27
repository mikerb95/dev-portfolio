// Página /log en el navegador. Los datos son de GitHub y la página está
// prerenderizada, así que todo se arma aquí: el reloj de sesiones, las cifras
// que se suman mientras el reloj las dibuja, la bitácora con sus filtros y la
// consulta periódica que trae los commits nuevos mientras la página sigue
// abierta.
//
// Fail-open por pieza: si el reloj no puede montarse, las cifras y la
// bitácora siguen; si falla la bitácora, el reloj sigue.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { diaBogota, horaBogota, leerCommit, type TipoCommit } from '../actividad'
import { construirReloj, fechaDeDia, reloj24, type ModeloReloj, type ModoResalte } from './reloj'
import { montarReloj, type Progreso, type Reloj, type TextosReloj } from './reloj-lienzo'
import {
  CLAVE_PRIVADOS,
  conteoTipos,
  enlaceCommit,
  filtrar,
  filtroDeUrl,
  mezclaRepos,
  tipoDe,
  type Filtro,
  type ItemFeed,
} from './log-datos'

type Datos = {
  feed: ItemFeed[]
  deepWork: { weekHours: number; monthHours: number; sessions: number }
  streak: number
  totalCommits: number
  generatedAt?: number
  privateCommitTimes?: number[]
}

type Textos = {
  oneCommit: string
  nCommits: string
  today: string
  noActivity: string
  connectError: string
  loadError: string
  motion: {
    actualizado: string
    actualizadoAhora: string
    reloj: Omit<TextosReloj, 'hoy'> & { resumen: string }
    bitacora: {
      privados: string
      todos: string
      tipos: Record<TipoCommit | 'pr', string>
      resultado: string
      vacio: string
      verCommit: string
      nuevo: string
    }
  }
}

const COLOR_TIPO: Record<TipoCommit | 'pr', string> = {
  feat: '#00f2ff',
  fix: '#ff6b3d',
  refactor: '#a78bff',
  perf: '#9bfaff',
  test: '#c9ff5b',
  docs: '#c4c4cc',
  chore: '#85858f',
  otro: '#4d4d5d',
  pr: '#a78bff',
}

const interpolar = (plantilla: string, v: Record<string, string | number>) =>
  plantilla.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Clave estable de un elemento del feed, para reconocer los nuevos entre dos consultas. */
const claveItem = (f: ItemFeed) => `${f.type}:${f.repoFull}:${f.sha || f.timestamp}`

export function montarLog(opciones: { reducido: boolean }) {
  const { reducido } = opciones
  const raiz = document.querySelector<HTMLElement>('[data-locale]')
  const intl = raiz?.dataset.locale === 'en' ? 'en-US' : 'es-CO'
  const T = JSON.parse(document.getElementById('log-i18n')!.textContent!) as Textos
  const num1 = new Intl.NumberFormat(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const num0 = new Intl.NumberFormat(intl)

  let datos: Datos | null = null
  let modelo: ModeloReloj | null = null
  let reloj: Reloj | null = null
  let fijado: ModoResalte | null = null

  // ── Cifras ───────────────────────────────────────────────────────────────

  const kpi = (modo: string) => document.querySelector<HTMLElement>(`[data-kpi="${modo}"]`)
  function pintarCifras(p: { semana: number; mes: number; commits: number; racha: number }) {
    kpi('semana')!.textContent = `${num1.format(p.semana)} h`
    kpi('mes')!.textContent = `${num1.format(p.mes)} h`
    kpi('commits')!.textContent = num0.format(p.commits)
    kpi('racha')!.textContent = `${p.racha} d`
  }
  // Las cifras publicadas son las del servidor. Mientras el reloj escanea se
  // muestra la suma de lo dibujado; al terminar, la cifra oficial (que es la
  // misma, por construcción, salvo el redondeo).
  function cifrasFinales() {
    if (!datos) return
    pintarCifras({
      semana: datos.deepWork.weekHours,
      mes: datos.deepWork.monthHours,
      commits: datos.totalCommits,
      racha: datos.streak,
    })
  }
  function alProgreso(p: Progreso) {
    if (p.terminado) cifrasFinales()
    else pintarCifras({ semana: p.horasSemana, mes: p.horasMes, commits: p.commits, racha: p.racha })
  }

  // Interruptores: apuntar resalta mientras dura; clic (o tecla) lo fija.
  document.querySelectorAll<HTMLButtonElement>('[data-resalta]').forEach((b) => {
    const modo = b.dataset.resalta as ModoResalte
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') reloj?.resaltar(modo)
    })
    b.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') reloj?.resaltar(fijado)
    })
    b.addEventListener('click', () => {
      fijado = fijado === modo ? null : modo
      document.querySelectorAll<HTMLButtonElement>('[data-resalta]').forEach((o) =>
        o.setAttribute('aria-pressed', String(o.dataset.resalta === fijado)),
      )
      reloj?.resaltar(fijado)
    })
  })

  // ── Reloj ────────────────────────────────────────────────────────────────

  const lienzo = document.querySelector<HTMLElement>('[data-reloj]')
  if (lienzo) {
    try {
      reloj = montarReloj(lienzo, {
        reducido,
        intl,
        textos: { ...T.motion.reloj, hoy: T.today },
        describir: (ref) => {
          const f = datos?.feed[ref]
          return f ? { sha: f.sha, repo: f.repo, mensaje: f.message } : null
        },
        alProgreso,
      })
    } catch (err) {
      console.warn('[log] reloj sin motion', err)
      reloj = null
    }
  }

  function construir(d: Datos): ModeloReloj {
    return construirReloj({
      publicos: d.feed
        .map((f, ref) => ({ t: new Date(f.timestamp).getTime(), ref, commit: f.type === 'commit' }))
        .filter((p) => p.commit && Number.isFinite(p.t)),
      privados: d.privateCommitTimes ?? [],
      ahora: d.generatedAt ?? Date.now(),
    })
  }

  // ── Estado ───────────────────────────────────────────────────────────────

  function estado(texto: string, ok: boolean) {
    const el = document.getElementById('feed-status-text')
    if (el) el.textContent = texto
    document.getElementById('feed-status')?.querySelector('.pulse-dot')?.classList.toggle('bg-red-400', !ok)
  }
  function estadoFrescura() {
    if (!datos?.generatedAt) return
    const min = Math.floor((Date.now() - datos.generatedAt) / 60_000)
    estado(min < 1 ? T.motion.actualizadoAhora : interpolar(T.motion.actualizado, { n: min }), true)
  }

  // ── Bitácora ─────────────────────────────────────────────────────────────

  const bit = crearBitacora()

  async function consultar(): Promise<Datos> {
    const res = await fetch('/api/github/activity')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as Datos
  }

  async function cargar() {
    try {
      datos = await consultar()
    } catch (err) {
      console.warn('[log] sin datos de GitHub', err)
      estado(T.connectError, false)
      reloj?.destruir()
      document.querySelector<HTMLElement>('[data-reloj-error]')?.removeAttribute('hidden')
      bit.error()
      return
    }
    estadoFrescura()
    modelo = construir(datos)
    if (reloj) {
      reloj.cargar(modelo)
    } else {
      cifrasFinales()
    }
    const resumen = document.querySelector<HTMLElement>('[data-reloj-resumen]')
    if (resumen) {
      resumen.textContent = interpolar(T.motion.reloj.resumen, {
        sesiones: datos.deepWork.sessions,
        horas: num1.format(datos.deepWork.monthHours),
        commits: datos.totalCommits,
      })
    }
    try {
      bit.cargar(datos, modelo)
    } catch (err) {
      console.warn('[log] bitácora sin motion', err)
    }
    programarConsulta()
  }

  // Actividad nueva mientras la página sigue abierta. La respuesta vive media
  // hora en la CDN, así que consultar más a menudo no trae nada: cada 5 min se
  // pregunta, y solo si cambió `generatedAt` se toca algo.
  let temporizador = 0
  function programarConsulta() {
    window.clearTimeout(temporizador)
    temporizador = window.setTimeout(async () => {
      if (document.visibilityState === 'visible') {
        try {
          const nuevos = await consultar()
          if (datos && nuevos.generatedAt !== datos.generatedAt) actualizar(nuevos)
        } catch {
          // una consulta fallida no borra lo que ya se ve
        }
      }
      estadoFrescura()
      programarConsulta()
    }, 5 * 60_000)
  }

  function actualizar(nuevos: Datos) {
    const antes = new Set(datos!.feed.map(claveItem))
    const recien = nuevos.feed.filter((f) => !antes.has(claveItem(f)))
    const marcasAntes = new Set(modelo!.puntos.map((p) => p.t))
    datos = nuevos
    modelo = construir(nuevos)
    const marcasNuevas = new Set(modelo.puntos.map((p) => p.t).filter((t) => !marcasAntes.has(t)))
    reloj?.cargar(modelo, marcasNuevas)
    cifrasFinales()
    estadoFrescura()
    bit.actualizar(nuevos, modelo, new Set(recien.map(claveItem)))
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') estadoFrescura()
  })

  cargar()

  // ── Bitácora (cierre sobre el estado de arriba) ──────────────────────────

  function crearBitacora() {
    const feedEl = document.getElementById('log-feed')!
    const mezclaEl = document.querySelector<HTMLElement>('[data-mezcla]')!
    const tiposEl = document.querySelector<HTMLElement>('[data-tipos]')!
    const resultadoEl = document.querySelector<HTMLElement>('[data-resultado]')!
    const limpiarEl = document.querySelector<HTMLButtonElement>('[data-limpiar]')!

    const LOTE = 60
    const RETRASO_MS = 450
    const TANDAS_SOLAS = 5

    let lista: ItemFeed[] = []
    let cursor = 0
    let ultimoDia = -1
    let cargando = false
    let tandas = 0
    let observador: IntersectionObserver | null = null
    let filtro: Filtro = { repo: null, tipo: null }
    let modeloB: ModeloReloj | null = null
    let feed: ItemFeed[] = []
    let total = 0
    let entrado = false
    let nuevosB = new Set<string>()

    const hayMas = () => cursor < lista.length

    function franjaDia(dia: number): string {
      if (!modeloB) return ''
      const fila = dia - modeloB.dias[0]
      const tramos = modeloB.tramos.filter((t) => t.fila === fila)
      const rects = tramos
        .map(
          (t) =>
            `<rect x="${t.h0.toFixed(3)}" y="${t.previo ? 3 : 2}" width="${Math.max(0.12, t.h1 - t.h0).toFixed(3)}" height="${t.previo ? 4 : 6}" rx=".4" fill="${t.previo ? 'rgba(0,242,255,.22)' : 'rgba(0,242,255,.55)'}"/>`,
        )
        .join('')
      const ticks = [6, 12, 18].map((h) => `<rect x="${h - 0.03}" y="0" width=".06" height="10" fill="rgba(255,255,255,.12)"/>`).join('')
      return `<svg class="lg-dia-franja" viewBox="0 0 24 10" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4.5" width="24" height="1" fill="rgba(255,255,255,.06)"/>${ticks}${rects}</svg>`
    }

    function cabeceraDia(dia: number): string {
      const fecha = new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(fechaDeDia(dia))
      const n = feed.filter((f) => f.type === 'commit' && diaBogota(new Date(f.timestamp).getTime()) === dia).length
      const fila = modeloB ? dia - modeloB.dias[0] : -1
      const horas = modeloB && fila >= 0 && fila < modeloB.dias.length ? modeloB.horasFila[fila] : 0
      const dato = [n === 1 ? T.oneCommit : interpolar(T.nCommits, { n }), horas > 0 ? `${num1.format(horas)} h` : '']
        .filter(Boolean)
        .join(' · ')
      return `<div class="lg-dia" data-dia="${dia}"><span class="lg-dia-fecha">${escapar(fecha)}</span><span class="lg-dia-dato">${franjaDia(dia)}<span>${escapar(dato)}</span></span></div>`
    }

    function filaHtml(f: ItemFeed): string {
      const tipo = tipoDe(f)
      const leido = f.type === 'commit' ? leerCommit(f.message) : null
      const texto = leido ? leido.texto : f.message
      const alcance = leido?.alcance ? `<span class="lg-alcance">${escapar(leido.alcance)}</span>` : ''
      const t = new Date(f.timestamp).getTime()
      const nuevo = nuevosB.has(claveItem(f))
      const sha = f.type === 'commit' && f.sha
        ? `<a class="lg-sha" href="${escapar(enlaceCommit(f))}" target="_blank" rel="noopener noreferrer" aria-label="${escapar(T.motion.bitacora.verCommit)}: ${escapar(f.sha)}">${escapar(f.sha)}</a>`
        : `<a class="lg-sha" href="${escapar(enlaceCommit(f))}" target="_blank" rel="noopener noreferrer">PR</a>`
      return `<article class="lg-fila" style="--c:${COLOR_TIPO[tipo]}"${nuevo ? ' data-nuevo' : ''}>
        <span class="lg-tipo"><i></i>${escapar(T.motion.bitacora.tipos[tipo])}</span>
        <span class="lg-msg">${alcance}${escapar(texto)}${nuevo ? `<span class="lg-nuevo">${escapar(T.motion.bitacora.nuevo)}</span>` : ''}</span>
        <span class="lg-repo">${escapar(f.repo)}</span>
        ${sha}
        <time class="lg-hora" datetime="${escapar(f.timestamp)}">${Number.isFinite(t) ? reloj24(horaBogota(t)) : ''}</time>
      </article>`
    }

    function lote(): HTMLElement[] {
      const fin = Math.min(cursor + LOTE, lista.length)
      let html = ''
      for (let i = cursor; i < fin; i++) {
        const f = lista[i]
        const dia = diaBogota(new Date(f.timestamp).getTime())
        if (dia !== ultimoDia) {
          html += cabeceraDia(dia)
          ultimoDia = dia
        }
        html += filaHtml(f)
      }
      const antes = feedEl.children.length
      feedEl.insertAdjacentHTML('beforeend', html)
      cursor = fin
      if (!hayMas()) {
        observador?.disconnect()
        observador = null
        document.getElementById('feed-sentinel')?.remove()
      }
      return Array.from(feedEl.children).slice(antes) as HTMLElement[]
    }

    function pieUi() {
      document.getElementById('feed-fade')?.classList.toggle('opacity-0', !hayMas())
      if (!hayMas()) document.getElementById('feed-loader')?.classList.add('opacity-0')
    }

    function pausa() {
      observador?.disconnect()
      document.getElementById('feed-fade')?.classList.add('opacity-0')
      document.getElementById('feed-loader')?.classList.add('opacity-0')
      document.getElementById('feed-more-count')!.textContent = String(cursor)
      document.getElementById('feed-more-remaining')!.textContent = String(lista.length - cursor)
      document.getElementById('feed-more')!.classList.remove('hidden')
    }

    function masAuto() {
      if (cargando || !hayMas()) return
      cargando = true
      document.getElementById('feed-loader')?.classList.remove('opacity-0')
      window.setTimeout(() => {
        lote()
        cargando = false
        document.getElementById('feed-loader')?.classList.add('opacity-0')
        pieUi()
        if (hayMas() && ++tandas >= TANDAS_SOLAS) pausa()
      }, RETRASO_MS)
    }

    document.getElementById('feed-more-btn')?.addEventListener('click', () => {
      document.getElementById('feed-more')!.classList.add('hidden')
      tandas = 0
      lote()
      pieUi()
      const centinela = document.getElementById('feed-sentinel')
      if (hayMas() && observador && centinela) observador.observe(centinela)
    })

    function pintarLista(animar: boolean) {
      lista = filtrar(feed, filtro)
      cursor = 0
      ultimoDia = -1
      tandas = 0
      cargando = false
      observador?.disconnect()
      observador = null
      document.getElementById('feed-sentinel')?.remove()
      document.getElementById('feed-more')?.classList.add('hidden')

      const hayFiltro = !!(filtro.repo || filtro.tipo)
      limpiarEl.hidden = !hayFiltro
      resultadoEl.textContent = hayFiltro
        ? interpolar(T.motion.bitacora.resultado, { n: lista.length, total: feed.length })
        : ''

      feedEl.innerHTML = ''
      if (!lista.length) {
        feedEl.innerHTML = `<p class="lg-vacio">${escapar(feed.length ? T.motion.bitacora.vacio : T.noActivity)}</p>`
        pieUi()
        return
      }
      const nodos = lote()
      pieUi()
      if (animar && !reducido) {
        gsap.fromTo(
          nodos.slice(0, 16),
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, ease: 'expo.out', stagger: 0.022, clearProps: 'transform,opacity' },
        )
      }
      if (hayMas()) {
        const centinela = document.createElement('div')
        centinela.id = 'feed-sentinel'
        centinela.className = 'h-2'
        feedEl.after(centinela)
        observador = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && masAuto(), { rootMargin: '600px 0px' })
        observador.observe(centinela)
      }
    }

    function aplicar(nuevo: Filtro) {
      filtro = nuevo
      const url = new URL(location.href)
      filtro.repo ? url.searchParams.set('repo', filtro.repo) : url.searchParams.delete('repo')
      filtro.tipo ? url.searchParams.set('tipo', filtro.tipo) : url.searchParams.delete('tipo')
      history.replaceState(history.state, '', url)
      pintarMezcla(false)
      pintarTipos()
      pintarLista(true)
    }

    limpiarEl.addEventListener('click', () => aplicar({ repo: null, tipo: null }))

    function pintarMezcla(animar: boolean) {
      const segs = mezclaRepos(feed, total)
      if (!segs.length) {
        mezclaEl.hidden = true
        return
      }
      mezclaEl.hidden = false
      const barra = mezclaEl.querySelector<HTMLElement>('[data-mezcla-barra]')!
      const listaEl = mezclaEl.querySelector<HTMLElement>('[data-mezcla-lista]')!
      const publicos = segs.filter((s) => !s.privado)
      // Un solo tono, del más al menos activo: la barra se lee por orden y
      // por tamaño; el color no tiene que distinguir nueve proyectos.
      const color = (i: number) => `rgba(0, 242, 255, ${(0.92 - (0.62 * i) / Math.max(1, publicos.length - 1)).toFixed(2)})`
      const pct = (f: number) => (f * 100 < 1 ? '<1' : Math.round(f * 100))
      const boton = (s: (typeof segs)[number], i: number, conTexto: boolean) => {
        const nombre = s.privado ? T.motion.bitacora.privados : s.clave
        const activo = filtro.repo === s.clave
        const attrs = s.privado
          ? 'data-privado aria-disabled="true"'
          : `data-repo="${escapar(s.clave)}" aria-pressed="${activo}"`
        const titulo = `${nombre} · ${s.n} · ${pct(s.frac)}%`
        return conTexto
          ? `<button type="button" ${attrs} style="--c:${s.privado ? '' : color(i)}"><i></i>${escapar(nombre)}<b>${s.n}</b></button>`
          : `<button type="button" ${attrs} tabindex="-1" aria-hidden="true" title="${escapar(titulo)}" style="--c:${s.privado ? '' : color(i)};flex:${s.n} 1 0"></button>`
      }
      barra.innerHTML = segs.map((s, i) => boton(s, i, false)).join('')
      listaEl.innerHTML = segs.map((s, i) => boton(s, i, true)).join('')
      mezclaEl.toggleAttribute('data-activo', !!filtro.repo)
      mezclaEl.querySelectorAll<HTMLButtonElement>('button[data-repo]').forEach((b) =>
        b.addEventListener('click', () => {
          const repo = b.dataset.repo!
          aplicar({ repo: filtro.repo === repo ? null : repo, tipo: filtro.tipo })
        }),
      )
      if (animar && !reducido) {
        entrar(barra, () =>
          gsap.from(barra.children, { scaleX: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06, clearProps: 'transform' }),
        )
      }
    }

    function pintarTipos() {
      const cuenta = conteoTipos(feed, filtro.repo)
      const totalRepo = cuenta.reduce((a, c) => a + c.n, 0)
      const chip = (tipo: TipoCommit | null, n: number) => {
        const nombre = tipo ? T.motion.bitacora.tipos[tipo] : T.motion.bitacora.todos
        const activo = filtro.tipo === tipo
        return `<button type="button" data-tipo="${tipo ?? ''}" aria-pressed="${activo}" style="--c:${tipo ? COLOR_TIPO[tipo] : '#00f2ff'}">${tipo ? '<i></i>' : ''}${escapar(nombre)}<b>${n}</b></button>`
      }
      tiposEl.innerHTML = [chip(null, totalRepo), ...cuenta.map((c) => chip(c.tipo, c.n))].join('')
      tiposEl.hidden = false
      tiposEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const tipo = (b.dataset.tipo || null) as TipoCommit | null
          aplicar({ repo: filtro.repo, tipo: tipo === filtro.tipo ? null : tipo })
        }),
      )
    }

    function entrar(el: HTMLElement, fn: () => void) {
      const io = new IntersectionObserver((e) => {
        if (!e.some((x) => x.isIntersecting)) return
        io.disconnect()
        fn()
      }, { rootMargin: '0px 0px -12% 0px' })
      io.observe(el)
    }

    return {
      cargar(d: Datos, m: ModeloReloj) {
        feed = d.feed
        total = d.totalCommits
        modeloB = m
        const repos = [...new Set(feed.map((f) => f.repo))]
        filtro = filtroDeUrl(new URLSearchParams(location.search), repos)
        pintarMezcla(true)
        pintarTipos()
        pintarLista(false)
        if (!reducido && !entrado) {
          entrado = true
          const primeros = Array.from(feedEl.children).slice(0, 16) as HTMLElement[]
          gsap.set(primeros, { y: 14, opacity: 0 })
          entrar(feedEl, () =>
            gsap.to(primeros, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.03, clearProps: 'transform,opacity' }),
          )
        }
      },
      // Los nuevos siempre son los más recientes: van arriba del todo sin
      // repintar la lista, así quien está leyendo abajo no pierde su sitio.
      actualizar(d: Datos, m: ModeloReloj, nuevos: Set<string>) {
        feed = d.feed
        total = d.totalCommits
        modeloB = m
        nuevosB = nuevos
        pintarMezcla(false)
        pintarTipos()
        const recien = filtrar(feed, filtro).filter((f) => nuevos.has(claveItem(f)))
        if (!recien.length) return
        lista = filtrar(feed, filtro)
        cursor += recien.length
        feedEl.querySelector('.lg-vacio')?.remove()
        let html = ''
        let dia = -1
        for (const f of recien) {
          const df = diaBogota(new Date(f.timestamp).getTime())
          if (df !== dia) html += cabeceraDia(df)
          dia = df
          html += filaHtml(f)
        }
        // Si el último día nuevo es el que ya encabezaba la lista, su cabecera
        // vieja sobra: la nueva ya trae la cuenta del día completo.
        const primera = feedEl.querySelector<HTMLElement>('.lg-dia')
        if (primera && Number(primera.dataset.dia) === dia) primera.remove()
        feedEl.insertAdjacentHTML('afterbegin', html)
      },
      error() {
        feedEl.innerHTML = `<p class="lg-vacio">${escapar(T.loadError)}</p>`
      },
    }
  }
}
