// Hilo de la caja "Pregunta o busca algo" del dashboard: manda la pregunta a
// /api/admin/asistente, lee la transmisión en vivo (SSE) y la pinta por
// turnos: la pregunta, los pasos que da el asistente, la respuesta y, si
// propone crear algo, la tarjeta para aprobarlo.
//
// Todo se construye con nodos y textContent, nunca con innerHTML: la respuesta
// la escribe un modelo que leyó mensajes de terceros, y un enlace o una
// etiqueta inyectados en su texto no pueden convertirse en HTML del panel.
//
// Solo navegador.

import type { VistaCambio } from '../../lib/asistente/escrituras/cambio'

export type VistaCuenta = {
  tipo: 'cuenta_cobro'
  cliente: { id: number; nombre: string }
  proyecto: { id: number; titulo: string } | null
  concepto: string
  ciudad: string | null
  vence: string | null
  periodo: { desde: string | null; hasta: string | null } | null
  lineas: { descripcion: string; cantidad: number; valorUnitario: string; total: string }[]
  subtotal: { texto: string }
  retenciones: { nombre: string; valor: { texto: string }; aplicada: boolean; motivo: string | null }[]
  neto: { texto: string }
  faltantesParaEmitir: string[]
}

export type Vista = VistaCuenta | VistaCambio

export type Propuesta = { origen: string; motivo: string; herramienta?: string; vista?: Vista }

export type TurnoInicial = { pregunta: string; respuesta: string; pasos: string[] }

export type EstadoInicial = {
  id: string
  estado: string
  turnos: TurnoInicial[]
  propuesta: Propuesta | null
  error: string | null
}

type Evento =
  | { tipo: 'conversacion'; id: string }
  | { tipo: 'paso'; id: string; herramienta: string; entrada: Record<string, unknown> }
  | { tipo: 'dato'; herramienta: string; datos: any }
  | { tipo: 'texto'; texto: string }
  | ({ tipo: 'aprobacion' } & Propuesta)
  | { tipo: 'decision'; origen: string; aprobado: boolean }
  | { tipo: 'fin'; estado: string; iteraciones: number; costoUsd: number; error: string | null }
  | { tipo: 'error'; mensaje: string }

const cita = (v: unknown, max = 40) => {
  const s = String(v ?? '').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// Lo que se lee en pantalla mientras el asistente consulta. Pensado para
// leerse de corrido, no como nombres de funciones.
const PASOS: Record<string, (e: Record<string, unknown>) => string> = {
  clientes: () => 'Revisando tus clientes y lo que deben',
  cuentas_cobro: () => 'Mirando las cuentas de cobro',
  pagos_recibidos: (e) => (e.mes ? `Buscando quién te pagó en ${e.mes}` : 'Buscando quién te pagó'),
  vencimientos: (e) => (e.tipo === 'dominios' ? 'Revisando qué dominios vencen' : 'Revisando qué vence pronto'),
  buscar_en_panel: (e) => `Buscando «${cita(e.consulta)}» en el panel`,
  proyectos: () => 'Revisando los proyectos',
  proyecto: (e) => `Abriendo el proyecto «${cita(e.buscar)}»`,
  finanzas: (e) => (e.mes ? `Revisando las finanzas de ${e.mes}` : 'Revisando las finanzas del mes'),
  briefings: () => 'Revisando las cotizaciones',
  mensajes: () => 'Leyendo la bandeja de mensajes',
  seguimiento: () => 'Revisando tus pendientes',
  paginas: () => 'Revisando páginas y crons',
  documentacion: (e) => `Consultando la documentación sobre «${cita(e.consulta)}»`,
  crear_cuenta_cobro: () => 'Creando la cuenta de cobro',
  actualizar_proyecto: () => 'Guardando el cambio en el proyecto',
  actualizar_hito: () => 'Guardando el cambio en el hito',
  registrar_seguimiento: () => 'Anotando en el seguimiento',
  marcar_mensaje_leido: () => 'Marcando los mensajes',
}
const pasoDe = (h: string, e: Record<string, unknown> = {}) => (PASOS[h] ?? (() => `Consultando ${h}`))(e)

const usd = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 })

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', texto?: string) {
  const n = document.createElement(tag)
  if (clase) n.className = clase
  if (texto !== undefined) n.textContent = texto
  return n
}

/** Solo rutas internas: "/admin/…" o "/docs…". Nada de dominios ni "//" ni javascript:. */
const rutaSegura = (href: string) => /^\/(?!\/)[\w\-./?=&#%]*$/.test(href)

/** Una línea con **negrita** y [texto](/ruta) a nodos. */
function enLinea(texto: string, destino: HTMLElement) {
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let ultimo = 0
  for (const m of texto.matchAll(re)) {
    if (m.index! > ultimo) destino.append(texto.slice(ultimo, m.index))
    if (m[1]) destino.append(el('strong', '', m[1]))
    else if (rutaSegura(m[3]!)) {
      const a = el('a', 'enlace', m[2]!)
      a.href = m[3]!
      destino.append(a)
    } else destino.append(m[2]!)
    ultimo = m.index! + m[0].length
  }
  if (ultimo < texto.length) destino.append(texto.slice(ultimo))
}

/** Párrafos, listas con "- " o "1.", negrita y enlaces internos. */
export function pintarTexto(texto: string, destino: HTMLElement) {
  let lista: HTMLElement | null = null
  for (const cruda of texto.split('\n')) {
    const linea = cruda.trim()
    if (!linea) {
      lista = null
      continue
    }
    const item = linea.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (item) {
      if (!lista) {
        lista = el(/^\d/.test(linea) ? 'ol' : 'ul', 'resp-lista')
        destino.append(lista)
      }
      const li = el('li')
      enLinea(item[1]!, li)
      lista.append(li)
    } else {
      lista = null
      // Un "## título" se lee como un párrafo en negrita: la caja no usa títulos.
      const p = el('p', linea.startsWith('#') ? 'resp-p resp-fuerte' : 'resp-p')
      enLinea(linea.replace(/^#+\s*/, ''), p)
      destino.append(p)
    }
  }
}

type Turno = {
  raiz: HTMLElement
  pasos: HTMLOListElement
  respuesta: HTMLDivElement
  pie: HTMLDivElement
  tarjeta: HTMLDivElement | null
  pensando: HTMLElement | null
  costo: number
}

type OpcionesHilo = {
  hilo: HTMLElement
  /** Cambia el id de la conversación (para la URL y el botón "Nueva"). */
  alCambiarId: (id: string | null) => void
  /** Ocupado = no se puede mandar otra pregunta. */
  alOcupar: (ocupado: boolean) => void
  /** "Pedir cambios": enfocar la caja con una pista. */
  pedirCambios: () => void
}

export function crearHilo({ hilo, alCambiarId, alOcupar, pedirCambios }: OpcionesHilo) {
  let id: string | null = null
  let ocupado = false
  let actual: Turno | null = null
  let pendiente: Turno | null = null
  /** La herramienta que se ejecuta si Mike aprueba: el paso que se pinta al hacer clic. */
  let herramientaPendiente = 'crear_cuenta_cobro'

  const ocupar = (v: boolean) => {
    ocupado = v
    alOcupar(v)
    hilo.setAttribute('aria-busy', String(v))
  }

  function nuevoTurno(pregunta: string): Turno {
    hilo.hidden = false
    const raiz = el('article', 'turno entra')
    const q = el('div', 'turno-pregunta')
    q.append(el('span', 'turno-quien', 'Tú'), el('p', '', pregunta))
    const cuerpo = el('div', 'turno-cuerpo')
    const pasos = el('ol', 'turno-pasos')
    const respuesta = el('div', 'turno-respuesta')
    const pie = el('div', 'turno-pie')
    cuerpo.append(pasos, respuesta)
    raiz.append(q, cuerpo, pie)
    hilo.append(raiz)
    return { raiz, pasos, respuesta, pie, tarjeta: null, pensando: null, costo: 0 }
  }

  function pensando(t: Turno, si: boolean, texto = 'Pensando') {
    t.pensando?.remove()
    t.pensando = null
    if (!si) return
    const p = el('div', 'pensando')
    const ondas = el('span', 'ondas')
    ondas.append(el('i'), el('i'), el('i'))
    p.append(ondas, el('span', '', texto))
    t.raiz.querySelector('.turno-cuerpo')!.append(p)
    t.pensando = p
  }

  function paso(t: Turno, h: string, entrada: Record<string, unknown> = {}, hecho = false) {
    t.pasos.querySelectorAll('.paso.activo').forEach((n) => n.classList.remove('activo'))
    const li = el('li', `paso entra${hecho ? '' : ' activo'}`)
    li.append(el('span', 'paso-punto'), el('span', '', pasoDe(h, entrada)))
    t.pasos.append(li)
  }

  function avisar(t: Turno, mensaje: string, accion?: { texto: string; hacer: () => void }) {
    const caja = el('div', 'turno-aviso entra')
    caja.append(el('p', '', mensaje))
    if (accion) {
      const b = el('button', 'boton-sec', accion.texto)
      b.type = 'button'
      b.addEventListener('click', accion.hacer)
      caja.append(b)
    }
    t.respuesta.append(caja)
  }

  function tarjetaCuenta(v: VistaCuenta): HTMLElement {
    const c = el('div', 'tarjeta-cuenta')
    const cab = el('div', 'tc-cab')
    const tit = el('div')
    tit.append(el('span', 'tc-rotulo', 'Cuenta de cobro · borrador'), el('h4', 'tc-cliente', v.cliente.nombre))
    if (v.proyecto) tit.append(el('span', 'tc-proyecto', v.proyecto.titulo))
    const total = el('div', 'tc-total')
    total.append(el('span', 'tc-rotulo', 'Total'), el('strong', '', v.subtotal.texto))
    cab.append(tit, total)
    c.append(cab, el('p', 'tc-concepto', v.concepto))

    const tabla = el('table', 'tc-lineas')
    const thead = el('thead')
    const trh = el('tr')
    for (const h of ['Concepto', 'Cant.', 'Valor', 'Total']) trh.append(el('th', '', h))
    thead.append(trh)
    const tbody = el('tbody')
    for (const l of v.lineas) {
      const tr = el('tr')
      tr.append(el('td', '', l.descripcion), el('td', 'num', String(l.cantidad)), el('td', 'num', l.valorUnitario), el('td', 'num', l.total))
      tbody.append(tr)
    }
    tabla.append(thead, tbody)
    c.append(tabla)

    const resumen = el('dl', 'tc-resumen')
    const fila = (dt: string, dd: string, clase = '') => {
      const d = el('div', clase)
      d.append(el('dt', '', dt), el('dd', '', dd))
      resumen.append(d)
    }
    fila('Subtotal', v.subtotal.texto)
    for (const r of v.retenciones) fila(r.nombre, r.aplicada ? `- ${r.valor.texto}` : `no aplica (${r.motivo ?? 'sin base'})`, 'tc-ret')
    fila('Neto que recibes', v.neto.texto, 'tc-neto')
    c.append(resumen)

    const datos = [v.vence ? `Vence el ${v.vence}` : 'Sin fecha de vencimiento', v.ciudad ? `Expedida en ${v.ciudad}` : null].filter(Boolean)
    c.append(el('p', 'tc-datos', datos.join(' · ')))

    if (v.faltantesParaEmitir.length) {
      const f = el('div', 'tc-faltan')
      f.append(el('span', 'tc-rotulo', 'Para poder emitirla falta'))
      const ul = el('ul')
      for (const x of v.faltantesParaEmitir) ul.append(el('li', '', x))
      f.append(ul)
      c.append(f)
    }
    return c
  }

  /** Antes y después, campo por campo. Lo que sale del panel va arriba y en grande. */
  function tarjetaCambio(v: VistaCambio): HTMLElement {
    const c = el('div', 'tarjeta-cambio')
    const cab = el('div', 'tm-cab')
    cab.append(el('span', 'tc-rotulo', v.rotulo), el('h4', 'tm-titulo', v.titulo))
    if (v.contexto) cab.append(el('span', 'tc-proyecto', v.contexto))
    c.append(cab)

    if (v.avisos.length) {
      const a = el('div', 'tm-avisos')
      a.setAttribute('role', 'note')
      for (const x of v.avisos) a.append(el('p', '', x))
      c.append(a)
    }

    const lista = el('dl', 'tm-cambios')
    for (const x of v.cambios) {
      const fila = el('div', 'tm-fila')
      const valores = el('dd', 'tm-valores')
      if (x.antes !== null) {
        valores.append(el('s', 'tm-antes', x.antes))
        const flecha = el('span', 'tm-flecha', '→')
        flecha.setAttribute('aria-label', 'pasa a')
        valores.append(flecha)
      }
      valores.append(el('span', x.despues === null ? 'tm-despues tm-vacio' : 'tm-despues', x.despues ?? 'vacío'))
      fila.append(el('dt', '', x.campo), valores)
      lista.append(fila)
    }
    c.append(lista)
    return c
  }

  function tarjeta(t: Turno, p: Propuesta, conBotones: boolean) {
    t.tarjeta?.remove()
    const caja = el('div', 'turno-tarjeta entra')
    const v = p.vista
    caja.append(
      v?.tipo === 'cuenta_cobro' ? tarjetaCuenta(v) : v?.tipo === 'cambio' ? tarjetaCambio(v) : el('p', 'resp-p', `${p.origen}: ${p.motivo}`)
    )
    const pie = el('div', 'tarjeta-pie')
    if (conBotones) {
      pie.append(el('span', 'tarjeta-nota', v?.tipo === 'cambio' ? v.nota : 'Queda en borrador. Emitirla y enviarla sigue siendo tuyo.'))
      const acciones = el('div', 'tarjeta-acciones')
      const cambios = el('button', 'boton-sec', 'Pedir cambios')
      cambios.type = 'button'
      cambios.addEventListener('click', pedirCambios)
      const no = el('button', 'boton-sec', 'Descartar')
      no.type = 'button'
      no.addEventListener('click', () => decidir(false))
      const si = el('button', 'boton-pri', v?.tipo === 'cambio' ? v.boton : 'Aprobar y crear')
      si.type = 'button'
      si.addEventListener('click', () => decidir(true))
      acciones.append(cambios, no, si)
      pie.append(acciones)
    }
    caja.append(pie)
    t.respuesta.append(caja)
    t.tarjeta = caja
  }

  function cerrarTarjeta(t: Turno | null, estado: 'aprobada' | 'descartada' | 'cambios') {
    if (!t?.tarjeta) return
    t.tarjeta.classList.add(`estado-${estado}`)
    const pie = t.tarjeta.querySelector('.tarjeta-pie')!
    pie.replaceChildren(el('span', 'tarjeta-sello', estado === 'aprobada' ? 'Aprobada' : estado === 'cambios' ? 'Pediste cambios' : 'Descartada'))
  }

  function pie(t: Turno, estado: string, costo: number) {
    t.costo += costo
    t.pie.replaceChildren()
    if (estado === 'esperando_aprobacion') t.pie.append(el('span', 'pie-espera', 'Esperando tu decisión'))
    if (t.costo > 0) t.pie.append(el('span', '', usd.format(t.costo)))
  }

  /** Lee la transmisión y la reparte en el turno. */
  async function leer(resp: Response, t: Turno) {
    const reader = resp.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let textoVisto = false
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let corte: number
      while ((corte = buf.indexOf('\n\n')) >= 0) {
        const bloque = buf.slice(0, corte)
        buf = buf.slice(corte + 2)
        const linea = bloque.split('\n').find((l) => l.startsWith('data: '))
        if (!linea) continue
        let ev: Evento
        try {
          ev = JSON.parse(linea.slice(6))
        } catch {
          continue
        }
        switch (ev.tipo) {
          case 'conversacion':
            id = ev.id
            alCambiarId(id)
            break
          case 'paso':
            paso(t, ev.herramienta, ev.entrada)
            pensando(t, true, 'Leyendo lo que encontró')
            break
          case 'dato':
            t.pasos.querySelectorAll('.paso.activo').forEach((n) => n.classList.remove('activo'))
            if (ev.datos?.creada || ev.datos?.hecho) {
              const enlace = String(ev.datos.enlace ?? '')
              const texto = ev.datos.creada ? `${ev.datos.numero} creada en borrador` : String(ev.datos.resumen ?? 'Listo')
              const ok = el('div', 'turno-hecho entra')
              if (rutaSegura(enlace)) {
                const a = el('a', 'enlace', `${texto} →`)
                a.href = enlace
                ok.append(a)
              } else ok.append(el('span', '', texto))
              t.respuesta.append(ok)
            }
            pensando(t, true)
            break
          case 'texto': {
            const bloque = el('div', `resp-bloque entra${textoVisto ? ' resp-siguiente' : ''}`)
            pintarTexto(ev.texto, bloque)
            t.respuesta.append(bloque)
            textoVisto = true
            pensando(t, true)
            break
          }
          case 'aprobacion':
            pensando(t, false)
            tarjeta(t, ev, true)
            pendiente = t
            if (ev.herramienta) herramientaPendiente = ev.herramienta
            break
          case 'decision':
            break
          case 'fin':
            pensando(t, false)
            t.pasos.querySelectorAll('.paso.activo').forEach((n) => n.classList.remove('activo'))
            if (ev.estado === 'fallida' && ev.error) avisar(t, ev.error)
            pie(t, ev.estado, ev.costoUsd)
            break
          case 'error':
            pensando(t, false)
            avisar(t, ev.mensaje)
            break
        }
      }
    }
  }

  async function enviar(url: string, cuerpo: unknown, t: Turno, reintentar?: () => void) {
    ocupar(true)
    pensando(t, true)
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      if (!resp.ok || !resp.body) {
        const d = await resp.json().catch(() => ({}))
        pensando(t, false)
        avisar(
          t,
          d.error ?? `No se pudo (${resp.status}).`,
          d.nueva && reintentar ? { texto: 'Empezar una conversación nueva', hacer: reintentar } : undefined
        )
        return
      }
      await leer(resp, t)
    } catch {
      pensando(t, false)
      avisar(t, 'Se perdió la conexión. Si alcanzó a responder, lo verás al abrir la conversación en Recientes.')
    } finally {
      pensando(t, false)
      ocupar(false)
    }
  }

  async function decidir(aprobado: boolean) {
    if (ocupado || !id || !pendiente) return
    const t = pendiente
    pendiente = null
    cerrarTarjeta(t, aprobado ? 'aprobada' : 'descartada')
    if (aprobado) paso(t, herramientaPendiente)
    await enviar('/api/admin/asistente/decision', { id, aprobado }, t)
  }

  return {
    get ocupado() {
      return ocupado
    },
    async preguntar(pregunta: string) {
      if (ocupado) return
      // Con una propuesta en pantalla, lo que se escriba es "cambia esto".
      if (pendiente) cerrarTarjeta(pendiente, 'cambios')
      pendiente = null
      const t = nuevoTurno(pregunta)
      actual = t
      t.raiz.scrollIntoView({ block: 'start', behavior: 'smooth' })
      const reintentar = () => {
        this.nueva()
        void this.preguntar(pregunta)
      }
      await enviar('/api/admin/asistente', { pregunta, id }, t, reintentar)
    },
    /** Pinta una conversación guardada (al abrirla desde Recientes). */
    cargar(e: EstadoInicial) {
      id = e.id
      alCambiarId(id)
      for (const turno of e.turnos) {
        const t = nuevoTurno(turno.pregunta)
        t.raiz.classList.remove('entra')
        for (const h of turno.pasos) paso(t, h, {}, true)
        if (turno.respuesta) {
          const b = el('div', 'resp-bloque')
          pintarTexto(turno.respuesta, b)
          t.respuesta.append(b)
        }
        actual = t
      }
      if (actual && e.propuesta) {
        tarjeta(actual, e.propuesta, e.estado === 'esperando_aprobacion')
        pendiente = e.estado === 'esperando_aprobacion' ? actual : null
        if (e.propuesta.herramienta) herramientaPendiente = e.propuesta.herramienta
        pie(actual, e.estado, 0)
      }
      if (actual && e.estado === 'fallida' && e.error) avisar(actual, `${e.error} Para seguir, empieza una conversación nueva.`)
    },
    nueva() {
      id = null
      pendiente = null
      actual = null
      hilo.replaceChildren()
      hilo.hidden = true
      alCambiarId(null)
    },
  }
}
