// Lienzo animado del "filtro de capas" (hero de /security). La lógica que
// decide qué es dato y qué es ilustración vive en ./filtro.ts; aquí solo se
// mueve y se dibuja.
//
// Decisiones de lectura, no de estética:
//   · Antes del clasificador todos los puntos son grises: una petición hostil
//     no se distingue de una limpia hasta que alguien la inspecciona. El color
//     aparece justo al cruzar la capa 2, que es lo que esa capa hace.
//   · El punto "tú" existe porque es verdad por construcción: si esta página
//     se está viendo, ninguna capa detuvo la visita.
//   · Al apuntar cerca de un punto, el tiempo casi se detiene y se lee qué es;
//     nada debe escaparse de debajo del cursor mientras alguien lo lee.
//   · El clic lanza un sondeo simulado: se ve detectado y registrado, pero no
//     sale ningún request y no cambia ninguna cifra.
//
// Módulo solo de navegador.

import { CAPAS_X, SITIO_X, alcance, crearAzar, crearOnda, golpear, nuevoTipo, pasoOnda, type Destino, type Onda, type Reparto } from './filtro'

type Tramo = { categoria: string; desde: number; ancho: number; destino: Destino }
type Datos = {
  semilla: number
  reparto: Reparto
  tramos: Tramo[]
  catLabels: Record<string, string>
  yBitacora: number
  textos: {
    tu: string
    tuLlego: string
    sondeo: string
    sondeoCorto: string
    sinInspeccionar: string
    pista: string
    pistaTactil: string
    destinos: Record<Destino, string>
  }
}

type Estado = 'viaje' | 'rebote' | 'caida' | 'atrapada'
type Particula = {
  x: number
  y: number
  y0: number
  vx: number
  vy: number
  fase: number
  destino: Destino
  categoria: string | null
  estado: Estado
  t: number
  marcada: boolean
  tu?: boolean
  sondeo?: boolean
}
type Destello = { x: number; y: number; t: number; dur: number; color: string; radio: number }
type Bloqueo = { x0: number; y0: number; y1: number; t: number }

const GRIS = '196,196,204'
const EMBER = '255,107,61'
const CYAN = '0,242,255'
const VIOLETA = '167,139,255'
const LIMA = '201,255,91'

// Alto de las membranas en la escena (0..1), igual que el SVG del servidor.
const MEM_Y0 = 0.06
const MEM_Y1 = 0.78
const CICLO_CRON = 6.5

export function montarFiltro(fig: HTMLElement, opciones: { reducido: boolean }): () => void {
  const datosEl = fig.querySelector('[data-filtro-datos]')
  const escena = fig.querySelector<HTMLElement>('[data-escena]')
  const lienzo = fig.querySelector<HTMLCanvasElement>('[data-lienzo]')
  const estadoEl = fig.querySelector<HTMLElement>('[data-estado]')
  const etiqueta = fig.querySelector<HTMLElement>('[data-etiqueta-punto]')
  const aviso = fig.querySelector<HTMLElement>('[data-aviso]')
  const pista = fig.querySelector<HTMLElement>('[data-pista]')
  if (!datosEl || !escena || !lienzo) return () => {}
  const datos = JSON.parse(datosEl.textContent || '{}') as Datos

  // Con movimiento reducido la instantánea del servidor se queda; lo único que
  // se añade es la frase de la visita, que es un dato y no una animación.
  if (opciones.reducido) {
    if (estadoEl) estadoEl.textContent = datos.textos.tuLlego
    return () => {}
  }
  const ctx = lienzo.getContext('2d')
  if (!ctx) return () => {}

  const azar = crearAzar(datos.semilla)
  const ondas: Onda[] = CAPAS_X.map(() => crearOnda(48))
  const amplitud = [0, 0, 0]
  let particulas: Particula[] = []
  let destellos: Destello[] = []
  let bloqueos: Bloqueo[] = []
  let marcas: { y: number; t: number }[] = []
  const brilloTramo = datos.tramos.map(() => 0)
  let brilloSitio = 0
  let reloj = 0
  let acumulado = 0
  let w = 0
  let h = 0
  let dpr = 1
  let tuNacio = false
  const finoPuntero = window.matchMedia('(hover: hover) and (pointer: fine)').matches

  // ── Tamaño ──────────────────────────────────────────────────────────────
  const medir = () => {
    const r = escena.getBoundingClientRect()
    w = r.width
    h = r.height
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    lienzo.width = Math.round(w * dpr)
    lienzo.height = Math.round(h * dpr)
  }
  medir()
  const ro = new ResizeObserver(medir)
  ro.observe(escena)

  // Ritmo de llegada proporcional al ancho: en un celular la escena es un
  // tercio de la de escritorio y con el mismo caudal se volvía una mancha.
  const porSegundo = () => 13 * Math.min(1.3, Math.max(0.5, w / 560))

  // ── Simulación ──────────────────────────────────────────────────────────
  const nacer = (extra: Partial<Particula> = {}): Particula => {
    const tipo = nuevoTipo(datos.reparto, azar)
    const y0 = 0.1 + azar() * 0.62
    return {
      x: -0.02,
      y: y0,
      y0,
      vx: (tipo.destino === 'limpia' ? 0.12 : 0.1) * (0.8 + azar() * 0.45),
      vy: 0,
      fase: azar() * Math.PI * 2,
      destino: tipo.destino,
      categoria: tipo.categoria,
      estado: 'viaje',
      t: 0,
      marcada: false,
      ...extra,
    }
  }

  const enMembrana = (y: number) => (y - MEM_Y0) / (MEM_Y1 - MEM_Y0)
  const destello = (x: number, y: number, color: string, radio = 16, dur = 0.7) =>
    destellos.push({ x, y, t: 0, dur, color, radio })

  const iluminarTramo = (categoria: string | null, destino: Destino) => {
    let i = datos.tramos.findIndex((tr) => tr.categoria === categoria)
    if (i < 0) i = datos.tramos.findIndex((tr) => tr.categoria === 'otros')
    if (i < 0) i = datos.tramos.findIndex((tr) => tr.destino === destino)
    if (i >= 0) brilloTramo[i] = 1
  }

  const cruzar = (p: Particula, capa: number) => {
    const hostil = p.destino !== 'limpia'
    if (capa === 0) {
      golpear(ondas[0], enMembrana(p.y), hostil ? 7 : 4)
      return
    }
    if (capa === 1) {
      if (!hostil) {
        golpear(ondas[1], enMembrana(p.y), 4)
        return
      }
      p.marcada = true
      golpear(ondas[1], enMembrana(p.y), 22)
      destello(p.x, p.y, EMBER, 14, 0.55)
      if (p.destino === 'frenada') {
        p.estado = 'rebote'
        p.t = 0
        p.vx = -Math.abs(p.vx) * 0.5
        iluminarTramo(p.categoria, p.destino)
      }
      return
    }
    if (capa === 2) {
      if (p.destino === 'senuelo') {
        p.estado = 'atrapada'
        p.t = 0
        p.x = CAPAS_X[2]
        golpear(ondas[2], enMembrana(p.y), 30)
        destello(p.x, p.y, VIOLETA, 22, 1)
        iluminarTramo(p.categoria, p.destino)
      } else {
        golpear(ondas[2], enMembrana(p.y), 4)
      }
    }
  }

  const avanzar = (dt: number) => {
    reloj += dt
    acumulado += dt * porSegundo()
    while (acumulado >= 1) {
      acumulado -= 1
      particulas.push(nacer())
    }

    for (const p of particulas) {
      p.t += dt
      if (p.estado === 'viaje') {
        const antes = p.x
        p.x += p.vx * dt
        p.y = p.y0 + Math.sin(p.fase + p.x * 9) * 0.008
        for (let i = 0; i < CAPAS_X.length; i++) if (antes < CAPAS_X[i] && p.x >= CAPAS_X[i]) cruzar(p, i)
        if (p.destino === 'registrada' && p.marcada && p.x >= alcance('registrada')) {
          p.estado = 'caida'
          p.vy = 0.02
          p.t = 0
        }
        if (p.destino === 'limpia' && p.x >= SITIO_X) {
          p.t = -1
          brilloSitio = Math.min(1, brilloSitio + (p.tu ? 1 : 0.22))
          if (p.tu) {
            destello(SITIO_X, p.y, CYAN, 34, 1.4)
            if (estadoEl) estadoEl.textContent = datos.textos.tuLlego
          }
        }
      } else if (p.estado === 'rebote') {
        p.x += p.vx * dt
      } else if (p.estado === 'caida') {
        p.vy += 0.9 * dt
        p.x += p.vx * 0.5 * dt
        p.y += p.vy * dt
        if (p.y >= datos.yBitacora) {
          p.t = -1
          iluminarTramo(p.categoria, p.destino)
          destello(p.x, datos.yBitacora, EMBER, 9, 0.45)
        }
      }
    }
    // t = -1 marca "llegó a su sitio" en este fotograma.
    particulas = particulas.filter(
      (p) =>
        p.t !== -1 &&
        !(p.estado === 'rebote' && p.t > 0.9) &&
        !(p.estado === 'atrapada' && p.t > 1.4) &&
        p.x < 1.05,
    )

    for (let i = 0; i < ondas.length; i++) amplitud[i] = pasoOnda(ondas[i], dt)
    for (let i = 0; i < brilloTramo.length; i++) brilloTramo[i] = Math.max(0, brilloTramo[i] - dt * 1.6)
    brilloSitio = Math.max(0, brilloSitio - dt * 0.8)
    for (const d of destellos) d.t += dt
    destellos = destellos.filter((d) => d.t < d.dur)
    for (const m of marcas) m.t += dt
    marcas = marcas.filter((m) => m.t < 4)

    // Capa 4: el cron barre la bitácora y devuelve un bloqueo al
    // clasificador. Va por fuera del camino del request, como en el sistema.
    const fase = reloj % CICLO_CRON
    if (fase < dt && reloj > 1) {
      bloqueos.push({
        x0: CAPAS_X[1] + (SITIO_X - CAPAS_X[1]) * (0.35 + azar() * 0.6),
        y0: datos.yBitacora,
        y1: 0.15 + azar() * 0.55,
        t: -1.1,
      })
    }
    for (const b of bloqueos) {
      b.t += dt
      if (b.t >= 1 && b.t - dt < 1) {
        marcas.push({ y: b.y1, t: 0 })
        golpear(ondas[1], enMembrana(b.y1), 16)
        destello(CAPAS_X[1], b.y1, LIMA, 14, 0.8)
      }
    }
    bloqueos = bloqueos.filter((b) => b.t < 1)
  }

  // Precalentado: la escena arranca poblada, como la instantánea del
  // servidor, en vez de ver llegar los primeros puntos a un lienzo vacío.
  for (let i = 0; i < 9 * 30; i++) avanzar(1 / 30)
  destellos = []

  // ── Dibujo ──────────────────────────────────────────────────────────────
  const X = (x: number) => x * w
  const Y = (y: number) => y * h
  const escalaOnda = () => w * 0.014

  const dibujarMembrana = (i: number) => {
    const onda = ondas[i]
    const n = onda.y.length - 1
    const x0 = X(CAPAS_X[i])
    const k = escalaOnda()
    ctx.beginPath()
    for (let j = 0; j <= n; j++) {
      const y = Y(MEM_Y0 + (MEM_Y1 - MEM_Y0) * (j / n))
      const x = x0 + onda.y[j] * k
      if (j === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    if (i === 0) {
      ctx.setLineDash([3, 7])
      ctx.strokeStyle = 'rgba(133,133,143,.55)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])
      return
    }
    const color = i === 1 ? CYAN : VIOLETA
    // Dos trazos en vez de shadowBlur: el halo con sombra cuesta un pase de
    // desenfoque por fotograma y en un portátil sin GPU dedicada se nota.
    ctx.strokeStyle = `rgba(${color},${0.1 + Math.min(0.25, amplitud[i] * 0.12)})`
    ctx.lineWidth = 7
    ctx.stroke()
    ctx.strokeStyle = `rgba(${color},.85)`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  const dibujar = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    for (let i = 0; i < ondas.length; i++) dibujarMembrana(i)

    // Entradas de la lista de bloqueo que dejó el cron en la capa 2.
    for (const m of marcas) {
      const a = m.t < 0.3 ? m.t / 0.3 : 1 - Math.max(0, m.t - 3) / 1
      ctx.strokeStyle = `rgba(${LIMA},${0.85 * a})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(X(CAPAS_X[1]) - 7, Y(m.y))
      ctx.lineTo(X(CAPAS_X[1]) + 7, Y(m.y))
      ctx.stroke()
    }

    // Sitio.
    const sx = X(SITIO_X)
    const grad = ctx.createLinearGradient(0, Y(MEM_Y0), 0, Y(MEM_Y1))
    grad.addColorStop(0, `rgba(${CYAN},0)`)
    grad.addColorStop(0.5, `rgba(${CYAN},${0.55 + brilloSitio * 0.45})`)
    grad.addColorStop(1, `rgba(${CYAN},0)`)
    ctx.fillStyle = grad
    ctx.fillRect(sx - 2, Y(MEM_Y0), 4, Y(MEM_Y1) - Y(MEM_Y0))
    if (brilloSitio > 0.02) {
      const g2 = ctx.createRadialGradient(sx, Y(0.42), 0, sx, Y(0.42), w * 0.14)
      g2.addColorStop(0, `rgba(${CYAN},${brilloSitio * 0.16})`)
      g2.addColorStop(1, `rgba(${CYAN},0)`)
      ctx.fillStyle = g2
      ctx.fillRect(sx - w * 0.14, Y(0.42) - w * 0.14, w * 0.28, w * 0.28)
    }

    // Bitácora: el reparto real, con el tramo que recibe un punto encendido.
    const bx0 = X(CAPAS_X[1])
    const bx1 = X(SITIO_X)
    const by = Y(datos.yBitacora)
    datos.tramos.forEach((tr, i) => {
      const color = tr.destino === 'senuelo' ? VIOLETA : EMBER
      const base = tr.destino === 'registrada' ? 0.45 : 0.9
      ctx.fillStyle = `rgba(${color},${Math.min(1, base + brilloTramo[i] * 0.55)})`
      const x = bx0 + tr.desde * (bx1 - bx0) + 1
      const ancho = Math.max(1, tr.ancho * (bx1 - bx0) - 2)
      ctx.beginPath()
      ctx.roundRect(x, by - 5 - brilloTramo[i] * 2, ancho, 10 + brilloTramo[i] * 4, 2)
      ctx.fill()
    })
    // Barrido del cron sobre la bitácora.
    const fase = reloj % CICLO_CRON
    if (fase < 1.1) {
      const u = fase / 1.1
      const cx = bx0 + (bx1 - bx0) * u
      const g = ctx.createLinearGradient(cx - 40, 0, cx, 0)
      g.addColorStop(0, `rgba(${LIMA},0)`)
      g.addColorStop(1, `rgba(${LIMA},.35)`)
      ctx.fillStyle = g
      ctx.fillRect(cx - 40, by - 12, 40, 24)
      ctx.fillStyle = `rgba(${LIMA},.95)`
      ctx.fillRect(cx - 1, by - 12, 2, 24)
    }

    // Bloqueos en vuelo, de la bitácora a la capa 2 por una curva.
    for (const b of bloqueos) {
      if (b.t < 0) continue
      const u = b.t
      const e = 1 - Math.pow(1 - u, 3)
      const cxp = (b.x0 + CAPAS_X[1]) / 2
      const cyp = Math.min(b.y0, b.y1) - 0.12
      const x = (1 - e) * (1 - e) * b.x0 + 2 * (1 - e) * e * cxp + e * e * CAPAS_X[1]
      const y = (1 - e) * (1 - e) * b.y0 + 2 * (1 - e) * e * cyp + e * e * b.y1
      ctx.fillStyle = `rgba(${LIMA},.95)`
      ctx.beginPath()
      ctx.arc(X(x), Y(y), 2.6, 0, Math.PI * 2)
      ctx.fill()
    }

    // Puntos.
    for (const p of particulas) {
      let color = GRIS
      let alfa = 0.6
      let r = 2.2
      if (p.marcada) {
        color = p.destino === 'senuelo' ? VIOLETA : EMBER
        alfa = 1
        r = 2.9
      }
      if (p.destino === 'senuelo' && p.estado === 'atrapada') color = VIOLETA
      if (p.estado === 'rebote') alfa *= 1 - p.t / 0.9
      if (p.estado === 'atrapada') alfa *= 1 - p.t / 1.4
      if (p.tu) {
        color = CYAN
        alfa = 1
        r = 3.4
      }
      const px = X(p.x)
      const py = Y(p.y)
      // Estela: dónde estaba el punto hace un instante, en la dirección real
      // de su movimiento (hacia atrás si rebota, en diagonal si cae).
      const cola = p.estado === 'caida' ? 0.16 : 0.22
      const qx = px - p.vx * w * cola
      const qy = py - p.vy * h * cola
      const g = ctx.createLinearGradient(qx, qy, px, py)
      g.addColorStop(0, `rgba(${color},0)`)
      g.addColorStop(1, `rgba(${color},${alfa * 0.55})`)
      ctx.strokeStyle = g
      ctx.lineWidth = r * 0.9
      ctx.beginPath()
      ctx.moveTo(qx, qy)
      ctx.lineTo(px, py)
      ctx.stroke()
      ctx.fillStyle = `rgba(${color},${alfa})`
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
      if (p.estado === 'rebote' && p.t < 0.5) {
        // Una cruz breve: frenada, no desviada.
        const a = 1 - p.t / 0.5
        ctx.strokeStyle = `rgba(${EMBER},${a})`
        ctx.lineWidth = 1.5
        const cx = X(CAPAS_X[1]) - 6
        ctx.beginPath()
        ctx.moveTo(cx - 4, py - 4)
        ctx.lineTo(cx + 4, py + 4)
        ctx.moveTo(cx + 4, py - 4)
        ctx.lineTo(cx - 4, py + 4)
        ctx.stroke()
      }
      if (p.sondeo && !p.marcada) {
        // El sondeo es del visitante: él sí sabe qué es antes de la capa 2,
        // así que se dibuja con un aro para poder seguirlo entre los grises.
        ctx.strokeStyle = `rgba(${EMBER},.9)`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(px, py, r + 2.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (p.tu) {
        const pulso = (reloj * 1.2) % 1
        ctx.strokeStyle = `rgba(${CYAN},${0.6 * (1 - pulso)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(px, py, r + 3 + pulso * 10, 0, Math.PI * 2)
        ctx.stroke()
        ctx.font = '500 10px "JetBrains Mono Variable", ui-monospace, monospace'
        ctx.fillStyle = `rgba(${CYAN},1)`
        ctx.textAlign = 'center'
        ctx.fillText(datos.textos.tu, px, py - 12)
      }
    }

    for (const d of destellos) {
      const u = d.t / d.dur
      ctx.strokeStyle = `rgba(${d.color},${0.8 * (1 - u)})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(X(d.x), Y(d.y), 2 + d.radio * (1 - Math.pow(1 - u, 2)), 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // ── Puntero: leer un punto, lanzar un sondeo ────────────────────────────
  let raton: { x: number; y: number } | null = null
  let leyendo: Particula | null = null
  let escalaTiempo = 1

  const cercano = (): Particula | null => {
    if (!raton) return null
    let mejor: Particula | null = null
    let dmin = 16 * 16
    for (const p of particulas) {
      const dx = X(p.x) - raton.x
      const dy = Y(p.y) - raton.y
      const d = dx * dx + dy * dy
      if (d < dmin) {
        dmin = d
        mejor = p
      }
    }
    return mejor
  }

  const pintarEtiqueta = () => {
    if (!etiqueta) return
    if (!leyendo) {
      etiqueta.hidden = true
      return
    }
    const p = leyendo
    const inspeccionada = p.x >= CAPAS_X[1] || p.estado !== 'viaje'
    let titulo: string
    let sub = ''
    if (p.tu) titulo = datos.textos.tu
    else if (!inspeccionada) {
      // Antes de la capa 2 nadie sabe qué es un punto, y la etiqueta tampoco:
      // decir "limpia" aquí delataría a los hostiles por descarte.
      titulo = datos.textos.sinInspeccionar
    } else if (p.sondeo) {
      titulo = datos.textos.sondeoCorto
      sub = datos.textos.destinos.registrada
    } else if (p.destino === 'limpia') {
      titulo = datos.textos.destinos.limpia
    } else {
      titulo = datos.catLabels[p.categoria ?? ''] ?? p.categoria ?? ''
      sub = datos.textos.destinos[p.destino]
    }
    etiqueta.innerHTML = ''
    etiqueta.append(document.createTextNode(titulo))
    if (sub) {
      const small = document.createElement('small')
      small.textContent = sub
      etiqueta.append(small)
    }
    etiqueta.hidden = false
    const ew = etiqueta.offsetWidth
    const eh = etiqueta.offsetHeight
    const x = Math.min(w - ew - 6, Math.max(6, X(p.x) + 12))
    const y = Math.min(h - eh - 6, Math.max(6, Y(p.y) - eh - 10))
    etiqueta.style.left = `${x}px`
    etiqueta.style.top = `${y}px`
  }

  const alMover = (e: PointerEvent) => {
    const r = escena.getBoundingClientRect()
    raton = { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const alSalir = () => {
    raton = null
    leyendo = null
    pintarEtiqueta()
  }
  let avisoHasta = 0
  // Tras un clic, el cursor sigue sobre la escena y frenaba el tiempo justo
  // cuando había que ver el sondeo cruzar: unos segundos sin cámara lenta.
  let sinPausaHasta = 0
  const alClic = (e: PointerEvent) => {
    const r = escena.getBoundingClientRect()
    const cx = Math.min((e.clientX - r.left) / w, CAPAS_X[1] - 0.08)
    const cy = Math.min(0.72, Math.max(0.1, (e.clientY - r.top) / h))
    for (let i = 0; i < 7; i++) {
      const y0 = cy + (azar() - 0.5) * 0.12
      particulas.push({
        x: Math.max(0, cx - azar() * 0.06),
        y: y0,
        y0,
        vx: 0.16 + azar() * 0.05,
        vy: 0,
        fase: azar() * 6,
        destino: 'registrada',
        categoria: null,
        estado: 'viaje',
        t: 0,
        marcada: false,
        sondeo: true,
      })
    }
    if (aviso) {
      aviso.textContent = datos.textos.sondeo
      aviso.hidden = false
      avisoHasta = reloj + 3.2
    }
    sinPausaHasta = reloj + 3
  }
  escena.addEventListener('pointermove', alMover, { passive: true })
  escena.addEventListener('pointerleave', alSalir)
  escena.addEventListener('pointerdown', alClic)

  if (pista) {
    pista.textContent = finoPuntero ? datos.textos.pista : datos.textos.pistaTactil
    pista.hidden = false
  }

  // ── Bucle ───────────────────────────────────────────────────────────────
  let raf = 0
  let visible = false
  let ultimo = 0
  const cuadro = (ahora: number) => {
    raf = requestAnimationFrame(cuadro)
    const dt = Math.min(0.05, ultimo ? (ahora - ultimo) / 1000 : 1 / 60)
    ultimo = ahora

    if (!tuNacio && reloj > 0) {
      tuNacio = true
      // Nace ya dentro de la escena, a la izquierda: cruza las capas en unos
      // seis segundos, lo que tarda en leerse el titular.
      particulas.push({ ...nacer(), x: 0.02, y: 0.44, y0: 0.44, vx: 0.15, destino: 'limpia', categoria: null, tu: true })
    }

    leyendo = finoPuntero && reloj > sinPausaHasta ? cercano() : null
    const objetivo = leyendo ? 0.06 : 1
    escalaTiempo += (objetivo - escalaTiempo) * Math.min(1, dt * 8)
    avanzar(dt * escalaTiempo)
    if (aviso && !aviso.hidden && reloj > avisoHasta) aviso.hidden = true
    dibujar()
    pintarEtiqueta()
  }
  const arrancar = () => {
    if (raf || !visible || document.hidden) return
    ultimo = 0
    raf = requestAnimationFrame(cuadro)
  }
  const parar = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible) arrancar()
    else parar()
  })
  io.observe(fig)
  const alVisibilidad = () => (document.hidden ? parar() : arrancar())
  document.addEventListener('visibilitychange', alVisibilidad)

  dibujar()
  fig.dataset.vivo = ''

  return () => {
    parar()
    io.disconnect()
    ro.disconnect()
    document.removeEventListener('visibilitychange', alVisibilidad)
    escena.removeEventListener('pointermove', alMover)
    escena.removeEventListener('pointerleave', alSalir)
    escena.removeEventListener('pointerdown', alClic)
    delete fig.dataset.vivo
  }
}
