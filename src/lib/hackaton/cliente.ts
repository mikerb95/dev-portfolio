// Navegador de /hackaton (RF-045 a RF-047): reloj del día y tablero del equipo.
//
// El tablero se pinta con DOM y textContent (nada de innerHTML con datos: los
// nombres y títulos los escribe cualquiera con el enlace). Cada cambio se
// aplica primero aquí con el mismo reductor del servidor, para que se vea al
// instante, y luego se manda como operación; la respuesta del servidor manda.

import { DIA_EVENTO, HITOS, PRIORIDADES, PRIORIDADES_CRITICAS, type Prioridad } from '../../data/hackaton'
import {
  aplicar,
  cargaPorPersona,
  ErrorTablero,
  ESTADOS_TAREA,
  filtrar,
  horasPorGrupo,
  progreso,
  type Estado,
  type EstadoTarea,
  type Filtros,
  type Grupo,
  type Operacion,
  type Persona,
  type Tarea,
} from './tablero'
import { bloqueEnCurso, cuentaRegresiva, formatoHora, horaSimulada, instanteEvento, momentoBogota, prioritariasEnRiesgo } from './reloj'

const API = '/api/hackaton/tablero'
const CLAVE_TOKEN = 'hackaton-equipo'
const CADA_MS = 4000

// Clases completas escritas aquí para que Tailwind las encuentre al escanear.
const COLORES = [
  { punto: 'bg-cyan', pildora: 'bg-cyan/15 text-cyan', barra: 'bg-cyan' },
  { punto: 'bg-lime', pildora: 'bg-lime/15 text-lime', barra: 'bg-lime' },
  { punto: 'bg-violet', pildora: 'bg-violet/15 text-violet', barra: 'bg-violet' },
  { punto: 'bg-amber-400', pildora: 'bg-amber-400/15 text-amber-300', barra: 'bg-amber-400' },
  { punto: 'bg-rose-400', pildora: 'bg-rose-400/15 text-rose-300', barra: 'bg-rose-400' },
  { punto: 'bg-sky-400', pildora: 'bg-sky-400/15 text-sky-300', barra: 'bg-sky-400' },
]

const PRIORIDAD_CLASE: Record<Prioridad, string> = {
  Requisito: 'bg-ember/15 text-ember',
  Imprescindible: 'bg-amber-400/15 text-amber-300',
  Alto: 'bg-cyan/10 text-cyan',
  'Si alcanza': 'bg-white/[.06] text-ink-200',
}

const ESTADO_TEXTO: Record<EstadoTarea, string> = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha' }
const ESTADO_SIMBOLO: Record<EstadoTarea, string> = { pendiente: '', en_curso: '•', hecha: '✓' }
const ESTADO_CLASE: Record<EstadoTarea, string> = {
  pendiente: 'border-white/25 text-transparent',
  en_curso: 'border-amber-400 text-amber-300',
  hecha: 'border-lime bg-lime text-ink-950',
}

// ── Estado de la página ─────────────────────────────────────────────────────

let estado: Estado | null = null
let version = -1
let puedeEditar = false
let llave: 'admin' | 'equipo' | null = null
let token: string | null = null
let filtros: Filtros = {}
let enVuelo = 0
let editando: string | null = null
let ultimaSync = 0
let sinConexion = false
let renderPendiente = false
let enlaceGenerado: string | null = null

// ?hora=HH:MM simula la hora del día del evento (y avanza desde ahí).
const cargadoEn = Date.now()
const simulada = horaSimulada(new URLSearchParams(location.search).get('hora'))
const ahora = (): Date => (simulada ? new Date(simulada.getTime() + (Date.now() - cargadoEn)) : new Date())

// ── Utilidades de DOM ───────────────────────────────────────────────────────

type Hijo = Node | string | null | undefined | false
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> & { class?: string } = {},
  ...hijos: Hijo[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue
    if (k === 'class') n.className = v
    else n.setAttribute(k, v)
  }
  for (const h of hijos) if (h) n.append(typeof h === 'string' ? document.createTextNode(h) : h)
  return n
}

const $ = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel)
const horasTxt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')} h`

function avisar(texto: string): void {
  const caja = $<HTMLElement>('[data-aviso-flotante]')
  if (!caja) return
  caja.textContent = texto
  caja.classList.remove('hidden')
  clearTimeout((avisar as unknown as { t?: number }).t)
  ;(avisar as unknown as { t?: number }).t = window.setTimeout(() => caja.classList.add('hidden'), 4000)
}

interface Boton {
  texto: string
  valor: string
  principal?: boolean
}

/** Confirmación con <dialog> (nunca confirm(): bloquea la página entera). */
function preguntar(titulo: string, texto: string, botones: Boton[]): Promise<string | null> {
  const d = $<HTMLDialogElement>('[data-dialogo]')
  if (!d) return Promise.resolve(null)
  d.querySelector('[data-dialogo-titulo]')!.textContent = titulo
  d.querySelector('[data-dialogo-texto]')!.textContent = texto
  const caja = d.querySelector('[data-dialogo-botones]')!
  caja.replaceChildren()
  return new Promise((resolve) => {
    const cerrar = (v: string | null) => {
      d.close()
      resolve(v)
    }
    for (const b of [{ texto: 'Cancelar', valor: '' }, ...botones]) {
      const btn = el(
        'button',
        {
          type: 'button',
          class: b.principal
            ? 'rounded-full bg-cyan text-ink-950 px-4 py-2 text-[13px] font-medium'
            : 'rounded-full border border-white/15 px-4 py-2 text-[13px] hover:border-cyan/50',
        },
        b.texto
      )
      btn.addEventListener('click', () => cerrar(b.valor || null))
      caja.append(btn)
    }
    d.addEventListener('cancel', () => resolve(null), { once: true })
    d.showModal()
  })
}

// ── Token del enlace ────────────────────────────────────────────────────────

function leerToken(): string | null {
  const url = new URL(location.href)
  const delEnlace = url.searchParams.get('equipo')
  if (delEnlace) {
    try {
      localStorage.setItem(CLAVE_TOKEN, delEnlace)
    } catch {
      // Sin almacenamiento el token vale solo mientras la pestaña siga abierta.
    }
    // Fuera de la barra de direcciones: no debe quedar en el historial ni
    // copiarse por accidente al compartir la página pública.
    url.searchParams.delete('equipo')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    return delEnlace
  }
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

function olvidarToken(): void {
  token = null
  try {
    localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // nada que limpiar
  }
}

const cabeceras = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(token ? { 'x-equipo-token': token } : {}),
})

// ── Red ─────────────────────────────────────────────────────────────────────

async function cargar(forzar = false): Promise<void> {
  try {
    const r = await fetch(API, { headers: cabeceras(), cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const j = (await r.json()) as { estado: Estado; version: number; puedeEditar: boolean; llave: typeof llave }
    sinConexion = false
    ultimaSync = Date.now()
    const cambioPermiso = j.puedeEditar !== puedeEditar || j.llave !== llave
    if (token && j.llave !== 'equipo' && j.llave !== 'admin') {
      olvidarToken()
      avisar('El enlace del equipo no es válido o fue reemplazado. Quedas en modo lectura.')
    }
    puedeEditar = j.puedeEditar
    llave = j.llave
    if (cambioPermiso) renderModo()
    // Mientras haya un cambio propio en camino, el estado local va por delante.
    if (enVuelo > 0) return
    if (forzar || j.version !== version) {
      estado = j.estado
      version = j.version
      pintar(forzar)
    }
  } catch {
    sinConexion = true
  } finally {
    pintarSync()
  }
}

async function ejecutar(op: Operacion): Promise<void> {
  if (!estado || !puedeEditar) return
  try {
    estado = aplicar(estado, op)
  } catch (e) {
    avisar(e instanceof ErrorTablero ? e.message : 'No se pudo aplicar el cambio.')
    return
  }
  pintar()
  enVuelo++
  try {
    const r = await fetch(API, { method: 'POST', headers: cabeceras(), body: JSON.stringify({ op }) })
    const j = (await r.json().catch(() => ({}))) as { estado?: Estado; version?: number; error?: string }
    if (r.ok && j.estado && typeof j.version === 'number') {
      if (j.version > version) {
        version = j.version
        if (enVuelo === 1) estado = j.estado
      }
      ultimaSync = Date.now()
    } else {
      avisar(j.error ?? 'No se pudo guardar el cambio.')
      if (r.status === 401) {
        olvidarToken()
        puedeEditar = false
        renderModo()
      }
      enVuelo--
      await cargar(true)
      enVuelo++
    }
  } catch {
    avisar('Sin conexión: el cambio no se guardó.')
    enVuelo--
    await cargar(true)
    enVuelo++
  } finally {
    enVuelo--
    pintar()
  }
}

// ── Pintado ─────────────────────────────────────────────────────────────────

function pintarSync(): void {
  const n = $<HTMLElement>('[data-sync]')
  if (!n) return
  if (sinConexion) n.textContent = 'Sin conexión, reintentando…'
  else if (!ultimaSync) n.textContent = 'Conectando…'
  else n.textContent = `Sincronizado cada ${CADA_MS / 1000} s`
}

function renderModo(): void {
  const caja = $<HTMLElement>('[data-modo]')
  if (!caja) return
  caja.replaceChildren()
  const fila = el(
    'div',
    { class: `inline-flex flex-wrap items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] ${puedeEditar ? 'bg-lime/10 text-lime' : 'bg-white/[.05] text-ink-200'}` },
    el('span', { class: `w-2 h-2 rounded-full ${puedeEditar ? 'bg-lime' : 'bg-ink-300'}`, 'aria-hidden': 'true' }),
    puedeEditar
      ? `Edición activa (${llave === 'admin' ? 'sesión de administrador' : 'enlace del equipo'})`
      : 'Modo lectura. Para editar, abre el enlace del equipo.'
  )
  fila.setAttribute('data-estado-modo', puedeEditar ? 'edicion' : 'lectura')
  caja.append(fila)

  if (llave === 'admin') {
    const zona = el('div', { class: 'mt-3 flex flex-wrap items-center gap-2' })
    const btn = el('button', { type: 'button', class: 'rounded-full border border-white/15 px-4 py-2 text-[13px] hover:border-cyan/50 hover:text-cyan' }, 'Generar enlace del equipo')
    btn.addEventListener('click', async () => {
      const ok = await preguntar(
        'Generar enlace del equipo',
        'El enlace nuevo reemplaza al anterior: quien tenga el viejo queda en modo lectura.',
        [{ texto: 'Generar', valor: 'si', principal: true }]
      )
      if (!ok) return
      const r = await fetch('/api/admin/hackaton/enlace', { method: 'POST' })
      const j = (await r.json().catch(() => ({}))) as { ruta?: string; error?: string }
      if (!r.ok || !j.ruta) return avisar(j.error ?? 'No se pudo generar el enlace.')
      enlaceGenerado = `${location.origin}${j.ruta}`
      renderModo()
    })
    zona.append(btn)
    if (enlaceGenerado) {
      const campo = el('input', { type: 'text', readonly: '', value: enlaceGenerado, class: 'min-w-0 flex-1 rounded-full bg-white/[.04] border border-white/10 px-3 py-2 text-[12px] font-mono', 'aria-label': 'Enlace del equipo' })
      const copiar = el('button', { type: 'button', class: 'rounded-full bg-cyan text-ink-950 px-4 py-2 text-[13px] font-medium' }, 'Copiar')
      copiar.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(enlaceGenerado!)
          avisar('Enlace copiado.')
        } catch {
          campo.select()
        }
      })
      zona.append(campo, copiar)
    }
    caja.append(zona)
  }
}

/** Repinta el tablero sin robarle el foco a quien está escribiendo. */
function pintar(forzar = true): void {
  const activo = document.activeElement as HTMLElement | null
  const raiz = $<HTMLElement>('[data-tablero]')
  if (!raiz || !estado) return
  const escribiendo = activo && raiz.contains(activo) && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA')
  if (!forzar && escribiendo && (activo as HTMLInputElement).value) {
    // Llega un cambio ajeno mientras alguien escribe: se pinta al salir del campo.
    renderPendiente = true
    return
  }
  const foco = activo?.dataset.foco
  raiz.replaceChildren(construir(estado))
  renderPendiente = false
  if (foco) raiz.querySelector<HTMLElement>(`[data-foco="${foco}"]`)?.focus()
  pintarAviso()
}

function barra(avance: number, clase: string, etiqueta: string, detalle: string): HTMLElement {
  const pct = Math.round(avance * 100)
  return el(
    'div',
    { class: 'grid gap-1' },
    el(
      'div',
      { class: 'flex items-baseline gap-2 text-[12.5px]' },
      el('span', { class: 'text-ink-100 truncate' }, etiqueta),
      el('span', { class: 'ml-auto font-mono text-ink-300 whitespace-nowrap' }, detalle)
    ),
    el(
      'div',
      { class: 'h-1.5 rounded-full bg-white/[.06] overflow-hidden', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': etiqueta },
      el('div', { class: `h-full rounded-full ${clase}`, style: `width:${pct}%` })
    )
  )
}

const detalleProgreso = (t: Tarea[]) => {
  const p = progreso(t)
  return { p, txt: `${p.hechas}/${p.total} · ${horasTxt(p.horasHechas)} de ${horasTxt(p.horasTotal)}` }
}

function pildoraPersona(p: Persona, quitar?: () => void): HTMLElement {
  const c = COLORES[p.color % COLORES.length]
  const n = el('span', { class: `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] ${c.pildora}`, 'data-persona': p.nombre })
  n.append(el('span', { class: `w-2 h-2 rounded-full ${c.punto}`, 'aria-hidden': 'true' }), p.nombre)
  if (quitar) {
    const x = el('button', { type: 'button', class: 'ml-1 opacity-70 hover:opacity-100', 'aria-label': `Quitar a ${p.nombre}` }, '×')
    x.addEventListener('click', quitar)
    n.append(x)
  }
  return n
}

function selectorPersona(
  e: Estado,
  valor: string,
  opciones: { valor: string; texto: string }[],
  etiqueta: string,
  alCambiar: (v: string) => void
): HTMLSelectElement {
  const s = el('select', {
    class: 'rounded-full bg-white/[.04] border border-white/10 px-2.5 py-1 text-[12.5px] max-w-[190px]',
    'aria-label': etiqueta,
  })
  for (const o of [...opciones, ...e.personas.map((p) => ({ valor: p.id, texto: p.nombre }))]) {
    const op = el('option', { value: o.valor }, o.texto)
    if (o.valor === valor) op.selected = true
    s.append(op)
  }
  if (!puedeEditar) s.disabled = true
  s.addEventListener('change', () => alCambiar(s.value))
  return s
}

function construir(e: Estado): DocumentFragment {
  const frag = document.createDocumentFragment()
  const nombre = new Map(e.personas.map((p) => [p.id, p]))
  const carga = cargaPorPersona(e)
  const horas = horasPorGrupo(e)
  const frentes = e.grupos.filter((g) => g.tipo === 'frente')

  // Personas + reparto
  const personas = el('div', { class: 'rounded-2xl glass p-5' })
  personas.append(
    el('div', { class: 'flex items-center gap-2 mb-3' }, el('span', { class: 'w-2 h-2 rounded-full bg-cyan', 'aria-hidden': 'true' }), el('h3', { class: 'text-[15px] font-medium' }, 'Personas')),
    el('p', { class: 'text-[12.5px] text-ink-300 mb-3' }, `De ${e.limite.min} a ${e.limite.max} personas, como el reglamento.`)
  )
  const lista = el('div', { class: 'flex flex-wrap gap-2 mb-3', 'data-personas': '' })
  for (const p of e.personas) {
    lista.append(
      pildoraPersona(
        p,
        puedeEditar
          ? async () => {
              const ok = await preguntar(`Quitar a ${p.nombre}`, 'Sus tareas quedan sin asignar y resaltadas hasta que alguien las tome o se vuelva a repartir.', [{ texto: 'Quitar', valor: 'si', principal: true }])
              if (ok) await ejecutar({ tipo: 'persona.quitar', id: p.id })
            }
          : undefined
      )
    )
  }
  if (!e.personas.length) lista.append(el('span', { class: 'text-[13px] text-ink-300' }, 'Todavía no hay nadie.'))
  personas.append(lista)
  if (e.personas.length > 0 && e.personas.length < e.limite.min) {
    personas.append(el('p', { class: 'text-[12.5px] text-amber-300 mb-3' }, `Faltan personas: el mínimo es ${e.limite.min}.`))
  }
  if (puedeEditar && e.personas.length < e.limite.max) {
    const form = el('form', { class: 'flex gap-2', 'data-form-persona': '' })
    const input = el('input', { type: 'text', maxlength: '40', placeholder: 'Nombre', 'aria-label': 'Nombre de la persona', 'data-foco': 'fijo-persona', class: 'min-w-0 flex-1 rounded-full bg-white/[.04] border border-white/10 px-4 py-2 text-[14px]' })
    form.append(input, el('button', { type: 'submit', class: 'rounded-full bg-cyan text-ink-950 px-4 py-2 text-[13px] font-medium' }, 'Agregar'))
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const v = input.value.trim()
      if (!v) return
      input.value = ''
      await ejecutar({ tipo: 'persona.agregar', nombre: v })
    })
    personas.append(form)
  }

  const reparto = el('div', { class: 'rounded-2xl glass p-5' })
  const cabRep = el('div', { class: 'flex flex-wrap items-center gap-2 mb-3' }, el('span', { class: 'w-2 h-2 rounded-full bg-violet', 'aria-hidden': 'true' }), el('h3', { class: 'text-[15px] font-medium' }, 'Reparto y carga'))
  if (puedeEditar && e.personas.length) {
    const btn = el('button', { type: 'button', class: 'ml-auto rounded-full bg-cyan text-ink-950 px-4 py-1.5 text-[13px] font-medium', 'data-repartir': '' }, 'Repartir frentes')
    btn.addEventListener('click', () => pedirReparto(e))
    cabRep.append(btn)
  }
  reparto.append(cabRep)
  if (!e.personas.length) {
    reparto.append(el('p', { class: 'text-[13px] text-ink-300' }, 'Agrega a las personas y reparte los cinco frentes por horas.'))
  } else {
    const ul = el('ul', { class: 'grid gap-2' })
    for (const p of e.personas) {
      const propios = frentes.filter((g) => g.dueno === p.id).map((g) => g.nombre)
      const apoya = frentes.filter((g) => g.apoyo.includes(p.id)).map((g) => g.nombre)
      const partes = [propios.length ? propios.join(', ') : '', apoya.length ? `apoyo en ${apoya.join(', ')}` : ''].filter(Boolean)
      ul.append(
        el(
          'li',
          { class: 'flex flex-wrap items-center gap-2 text-[13px]', 'data-carga': p.nombre },
          pildoraPersona(p),
          el('span', { class: 'text-ink-200 flex-1 min-w-[120px]' }, partes.join(' · ') || 'Sin frente'),
          el('span', { class: 'font-mono text-ink-100' }, horasTxt(carga[p.id] ?? 0))
        )
      )
    }
    reparto.append(ul)
  }

  frag.append(el('div', { class: 'grid gap-3 lg:grid-cols-2 mb-3' }, personas, reparto))

  // Progreso
  const prog = el('div', { class: 'rounded-2xl glass p-5 mb-3' })
  const global = detalleProgreso(e.tareas)
  prog.append(
    el('div', { class: 'flex items-center gap-2 mb-3' }, el('span', { class: 'w-2 h-2 rounded-full bg-lime', 'aria-hidden': 'true' }), el('h3', { class: 'text-[15px] font-medium' }, 'Progreso'), el('span', { class: 'ml-auto font-mono text-[22px] leading-none', 'data-progreso-global': String(Math.round(global.p.avance * 100)) }, `${Math.round(global.p.avance * 100)} %`)),
    barra(global.p.avance, 'bg-lime', 'Global, ponderado por horas', global.txt)
  )
  const columnas = el('div', { class: 'grid gap-6 md:grid-cols-2 mt-5' })
  const porPersona = el('div', { class: 'grid gap-3' }, el('div', { class: 'text-[10px] font-mono uppercase tracking-[.16em] text-ink-300' }, 'Por persona'))
  for (const p of e.personas) {
    const d = detalleProgreso(e.tareas.filter((t) => t.dueno === p.id))
    porPersona.append(barra(d.p.avance, COLORES[p.color % COLORES.length].barra, p.nombre, d.txt))
  }
  const sinDueno = e.tareas.filter((t) => !t.dueno && e.grupos.find((g) => g.id === t.grupo)?.tipo === 'frente')
  if (sinDueno.length) {
    const d = detalleProgreso(sinDueno)
    porPersona.append(barra(d.p.avance, 'bg-ink-300', 'Frentes sin asignar', d.txt))
  }
  if (!e.personas.length) porPersona.append(el('p', { class: 'text-[12.5px] text-ink-300' }, 'Sin personas todavía.'))
  const porFrente = el('div', { class: 'grid gap-3' }, el('div', { class: 'text-[10px] font-mono uppercase tracking-[.16em] text-ink-300' }, 'Por frente'))
  for (const g of e.grupos) {
    const d = detalleProgreso(e.tareas.filter((t) => t.grupo === g.id))
    porFrente.append(barra(d.p.avance, 'bg-cyan', g.nombre, d.txt))
  }
  columnas.append(porPersona, porFrente)
  prog.append(columnas)
  frag.append(prog)

  // Aviso del congelamiento (lo rellena pintarAviso, que corre también con el reloj)
  frag.append(el('div', { 'data-aviso-prioritarias': '', class: 'mb-3' }))

  // Filtros
  const barraFiltros = el('div', { class: 'flex flex-wrap items-center gap-2 mb-3', 'data-filtros': '' })
  const filtro = (clave: keyof Filtros, etiqueta: string, opciones: { valor: string; texto: string }[]) => {
    const s = el('select', { class: 'rounded-full bg-white/[.04] border border-white/10 px-3 py-1.5 text-[12.5px]', 'aria-label': etiqueta, 'data-filtro': clave })
    s.append(el('option', { value: '' }, etiqueta))
    for (const o of opciones) {
      const op = el('option', { value: o.valor }, o.texto)
      if (filtros[clave] === o.valor) op.selected = true
      s.append(op)
    }
    s.addEventListener('change', () => {
      filtros = { ...filtros, [clave]: s.value || undefined }
      pintar()
    })
    barraFiltros.append(s)
  }
  filtro('persona', 'Todas las personas', [...e.personas.map((p) => ({ valor: p.id, texto: p.nombre })), { valor: 'sin', texto: 'Sin asignar' }])
  filtro('grupo', 'Todos los frentes', e.grupos.map((g) => ({ valor: g.id, texto: g.nombre })))
  filtro('prioridad', 'Todas las prioridades', PRIORIDADES.map((p) => ({ valor: p, texto: p })))
  filtro('estado', 'Todos los estados', ESTADOS_TAREA.map((s) => ({ valor: s, texto: ESTADO_TEXTO[s] })))
  if (Object.values(filtros).some(Boolean)) {
    const limpiar = el('button', { type: 'button', class: 'text-[12.5px] text-cyan hover:underline' }, 'Quitar filtros')
    limpiar.addEventListener('click', () => {
      filtros = {}
      pintar()
    })
    barraFiltros.append(limpiar)
  }
  frag.append(barraFiltros)

  // Grupos y tareas
  const visibles = filtrar(e.tareas, filtros)
  const hayFiltro = Object.values(filtros).some(Boolean)
  const grilla = el('div', { class: 'grid gap-3' })
  for (const g of e.grupos) {
    const tareas = visibles.filter((t) => t.grupo === g.id)
    if (hayFiltro && !tareas.length) continue
    grilla.append(construirGrupo(e, g, tareas, horas[g.id] ?? 0, nombre))
  }
  if (!grilla.childElementCount) grilla.append(el('p', { class: 'text-[13px] text-ink-300' }, 'Ninguna tarea coincide con los filtros.'))
  frag.append(grilla)

  // Exportar y reiniciar
  const pie = el('div', { class: 'flex flex-wrap gap-2 mt-6' })
  const exportar = el('button', { type: 'button', class: 'rounded-full border border-white/15 px-4 py-2 text-[13px] hover:border-cyan/50 hover:text-cyan' }, 'Exportar a JSON')
  exportar.addEventListener('click', () => {
    const datos = JSON.stringify({ exportado: new Date().toISOString(), version, estado }, null, 2)
    const a = el('a', { href: URL.createObjectURL(new Blob([datos], { type: 'application/json' })), download: `hackaton-defacc-${DIA_EVENTO}.json` })
    a.click()
    URL.revokeObjectURL(a.href)
  })
  pie.append(exportar)
  if (puedeEditar) {
    const reiniciar = el('button', { type: 'button', class: 'rounded-full border border-ember/40 text-ember px-4 py-2 text-[13px] hover:bg-ember/10' }, 'Reiniciar tablero')
    reiniciar.addEventListener('click', async () => {
      const ok = await preguntar('Reiniciar el tablero', 'Se borran las personas, el reparto, los estados y las tareas editadas, para todo el equipo. Exporta primero si quieres conservar algo.', [{ texto: 'Reiniciar', valor: 'si', principal: true }])
      if (ok) await ejecutar({ tipo: 'reiniciar' })
    })
    pie.append(reiniciar)
  }
  frag.append(pie)
  return frag
}

function construirGrupo(e: Estado, g: Grupo, tareas: Tarea[], horas: number, nombre: Map<string, Persona>): HTMLElement {
  const caja = el('div', { class: 'rounded-2xl glass p-4 sm:p-5', 'data-grupo': g.id })
  const todas = e.tareas.filter((t) => t.grupo === g.id)
  const d = detalleProgreso(todas)
  const cab = el(
    'div',
    { class: 'flex flex-wrap items-center gap-2 mb-3' },
    el('span', { class: `w-2 h-2 rounded-full ${g.tipo === 'frente' ? 'bg-cyan' : 'bg-violet'}`, 'aria-hidden': 'true' }),
    el('h3', { class: 'text-[15px] font-medium' }, g.nombre),
    el('span', { class: 'font-mono text-[12px] text-ink-300' }, `${horasTxt(horas)} · ${d.p.hechas}/${d.p.total}`)
  )
  const derecha = el('div', { class: 'ml-auto flex flex-wrap items-center gap-2' })
  derecha.append(
    selectorPersona(e, g.dueno ?? '', [{ valor: '', texto: g.tipo === 'frente' ? 'Frente sin dueño' : 'Sin dueño (cada tarea aparte)' }], `Dueño de ${g.nombre}`, (v) =>
      ejecutar({ tipo: 'grupo.asignar', grupo: g.id, persona: v || null })
    )
  )
  if (g.manual) derecha.append(el('span', { class: 'rounded-full bg-violet/15 text-violet text-[10.5px] px-2 py-0.5' }, 'Ajuste manual'))
  for (const a of g.apoyo) {
    const p = nombre.get(a)
    if (p) derecha.append(el('span', { class: 'text-[12px] text-ink-300' }, `apoyo: ${p.nombre}`))
  }
  cab.append(derecha)
  caja.append(cab)

  const ul = el('ul', { class: 'grid gap-1.5' })
  for (const t of tareas) ul.append(construirTarea(e, g, t))
  if (!tareas.length) ul.append(el('li', { class: 'text-[12.5px] text-ink-300' }, 'Sin tareas.'))
  caja.append(ul)

  if (puedeEditar) {
    const form = el('form', { class: 'flex flex-wrap gap-2 mt-3' })
    const titulo = el('input', { type: 'text', maxlength: '140', placeholder: 'Tarea nueva', 'aria-label': `Tarea nueva en ${g.nombre}`, 'data-foco': `nueva-${g.id}`, class: 'min-w-0 flex-1 basis-48 rounded-full bg-white/[.04] border border-white/10 px-3 py-1.5 text-[13px]' })
    const prio = el('select', { class: 'rounded-full bg-white/[.04] border border-white/10 px-2.5 py-1.5 text-[12.5px]', 'aria-label': 'Prioridad' })
    for (const p of PRIORIDADES) prio.append(el('option', { value: p }, p))
    prio.value = 'Alto'
    const hrs = el('input', { type: 'number', min: '0', max: '24', step: '0.25', value: '0.5', 'aria-label': 'Horas', class: 'w-20 rounded-full bg-white/[.04] border border-white/10 px-3 py-1.5 text-[12.5px]' })
    form.append(titulo, prio, hrs, el('button', { type: 'submit', class: 'rounded-full border border-white/15 px-3 py-1.5 text-[12.5px] hover:border-cyan/50 hover:text-cyan' }, 'Agregar'))
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const v = titulo.value.trim()
      const h = Number(hrs.value)
      if (!v || !Number.isFinite(h) || h < 0 || h > 24) return avisar('Revisa el título y las horas (0 a 24).')
      titulo.value = ''
      await ejecutar({ tipo: 'tarea.agregar', grupo: g.id, titulo: v, prioridad: prio.value as Prioridad, horas: h })
    })
    caja.append(form)
  }
  return caja
}

function construirTarea(e: Estado, g: Grupo, t: Tarea): HTMLElement {
  const resaltada = t.huerfana && !t.dueno
  const li = el('li', {
    class: `flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-2 ${resaltada ? 'bg-ember/10' : 'hover:bg-white/[.03]'}`,
    'data-tarea': t.id,
    'data-estado': t.estado,
  })

  const sig: Record<EstadoTarea, EstadoTarea> = { pendiente: 'en_curso', en_curso: 'hecha', hecha: 'pendiente' }
  const chk = el(
    'button',
    {
      type: 'button',
      class: `w-5 h-5 shrink-0 rounded-md border text-[12px] leading-none grid place-items-center ${ESTADO_CLASE[t.estado]}`,
      'aria-label': `${t.titulo}: ${ESTADO_TEXTO[t.estado]}. Cambiar a ${ESTADO_TEXTO[sig[t.estado]]}`,
      title: ESTADO_TEXTO[t.estado],
      'data-cambiar-estado': '',
    },
    ESTADO_SIMBOLO[t.estado]
  )
  if (!puedeEditar) chk.disabled = true
  chk.addEventListener('click', () => ejecutar({ tipo: 'tarea.estado', tarea: t.id, estado: sig[t.estado] }))
  li.append(chk)

  if (editando === t.id && puedeEditar) {
    const form = el('form', { class: 'flex flex-wrap items-center gap-2 flex-1' })
    const titulo = el('input', { type: 'text', maxlength: '140', value: t.titulo, 'aria-label': 'Título', 'data-foco': `editar-${t.id}`, class: 'min-w-0 flex-1 basis-48 rounded-full bg-white/[.04] border border-white/10 px-3 py-1 text-[13px]' })
    const prio = el('select', { class: 'rounded-full bg-white/[.04] border border-white/10 px-2 py-1 text-[12.5px]', 'aria-label': 'Prioridad' })
    for (const p of PRIORIDADES) prio.append(el('option', { value: p }, p))
    prio.value = t.prioridad
    const hrs = el('input', { type: 'number', min: '0', max: '24', step: '0.05', value: String(t.horas), 'aria-label': 'Horas', class: 'w-20 rounded-full bg-white/[.04] border border-white/10 px-3 py-1 text-[12.5px]' })
    const cancelar = el('button', { type: 'button', class: 'text-[12.5px] text-ink-300 hover:text-ink-50' }, 'Cancelar')
    cancelar.addEventListener('click', () => {
      editando = null
      pintar()
    })
    form.append(titulo, prio, hrs, el('button', { type: 'submit', class: 'rounded-full bg-cyan text-ink-950 px-3 py-1 text-[12.5px] font-medium' }, 'Guardar'), cancelar)
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const h = Number(hrs.value)
      if (!titulo.value.trim() || !Number.isFinite(h) || h < 0 || h > 24) return avisar('Revisa el título y las horas (0 a 24).')
      editando = null
      await ejecutar({ tipo: 'tarea.editar', tarea: t.id, titulo: titulo.value, prioridad: prio.value as Prioridad, horas: h })
    })
    li.append(form)
    setTimeout(() => titulo.focus(), 0)
    return li
  }

  const texto = el(
    'span',
    { class: `flex-1 min-w-[160px] text-[13.5px] leading-snug ${t.estado === 'hecha' ? 'line-through text-ink-300' : 'text-ink-50'}` },
    t.numero !== undefined ? el('span', { class: 'font-mono text-ink-300 mr-1.5' }, `${t.numero}.`) : null,
    t.titulo
  )
  li.append(texto)
  if (t.porConfirmar) li.append(el('span', { class: 'rounded-full bg-amber-400/10 text-amber-300 text-[10.5px] px-2 py-0.5' }, 'Por confirmar'))
  if (resaltada) li.append(el('span', { class: 'rounded-full bg-ember/15 text-ember text-[10.5px] px-2 py-0.5' }, 'Sin asignar'))
  li.append(
    el('span', { class: `rounded-full text-[10.5px] px-2 py-0.5 ${PRIORIDAD_CLASE[t.prioridad]}` }, t.prioridad),
    el('span', { class: 'font-mono text-[12px] text-ink-300 w-12 text-right' }, horasTxt(t.horas))
  )

  const herencia = g.dueno ? `Del frente (${e.personas.find((p) => p.id === g.dueno)?.nombre ?? '?'})` : 'Del frente (nadie)'
  const valor = t.manual ? (t.dueno ?? '__sin') : 'grupo'
  const sel = selectorPersona(
    e,
    valor,
    [
      { valor: 'grupo', texto: herencia },
      { valor: '__sin', texto: 'Sin asignar' },
    ],
    `Responsable de ${t.titulo}`,
    (v) => ejecutar({ tipo: 'tarea.asignar', tarea: t.id, persona: v === 'grupo' ? 'grupo' : v === '__sin' ? null : v })
  )
  li.append(sel)

  if (puedeEditar) {
    const editar = el('button', { type: 'button', class: 'text-[12px] text-ink-300 hover:text-cyan', 'aria-label': `Editar ${t.titulo}` }, 'Editar')
    editar.addEventListener('click', () => {
      editando = t.id
      pintar()
    })
    const borrar = el('button', { type: 'button', class: 'text-[12px] text-ink-300 hover:text-ember', 'aria-label': `Borrar ${t.titulo}` }, 'Borrar')
    borrar.addEventListener('click', async () => {
      const ok = await preguntar('Borrar tarea', `"${t.titulo}" desaparece del tablero para todo el equipo.`, [{ texto: 'Borrar', valor: 'si', principal: true }])
      if (ok) await ejecutar({ tipo: 'tarea.borrar', tarea: t.id })
    })
    li.append(editar, borrar)
  }
  return li
}

async function pedirReparto(e: Estado): Promise<void> {
  const yaHay = e.grupos.some((g) => g.tipo === 'frente' && g.dueno)
  const ajustes = e.grupos.some((g) => g.manual) || e.tareas.some((t) => t.manual && !t.huerfana)
  if (!yaHay && !ajustes) return ejecutar({ tipo: 'repartir', modo: 'cero' })
  const r = await preguntar(
    'Volver a repartir',
    ajustes
      ? 'Hay ajustes manuales. Puedes conservarlos y repartir lo demás, o repartir todo desde cero.'
      : 'Se recalcula el reparto de los frentes por horas.',
    ajustes
      ? [
          { texto: 'Repartir desde cero', valor: 'cero' },
          { texto: 'Conservar ajustes manuales', valor: 'conservar', principal: true },
        ]
      : [{ texto: 'Repartir', valor: 'cero', principal: true }]
  )
  if (r === 'cero' || r === 'conservar') await ejecutar({ tipo: 'repartir', modo: r })
}

let claveAviso = ''
function pintarAviso(): void {
  const caja = $<HTMLElement>('[data-aviso-prioritarias]')
  if (!caja || !estado) return
  const m = momentoBogota(ahora())
  const riesgo = prioritariasEnRiesgo(estado.tareas, m)
  const clave = `${riesgo.map((t) => t.id).join(',')}|${m.minuto >= HITOS.congelamiento}`
  if (clave === claveAviso && caja.childElementCount === (riesgo.length ? 1 : 0)) return
  claveAviso = clave
  caja.replaceChildren()
  if (!riesgo.length) return
  const paso = m.minuto >= HITOS.congelamiento
  const faltan = Math.max(0, Math.ceil(HITOS.congelamiento - m.minuto))
  caja.append(
    el(
      'div',
      { class: 'rounded-2xl bg-amber-400/10 p-4', role: 'alert', 'data-aviso': '' },
      el(
        'div',
        { class: 'flex items-center gap-2 text-[14px] font-medium text-amber-300 mb-2' },
        el('span', { class: 'w-2 h-2 rounded-full bg-amber-400 pulse-dot', 'aria-hidden': 'true' }),
        paso
          ? `Ya pasó el congelamiento y hay ${riesgo.length} tareas ${PRIORIDADES_CRITICAS.join(' o ')} sin hacer`
          : `Faltan ${faltan} min para congelar funciones y hay ${riesgo.length} tareas ${PRIORIDADES_CRITICAS.join(' o ')} sin hacer`
      ),
      el('ul', { class: 'grid gap-0.5 text-[13px] text-ink-100' }, ...riesgo.slice(0, 12).map((t) => el('li', {}, `· ${t.titulo}`)))
    )
  )
}

// ── Reloj ───────────────────────────────────────────────────────────────────

function tic(): void {
  const t = ahora()
  const m = momentoBogota(t)
  const etiqueta = $<HTMLElement>('[data-reloj-ahora]')
  if (etiqueta) {
    if (m.esDiaEvento) etiqueta.textContent = `Hora de Bogotá: ${formatoHora(m.minuto)}${simulada ? ' (simulada)' : ''}`
    else if (m.fecha < DIA_EVENTO) etiqueta.textContent = `Falta ${cuentaRegresiva(t, instanteEvento(HITOS.inicioDia)) ?? ''} para el evento`
    else etiqueta.textContent = 'El evento ya terminó'
  }

  for (const [sel, minuto, cerrado] of [
    ['[data-cuenta="entrega"]', HITOS.entregaRecomendada, 'Ya pasó la entrega recomendada'],
    ['[data-cuenta="cierre"]', HITOS.cierreEntregas, 'Entregas cerradas'],
  ] as const) {
    const v = document.querySelector<HTMLElement>(`${sel} [data-cuenta-valor]`)
    if (v) v.textContent = cuentaRegresiva(t, instanteEvento(minuto)) ?? cerrado
  }

  const enRango = m.esDiaEvento && m.minuto >= HITOS.inicioDia && m.minuto <= HITOS.finDia
  const pasado = m.fecha > DIA_EVENTO || (m.esDiaEvento && m.minuto > HITOS.finDia)
  const pct = enRango ? ((m.minuto - HITOS.inicioDia) / (HITOS.finDia - HITOS.inicioDia)) * 100 : pasado ? 100 : 0
  const avance = $<HTMLElement>('[data-riel-avance]')
  if (avance) avance.style.width = `${pct}%`
  const punto = $<HTMLElement>('[data-riel-ahora]')
  if (punto) {
    punto.classList.toggle('hidden', !enRango)
    punto.style.left = `${pct}%`
  }

  for (const lista of document.querySelectorAll<HTMLElement>('[data-linea]')) {
    const items = [...lista.querySelectorAll<HTMLElement>('[data-bloque]')]
    const bloques = items.map((li) => ({ inicio: Number(li.dataset.inicio), fin: Number(li.dataset.fin), texto: '' }))
    const actual = m.esDiaEvento ? bloqueEnCurso(bloques, m.minuto) : -1
    items.forEach((li, i) => {
      const b = bloques[i]
      const termino = pasado || (m.esDiaEvento && m.minuto >= Math.max(b.fin, b.inicio + 1))
      li.classList.toggle('en-curso', i === actual)
      li.classList.toggle('pasado', termino && i !== actual)
      li.querySelector('.bloque-ahora')?.classList.toggle('hidden', i !== actual)
      if (i === actual) li.setAttribute('aria-current', 'time')
      else li.removeAttribute('aria-current')
    })
  }
  pintarAviso()
}

// ── Arranque ────────────────────────────────────────────────────────────────

export function iniciarHackaton(): void {
  token = leerToken()
  renderModo()
  tic()
  setInterval(tic, 1000)
  void cargar(true)
  setInterval(() => {
    if (document.hidden || enVuelo > 0) return
    void cargar()
  }, CADA_MS)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void cargar()
  })
  document.addEventListener('focusout', () => {
    if (renderPendiente) setTimeout(() => pintar(), 0)
  })
}
