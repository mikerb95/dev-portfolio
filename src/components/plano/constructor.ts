// Constructor de Plano en el navegador (docs/plan-plano.md).
//
// Recalcula la propuesta COMPLETA en cada cambio con los mismos módulos puros
// que usa el servidor (armarPropuesta). Lo que se ve aquí es exactamente lo
// que el servidor congelará al guardar la versión: misma función, mismas
// reglas, mismo día.
//
// Dos clases de nodos: los campos de texto se pintan una vez y solo escriben
// en la configuración (repintarlos al teclear les quitaría el foco), y las
// regiones calculadas se repintan enteras en cada cambio.

import { COMPONENTES, formatearMonto } from '../../data/tarifario'
import { HITOS, SIEMPRE_ESENCIALES, type ReglasPlano } from '../../data/plano'
import { avisosContacto, faltantesContacto, PERSONA_VACIA, type Persona } from '../../lib/plano/contacto'
import { calcularEncaje, type Trabajo } from '../../lib/plano/encaje'
import { fechaCorta, habilEnODespues } from '../../lib/plano/fechas'
import { preguntasDe } from '../../lib/plano/incertidumbre'
import { armarPropuesta, faltantesEnvio, PropuestaVacia } from '../../lib/plano/propuesta'
import type { Calibracion } from '../../lib/plano/aprende'
import type { Cambio } from '../../lib/plano/diff'
import { NIVEL_LABEL, type ConfigPropuesta, type Prioridad, type Snapshot } from '../../lib/plano/tipos'

export type Revision = {
  veredicto: string
  ambiguedades: { donde: string; problema: string; pregunta: string }[]
  riesgos: { riesgo: string; mitigacion: string }[]
  premortem: string[]
  generadaEl: string
  cifrasRechazadas?: string[]
}

export type DatosConstructor = {
  id: number
  estado: string
  token: string
  editable: boolean
  demo: boolean
  hoy: string
  config: ConfigPropuesta
  reglas: ReglasPlano
  versiones: { n: number; huella: string; origen: string; fecha: string; cambios: Cambio[] }[]
  encaje: { gastoMensual: number | null; otros: Trabajo[] }
  conversacion: string
  revision: Revision | null
  iaDisponible: boolean
  iaUsd: number
  aceptacion: { nombre: string; documento: string; el: string; version: number; huella: string } | null
  projectId: number | null
  horas: { componenteId: string; estimadas: number; reales: number }[]
  calibraciones: Calibracion[]
}

// ── Utilidades ──────────────────────────────────────────────────────────────

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]

function leer(obj: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

function escribir(obj: Record<string, unknown>, ruta: string, valor: unknown) {
  const partes = ruta.split('.')
  let o = obj
  for (const k of partes.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {}
    o = o[k] as Record<string, unknown>
  }
  o[partes[partes.length - 1]] = valor
}

const PRIORIDAD_LABEL: Record<Prioridad, string> = { esencial: 'Esencial', recomendado: 'Recomendado', extra: 'Extra' }

// ── Estado ──────────────────────────────────────────────────────────────────

export function montarConstructor(raiz: HTMLElement, d: DatosConstructor) {
  const config = d.config
  let snap: Snapshot | null = null
  let error: string | null = null
  let estadoGuardado: 'ok' | 'pendiente' | 'guardando' | 'error' = 'ok'
  let temporizador: ReturnType<typeof setTimeout> | null = null
  let revision = d.revision
  let iaChat: { resumen: string; preguntas: string[]; descartadas: string[]; costo: number } | null = null
  const abiertas = new Set<string>()
  const m = (v: number) => formatearMonto(v, config.moneda)
  const soloLectura = !d.editable || d.demo

  // ── Guardado ──────────────────────────────────────────────────────────────

  async function guardarAhora(): Promise<boolean> {
    if (soloLectura) return true
    if (temporizador) clearTimeout(temporizador)
    temporizador = null
    estadoGuardado = 'guardando'
    pintarGuardado()
    try {
      const r = await fetch('/api/admin/plano', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, config }),
      })
      estadoGuardado = r.ok ? 'ok' : 'error'
    } catch {
      estadoGuardado = 'error'
    }
    pintarGuardado()
    return estadoGuardado === 'ok'
  }

  function programarGuardado() {
    if (soloLectura) return
    estadoGuardado = 'pendiente'
    pintarGuardado()
    if (temporizador) clearTimeout(temporizador)
    temporizador = setTimeout(guardarAhora, 900)
  }

  function pintarGuardado() {
    const el = $('#p-guardado', raiz)
    if (!el) return
    const t = { ok: 'Guardado', pendiente: 'Cambios sin guardar', guardando: 'Guardando…', error: 'No se pudo guardar' }[estadoGuardado]
    el.textContent = soloLectura ? (d.demo ? 'Demo · solo lectura' : 'Aceptada · solo lectura') : t
    el.dataset.estado = estadoGuardado
  }

  // ── Cálculo ───────────────────────────────────────────────────────────────

  function recalcular() {
    try {
      snap = armarPropuesta(config, d.reglas, d.hoy)
      error = null
    } catch (e) {
      snap = null
      error = e instanceof PropuestaVacia ? 'Agrega al menos un componente o elige un plan web.' : e instanceof Error ? e.message : 'error'
    }
  }

  function cambio() {
    recalcular()
    pintarTodo()
    programarGuardado()
  }

  // ── Campos estáticos ──────────────────────────────────────────────────────

  function rellenarCampos() {
    for (const el of $$<HTMLInputElement | HTMLTextAreaElement>('[data-bind]', raiz)) {
      const v = leer(config, el.dataset.bind!)
      if (el.dataset.lista === 'lineas') (el as HTMLTextAreaElement).value = Array.isArray(v) ? v.join('\n') : ''
      else el.value = v == null ? '' : String(v)
      if (soloLectura) el.disabled = true
    }
    const conv = $<HTMLTextAreaElement>('#p-conversacion', raiz)
    if (conv) conv.value = d.conversacion
    for (const tipo of ['decisor', 'pagador'] as const) {
      const box = $<HTMLInputElement>(`[data-otra="${tipo}"]`, raiz)
      if (box) {
        box.checked = config.contacto[tipo] !== null
        if (soloLectura) box.disabled = true
      }
    }
  }

  raiz.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement
    const ruta = el.dataset.bind
    if (!ruta) return
    let valor: unknown = el.value
    if (el.dataset.num !== undefined) valor = el.value === '' ? 0 : Number(el.value)
    if (el.dataset.lista === 'lineas') valor = el.value.split('\n').map((x) => x.trim()).filter(Boolean)
    if (ruta.startsWith('contacto.decisor.') || ruta.startsWith('contacto.pagador.')) {
      const quien = ruta.split('.')[1] as 'decisor' | 'pagador'
      if (!config.contacto[quien]) config.contacto[quien] = { ...PERSONA_VACIA }
    }
    if (ruta.startsWith('cliente.ciclo.') && !config.cliente.ciclo) config.cliente.ciclo = { corteDia: 20, diasPago: 30 }
    escribir(config as unknown as Record<string, unknown>, ruta, valor)
    cambio()
  })

  raiz.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement
    if (el.dataset.otra) {
      const quien = el.dataset.otra as 'decisor' | 'pagador'
      config.contacto[quien] = el.checked ? ({ ...PERSONA_VACIA } as Persona) : null
      const grupo = $(`[data-grupo="${quien}"]`, raiz)
      grupo?.classList.toggle('hidden', !el.checked)
      if (!el.checked) for (const i of $$<HTMLInputElement>('input', grupo ?? raiz)) if (grupo) i.value = ''
      cambio()
    }
  })

  // ── Clics (regiones calculadas) ───────────────────────────────────────────

  raiz.addEventListener('click', async (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-accion]')
    if (!t || t.hasAttribute('disabled')) return
    const a = t.dataset.accion!
    const id = t.dataset.id ?? ''
    if (a === 'abrir') {
      abiertas.has(id) ? abiertas.delete(id) : abiertas.add(id)
      pintarTodo()
      return
    }
    if (a === 'ia-chat') return leerConversacion(t)
    if (a === 'ia-revision') return revisar(t)
    if (a === 'version' || a === 'enviar') return congelar(a, t)
    if (a === 'copiar') {
      await navigator.clipboard?.writeText(`${location.origin}/propuesta/${d.token}`).catch(() => {})
      t.textContent = 'Enlace copiado'
      setTimeout(() => (t.textContent = 'Copiar enlace'), 1800)
      return
    }
    if (a === 'descartar') {
      if (!confirm('¿Descartar esta propuesta? El enlace del cliente dejará de servir.')) return
      await fetch('/api/admin/plano?action=discard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) })
      location.reload()
      return
    }
    if (a === 'reabrir') {
      await fetch('/api/admin/plano?action=reopen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) })
      location.reload()
      return
    }
    if (a === 'guardar-horas') return guardarHoras(t)
    if (soloLectura) return

    switch (a) {
      case 'set': {
        const ruta = t.dataset.ruta!
        let v: unknown = t.dataset.valor
        if (v === 'null') v = null
        else if (t.dataset.num !== undefined) v = Number(v)
        if (ruta === 'cliente.tipo' && v === 'persona') config.cliente.ciclo = null
        if (ruta === 'cliente.tipo' && v === 'empresa' && !config.cliente.ciclo) config.cliente.ciclo = { corteDia: 20, diasPago: 30 }
        escribir(config as unknown as Record<string, unknown>, ruta, v)
        if (ruta === 'cliente.tipo') pintarCiclo()
        break
      }
      case 'linea': {
        const i = config.lineas.findIndex((l) => l.id === id)
        if (i >= 0) {
          if ((SIEMPRE_ESENCIALES as readonly string[]).includes(id) && !confirm('Este componente va en toda propuesta. ¿Quitarlo igual?')) return
          config.lineas.splice(i, 1)
          config.perillas.lineas = config.perillas.lineas.filter((x) => x !== id)
          delete config.ajustesLineas[id]
        } else {
          const forzada = (SIEMPRE_ESENCIALES as readonly string[]).includes(id)
          config.lineas.push({ id, cantidad: 1, prioridad: forzada ? 'esencial' : 'recomendado', respuestas: {} })
          abiertas.add(id)
        }
        break
      }
      case 'prioridad': {
        const l = config.lineas.find((x) => x.id === id)
        if (l && !(SIEMPRE_ESENCIALES as readonly string[]).includes(id)) {
          l.prioridad = t.dataset.valor as Prioridad
          if (l.prioridad === 'esencial') config.perillas.lineas = config.perillas.lineas.filter((x) => x !== id)
        }
        break
      }
      case 'cantidad': {
        const l = config.lineas.find((x) => x.id === id)
        if (l) l.cantidad = Math.min(Math.max(l.cantidad + Number(t.dataset.valor), 1), 50)
        break
      }
      case 'respuesta': {
        const l = config.lineas.find((x) => x.id === id)
        if (l) {
          const p = t.dataset.pregunta!
          const o = Number(t.dataset.valor)
          if (l.respuestas[p] === o) delete l.respuestas[p]
          else l.respuestas[p] = o
        }
        break
      }
      case 'perilla-linea': {
        const set = new Set(config.perillas.lineas)
        set.has(id) ? set.delete(id) : set.add(id)
        config.perillas.lineas = [...set]
        break
      }
      case 'perilla': {
        const k = t.dataset.valor as 'version' | 'planPago'
        config.perillas[k] = !config.perillas[k]
        break
      }
      case 'clausula': {
        const set = new Set(config.clausulasDesactivadas)
        set.has(id) ? set.delete(id) : set.add(id)
        config.clausulasDesactivadas = [...set]
        break
      }
      case 'inicio-sugerido': {
        config.fechaInicio = t.dataset.valor!
        const f = $<HTMLInputElement>('[data-bind="fechaInicio"]', raiz)
        if (f) f.value = config.fechaInicio
        break
      }
      default:
        return
    }
    cambio()
  })

  // ── IA ────────────────────────────────────────────────────────────────────

  async function leerConversacion(btn: HTMLElement) {
    const conv = $<HTMLTextAreaElement>('#p-conversacion', raiz)?.value.trim() ?? ''
    if (conv.length < 40) return alert('Pega la conversación con el cliente (al menos unas líneas).')
    if (config.lineas.length && !confirm('La IA va a reemplazar los componentes actuales por los que encuentre en la conversación. ¿Seguir?')) return
    await guardarAhora()
    btn.setAttribute('disabled', '')
    const etiqueta = btn.textContent
    btn.textContent = 'Leyendo la conversación…'
    try {
      const r = await fetch(`/api/admin/plano/${d.id}/ia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'chat', conversacion: conv }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'la IA no respondió')
      Object.assign(config, j.config)
      iaChat = { resumen: j.resumen, preguntas: j.preguntasAbiertas ?? [], descartadas: j.citasDescartadas ?? [], costo: j.costoUsd ?? 0 }
      for (const l of config.lineas) abiertas.add(l.id)
      rellenarCampos()
      pintarCiclo()
      recalcular()
      pintarTodo()
      await guardarAhora()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'la IA no respondió')
    } finally {
      btn.removeAttribute('disabled')
      btn.textContent = etiqueta
    }
  }

  async function revisar(btn: HTMLElement) {
    if (!snap) return alert('Primero arma la propuesta.')
    await guardarAhora()
    btn.setAttribute('disabled', '')
    const etiqueta = btn.textContent
    btn.textContent = 'Leyendo como el cliente más difícil…'
    try {
      const r = await fetch(`/api/admin/plano/${d.id}/ia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'revision' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'la IA no respondió')
      revision = j.revision
      pintarRevision()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'la IA no respondió')
    } finally {
      btn.removeAttribute('disabled')
      btn.textContent = etiqueta
    }
  }

  async function congelar(accion: 'version' | 'enviar', btn: HTMLElement) {
    if (!(await guardarAhora())) return alert('No se pudo guardar. Revisa la conexión.')
    if (accion === 'enviar') {
      const faltan = faltantesEnvio(config)
      if (faltan.length) return alert(`Antes de enviar falta: ${faltan.join(', ')}.`)
    }
    btn.setAttribute('disabled', '')
    try {
      const r = await fetch(`/api/admin/plano?action=${accion === 'enviar' ? 'send' : 'version'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.faltan ? `Falta: ${j.faltan.join(', ')}` : j.error || 'no se pudo')
      if (accion === 'enviar') await navigator.clipboard?.writeText(`${location.origin}${j.enlace}`).catch(() => {})
      location.reload()
    } catch (e) {
      btn.removeAttribute('disabled')
      alert(e instanceof Error ? e.message : 'no se pudo')
    }
  }

  async function guardarHoras(btn: HTMLElement) {
    const filas = $$<HTMLInputElement>('[data-horas]', raiz)
      .filter((i) => i.value !== '')
      .map((i) => ({ componenteId: i.dataset.horas!, reales: Number(i.value) }))
    btn.setAttribute('disabled', '')
    const r = await fetch(`/api/admin/plano/${d.id}/horas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filas }),
    })
    btn.removeAttribute('disabled')
    btn.textContent = r.ok ? 'Horas guardadas' : 'No se pudo guardar'
  }

  // ── Pintado ───────────────────────────────────────────────────────────────

  function pintarCiclo() {
    $('[data-grupo="ciclo"]', raiz)?.classList.toggle('hidden', config.cliente.tipo !== 'empresa')
    const c = config.cliente.ciclo
    const corte = $<HTMLInputElement>('[data-bind="cliente.ciclo.corteDia"]', raiz)
    const dias = $<HTMLInputElement>('[data-bind="cliente.ciclo.diasPago"]', raiz)
    if (corte && c) corte.value = String(c.corteDia)
    if (dias && c) dias.value = String(c.diasPago)
  }

  function pintarSegmentados() {
    for (const b of $$('[data-accion="set"]', raiz)) {
      const v = leer(config, b.dataset.ruta!)
      const activo = String(v ?? 'null') === b.dataset.valor
      b.dataset.activo = activo ? '1' : '0'
      b.setAttribute('aria-pressed', activo ? 'true' : 'false')
      if (soloLectura) b.setAttribute('disabled', '')
    }
    for (const b of $$('[data-accion="perilla"]', raiz)) {
      const k = b.dataset.valor as 'version' | 'planPago'
      b.dataset.activo = config.perillas[k] ? '1' : '0'
      if (soloLectura) b.setAttribute('disabled', '')
    }
  }

  function chip(texto: string, activo: boolean, attrs: string, extra = '') {
    return `<button type="button" class="pl-chip ${extra}" data-activo="${activo ? 1 : 0}" ${attrs} ${soloLectura ? 'disabled' : ''}>${esc(texto)}</button>`
  }

  /** Barra del rango de una línea: la tabla entera y la franja que quedó. */
  function barraRango(tabla: [number, number] | readonly [number, number], franja: readonly [number, number]) {
    const ancho = tabla[1] - tabla[0] || 1
    const a = ((franja[0] - tabla[0]) / ancho) * 100
    const b = ((franja[1] - tabla[0]) / ancho) * 100
    return `<div class="pl-rango" aria-hidden="true"><span style="left:${a.toFixed(1)}%;width:${Math.max(b - a, 1.5).toFixed(1)}%"></span></div>`
  }

  function pintarComponentes() {
    const el = $('#r-componentes', raiz)
    if (!el) return
    const calc = new Map((snap?.lineas ?? []).map((l) => [l.id, l]))
    // Activas primero (a lo ancho) y después, en cuadrícula, las que se pueden
    // agregar: intercaladas dejaban huecos en la rejilla.
    const orden = [...COMPONENTES].sort((a, b) => Number(!config.lineas.some((l) => l.id === a.id)) - Number(!config.lineas.some((l) => l.id === b.id)))
    el.innerHTML = orden.map((c) => {
      const l = config.lineas.find((x) => x.id === c.id)
      const lc = calc.get(c.id)
      const forzada = (SIEMPRE_ESENCIALES as readonly string[]).includes(c.id)
      if (!l) {
        return `<button type="button" class="pl-comp pl-comp--off" data-accion="linea" data-id="${c.id}" ${soloLectura ? 'disabled' : ''}>
          <span class="pl-comp__mas" aria-hidden="true">+</span>
          <span class="pl-comp__nombre">${esc(c.nombre)}</span>
          <span class="pl-comp__horas">${c.horas[0]}-${c.horas[1]} h${c.unidad ? ' c/u' : ''}</span>
        </button>`
      }
      const abierta = abiertas.has(c.id)
      const pregs = preguntasDe(c.id)
      const fuera = lc && !lc.incluida
      return `<div class="pl-comp pl-comp--on ${fuera ? 'pl-comp--fuera' : ''}" data-prioridad="${l.prioridad}">
        <div class="pl-comp__cab">
          <button type="button" class="pl-comp__titulo" data-accion="abrir" data-id="${c.id}" aria-expanded="${abierta}">
            <span class="pl-dot pl-dot--${l.prioridad}" aria-hidden="true"></span>
            <span class="pl-comp__nombre">${esc(c.nombre)}${l.cantidad > 1 ? ` <span class="pl-x">×${l.cantidad}</span>` : ''}</span>
            <span class="pl-comp__horas">${lc ? `${lc.horas[0]}-${lc.horas[1]} h` : ''}</span>
            ${pregs.length ? `<span class="pl-comp__preg">${lc?.preguntasRespondidas ?? 0}/${pregs.length}</span>` : ''}
          </button>
          <button type="button" class="pl-quitar" data-accion="linea" data-id="${c.id}" aria-label="Quitar ${esc(c.nombre)}" ${soloLectura ? 'disabled' : ''}>×</button>
        </div>
        ${lc ? barraRango(lc.horasTabla, lc.horas) : ''}
        ${fuera ? `<p class="pl-nota">No entra en la versión ${esc(NIVEL_LABEL[config.version].toLowerCase())}.</p>` : ''}
        ${
          abierta
            ? `<div class="pl-comp__cuerpo">
          ${
            l.cita
              ? `<blockquote class="pl-cita"><span class="pl-cita__label">El cliente dijo</span>“${esc(l.cita)}”${l.razon ? `<span class="pl-cita__razon">${esc(l.razon)}</span>` : ''}</blockquote>`
              : ''
          }
          <div class="pl-fila">
            <span class="pl-fila__label">Prioridad</span>
            <div class="pl-chips">${(['esencial', 'recomendado', 'extra'] as Prioridad[])
              .map((p) => chip(PRIORIDAD_LABEL[p], l.prioridad === p, `data-accion="prioridad" data-id="${c.id}" data-valor="${p}" ${forzada && p !== 'esencial' ? 'disabled' : ''}`))
              .join('')}</div>
          </div>
          ${
            c.unidad
              ? `<div class="pl-fila"><span class="pl-fila__label">Cantidad <span class="pl-sub">${esc(c.unidad)}</span></span>
              <div class="pl-stepper">
                <button type="button" data-accion="cantidad" data-id="${c.id}" data-valor="-1" aria-label="Menos" ${soloLectura ? 'disabled' : ''}>−</button>
                <span class="tabular-nums">${l.cantidad}</span>
                <button type="button" data-accion="cantidad" data-id="${c.id}" data-valor="1" aria-label="Más" ${soloLectura ? 'disabled' : ''}>+</button>
              </div></div>`
              : ''
          }
          ${pregs
            .map(
              (p) => `<div class="pl-fila pl-fila--preg"><span class="pl-fila__label">${esc(p.texto)}</span>
              <div class="pl-chips">${p.opciones
                .map((o, i) => chip(o.texto, l.respuestas[p.id] === i, `data-accion="respuesta" data-id="${c.id}" data-pregunta="${p.id}" data-valor="${i}"`))
                .join('')}</div></div>`,
            )
            .join('')}
          ${
            l.prioridad !== 'esencial'
              ? `<label class="pl-check"><input type="checkbox" data-accion="perilla-linea" data-id="${c.id}" ${config.perillas.lineas.includes(c.id) ? 'checked' : ''} ${soloLectura ? 'disabled' : ''}/> El cliente puede decidir si la incluye</label>`
              : ''
          }
        </div>`
            : ''
        }
      </div>`
    }).join('')
  }

  function pintarMedidor() {
    const el = $('#r-medidor', raiz)
    if (!el) return
    if (!snap) {
      el.innerHTML = `<div class="pl-vacio">${esc(error ?? '')}</div>`
      return
    }
    const s = snap
    // Escala del cono: del piso de la versión esencial al techo de la completa
    // SIN respuestas, que es lo más ancho que puede llegar a ser el rango.
    const abierto = snapAbierto()
    const piso = Math.min(abierto?.rango[0] ?? s.rango[0], s.rango[0])
    const techo = Math.max(abierto?.rango[1] ?? s.rango[1], s.rango[1])
    const esc100 = (v: number) => (techo === piso ? 50 : ((v - piso) / (techo - piso)) * 100)
    const pago1 = s.plan.pagos[0]
    el.innerHTML = `
      <div class="pl-medidor__precio">
        <span class="pl-label">Precio a ofrecer</span>
        <strong class="tabular-nums" data-cifra="${s.precio}">${esc(m(s.precio))}</strong>
        <span class="pl-medidor__total">${s.plan.total !== s.precio ? `Total con ${s.plan.tipo === 'cuotas' ? 'recargo' : 'descuento'}: ${esc(m(s.plan.total))}` : `${s.horas[0]}-${s.horas[1]} h con colchón del ${s.colchonPct} %`}</span>
      </div>
      <div class="pl-cono" role="img" aria-label="Rango de precio entre ${esc(m(s.rango[0]))} y ${esc(m(s.rango[1]))}, certeza ${Math.round(s.certeza * 100)} %">
        <div class="pl-cono__pista">
          <span class="pl-cono__abierto" style="left:${esc100(abierto?.rango[0] ?? s.rango[0]).toFixed(1)}%;width:${(esc100(abierto?.rango[1] ?? s.rango[1]) - esc100(abierto?.rango[0] ?? s.rango[0])).toFixed(1)}%"></span>
          <span class="pl-cono__cerrado" style="left:${esc100(s.rango[0]).toFixed(1)}%;width:${Math.max(esc100(s.rango[1]) - esc100(s.rango[0]), 1).toFixed(1)}%"></span>
          <span class="pl-cono__marca" style="left:${esc100(s.precio).toFixed(1)}%"></span>
        </div>
        <div class="pl-cono__ejes"><span>${esc(m(s.rango[0]))}</span><span>${esc(m(s.rango[1]))}</span></div>
      </div>
      <div class="pl-certeza">
        <div class="pl-certeza__barra"><span style="width:${Math.round(s.certeza * 100)}%"></span></div>
        <span class="pl-certeza__txt"><b>${Math.round(s.certeza * 100)} %</b> de certeza${s.certeza < 0.6 ? ' · cada respuesta baja lo que tienes que cobrar para cubrirte' : ''}</span>
      </div>
      <div class="pl-versiones">
        ${s.versiones
          .map(
            (v) => `<button type="button" class="pl-version" data-accion="set" data-ruta="version" data-valor="${v.nivel}" ${v.repetida ? 'data-repetida="1"' : ''} ${soloLectura ? 'disabled' : ''}>
            <span class="pl-version__nivel">${esc(NIVEL_LABEL[v.nivel])}</span>
            <span class="pl-version__precio tabular-nums">${esc(m(v.precio))}</span>
            <span class="pl-version__sin">${v.repetida ? 'igual a la anterior' : v.sinIncluir.length ? `sin ${v.sinIncluir.length} ${v.sinIncluir.length === 1 ? 'pieza' : 'piezas'}` : 'todo incluido'}</span>
          </button>`,
          )
          .join('')}
      </div>
      <div class="pl-resumen-plan">
        <span>${s.plan.pagos.length} ${s.plan.pagos.length === 1 ? 'pago' : 'pagos'} · primero ${esc(m(pago1.monto))} al firmar</span>
        <span>Publicación ${esc(fechaCorta(s.hitos[s.hitos.length - 1].fecha))}</span>
      </div>`
    pintarSegmentados()
  }

  /** La misma propuesta sin respuestas, para dibujar cuánto se cerró el cono. */
  function snapAbierto(): Snapshot | null {
    try {
      return armarPropuesta({ ...config, lineas: config.lineas.map((l) => ({ ...l, respuestas: {} })) }, d.reglas, d.hoy)
    } catch {
      return null
    }
  }

  function pintarPagos() {
    const el = $('#r-pagos', raiz)
    if (!el) return
    if (!snap) {
      el.innerHTML = ''
      return
    }
    const s = snap
    const opc = s.opcionesPlan
    const planes = [
      { v: 'hitos', t: 'Por entregas', ok: true },
      { v: 'cuotas', t: 'En cuotas', ok: opc.cuotas },
      { v: 'contado', t: 'De contado', ok: opc.contado },
    ]
    const usura = s.plan.usura
    const notaUsura =
      s.plan.tipo !== 'cuotas'
        ? ''
        : usura.estado === 'ok'
          ? `<p class="pl-ok">Recargo de ${d.reglas.cuotas.recargoMensualPct} % mensual, por debajo de la usura (${usura.usuraMensualPct} % mensual).</p>`
          : usura.estado === 'excede'
            ? `<p class="pl-alerta">El recargo de ${d.reglas.cuotas.recargoMensualPct} % mensual supera la usura (${usura.usuraMensualPct} % mensual). Bájalo en las reglas de pago.</p>`
            : `<p class="pl-aviso">Recargo sin verificar: escribe la tasa de usura del mes en <a href="/admin/plano/ajustes">reglas de pago</a>.</p>`
    el.innerHTML = `
      <div class="pl-chips pl-chips--grandes">${planes
        .map((p) =>
          chip(p.t, s.plan.tipo === p.v, `data-accion="set" data-ruta="planPago" data-valor="${p.v}" ${p.ok ? '' : 'disabled title="No aplica a este monto o está apagado en las reglas"'}`),
        )
        .join('')}</div>
      ${
        s.plan.tipo === 'cuotas'
          ? `<div class="pl-fila"><span class="pl-fila__label">Número de cuotas</span><div class="pl-chips">${Array.from({ length: opc.maxCuotas }, (_, i) => i + 1)
              .map((n) => chip(String(n), s.plan.pagos.filter((p) => p.cuota).length === n, `data-accion="set" data-ruta="numCuotas" data-valor="${n}" data-num`))
              .join('')}</div></div>`
          : ''
      }
      ${notaUsura}
      <ol class="pl-pagos">${s.plan.pagos
        .map(
          (p) => `<li>
          <span class="pl-pagos__n">${p.n}</span>
          <span class="pl-pagos__concepto">${esc(p.concepto)}${p.pct ? ` <span class="pl-sub">${p.pct} %</span>` : ''}
            ${p.cuota ? `<span class="pl-sub">abono ${esc(m(p.cuota.abono))} + recargo ${esc(m(p.cuota.recargo))}</span>` : ''}
            ${p.radicarAntesDe ? `<span class="pl-sub">radicar antes del ${esc(fechaCorta(p.radicarAntesDe))}</span>` : ''}</span>
          <span class="pl-pagos__fecha">${esc(fechaCorta(p.vence))}</span>
          <span class="pl-pagos__monto tabular-nums">${esc(m(p.monto))}</span>
        </li>`,
        )
        .join('')}</ol>
      ${lineaTiempo(s)}`
    pintarSegmentados()
  }

  /** Cronograma: hitos sobre una línea, con los pagos colgando de su fecha. */
  function lineaTiempo(s: Snapshot) {
    const inicio = s.hitos[0].fecha
    const fin = [...s.hitos.map((h) => h.fecha), ...s.plan.pagos.map((p) => p.vence)].sort().at(-1)!
    const t0 = new Date(`${inicio}T12:00:00`).getTime()
    const t1 = new Date(`${fin}T12:00:00`).getTime()
    const x = (iso: string) => (t1 === t0 ? 0 : ((new Date(`${iso}T12:00:00`).getTime() - t0) / (t1 - t0)) * 100)
    return `<div class="pl-tiempo" aria-label="Cronograma">
      <div class="pl-tiempo__eje"></div>
      ${s.hitos
        .map(
          (h, i) => `<div class="pl-tiempo__hito ${i % 2 ? 'pl-tiempo__hito--abajo' : ''}" style="left:${x(h.fecha).toFixed(1)}%"><span class="pl-tiempo__punto"></span><span class="pl-tiempo__txt"><b>${esc(h.nombre)}</b>${esc(fechaCorta(h.fecha))}</span></div>`,
        )
        .join('')}
      ${s.plan.pagos.map((p) => `<span class="pl-tiempo__pago" style="left:${x(p.vence).toFixed(1)}%" title="${esc(p.concepto)}: ${esc(m(p.monto))}"></span>`).join('')}
    </div>
    <p class="pl-sub pl-leyenda"><span class="pl-leyenda__hito"></span> entregas · <span class="pl-leyenda__pago"></span> pagos · ${HITOS.publicacion.nombre.toLowerCase()} a ${Math.ceil(s.horas[1] / d.reglas.horasSemana)} semanas a ${d.reglas.horasSemana} h/semana</p>`
  }

  function pintarClausulas() {
    const el = $('#r-clausulas', raiz)
    if (!el) return
    if (!snap) {
      el.innerHTML = ''
      return
    }
    el.innerHTML = snap.clausulas
      .map((c) => {
        const ab = abiertas.has(`cl-${c.id}`)
        return `<div class="pl-clausula ${c.activa ? '' : 'pl-clausula--off'}">
        <div class="pl-clausula__cab">
          <button type="button" class="pl-switch" role="switch" aria-checked="${c.activa}" aria-label="Incluir ${esc(c.titulo)}" data-accion="clausula" data-id="${c.id}" ${soloLectura ? 'disabled' : ''}><span></span></button>
          <button type="button" class="pl-clausula__titulo" data-accion="abrir" data-id="cl-${c.id}" aria-expanded="${ab}">${esc(c.titulo)}</button>
          ${c.motivo ? `<span class="pl-motivo">${esc(c.motivo)}</span>` : ''}
        </div>
        ${ab ? `<div class="pl-clausula__textos"><p><span class="pl-label">En cristiano</span>${esc(c.simple)}</p><p class="pl-formal"><span class="pl-label">Formal</span>${esc(c.formal)}</p></div>` : ''}
      </div>`
      })
      .join('')
  }

  function pintarEncaje() {
    const el = $('#r-encaje', raiz)
    if (!el) return
    if (!snap) {
      el.innerHTML = ''
      return
    }
    const s = snap
    const e = calcularEncaje({
      ingresoNeto: config.moneda === 'COP' ? s.plan.total : 0,
      gastoMensual: d.encaje.gastoMensual,
      capacidad: d.reglas.capacidadSemana,
      otros: d.encaje.otros,
      nueva: { nombre: 'Esta propuesta', inicio: s.hitos[0].fecha, fin: s.hitos[s.hitos.length - 1].fecha, horas: s.horas[1] },
    })
    const max = Math.max(d.reglas.capacidadSemana, ...e.semanas.map((w) => w.ocupadas + w.nueva))
    el.innerHTML = `
      <div class="pl-encaje__meses">
        ${
          e.mesesCubiertos != null
            ? `<strong class="tabular-nums">${String(e.mesesCubiertos).replace('.', ',')}</strong><span>meses de gastos cubiertos<br/><span class="pl-sub">con ${esc(formatearMonto(e.gastoMensual!, 'COP'))} al mes, antes de retenciones</span></span>`
            : `<span class="pl-sub">${config.moneda === 'USD' ? 'Los gastos están en pesos: la cuenta solo se hace en COP.' : 'Sin gastos anotados en Costos de vida.'}</span>`
        }
      </div>
      <div class="pl-carga" role="img" aria-label="Carga semanal: ${e.choques} semanas sobre la capacidad">
        ${e.semanas
          .map((w) => {
            const hO = (w.ocupadas / max) * 100
            const hN = (w.nueva / max) * 100
            const pasa = w.ocupadas + w.nueva > w.capacidad
            return `<div class="pl-carga__col ${pasa ? 'pl-carga__col--pasa' : ''}" title="Semana del ${esc(fechaCorta(w.lunes))}: ${w.ocupadas} h comprometidas${w.trabajos.length ? ` (${esc(w.trabajos.join(', '))})` : ''} + ${w.nueva} h de esta">
              <span class="pl-carga__nueva" style="height:${hN.toFixed(1)}%"></span><span class="pl-carga__ocupada" style="height:${hO.toFixed(1)}%"></span>
            </div>`
          })
          .join('')}
        <span class="pl-carga__tope" style="bottom:${((d.reglas.capacidadSemana / max) * 100).toFixed(1)}%"></span>
      </div>
      ${
        e.choques
          ? `<p class="pl-alerta">${e.choques} ${e.choques === 1 ? 'semana se pasa' : 'semanas se pasan'} de tus ${d.reglas.capacidadSemana} h.${
              e.inicioSugerido
                ? ` <button type="button" class="pl-link" data-accion="inicio-sugerido" data-valor="${habilEnODespues(e.inicioSugerido)}" ${soloLectura ? 'disabled' : ''}>Empezar el ${esc(fechaCorta(habilEnODespues(e.inicioSugerido)))}</button>`
                : ''
            }</p>`
          : `<p class="pl-ok">${d.encaje.otros.length ? 'Cabe con lo que ya tienes comprometido.' : 'No hay otros proyectos aceptados en esas semanas.'}</p>`
      }`
  }

  function pintarAvisos() {
    const el = $('#r-avisos', raiz)
    if (!el) return
    // faltantesEnvio ya pide el nombre del contacto; de faltantesContacto solo
    // interesa lo demás (un teléfono o correo).
    const unicos = [...faltantesEnvio(config), ...faltantesContacto(config.contacto).filter((x) => !x.includes('nombre'))]
    const avisos = avisosContacto(config.contacto)
    el.innerHTML = [
      ...unicos.map((f) => `<li class="pl-falta">Falta ${esc(f)}</li>`),
      ...avisos.map((a) => `<li class="pl-aviso-li">${esc(a)}</li>`),
      ...(snap?.aplicoMinimo ? [`<li class="pl-aviso-li">Se aplicó el mínimo por proyecto.</li>`] : []),
    ].join('')
    el.classList.toggle('hidden', el.innerHTML === '')
  }

  function pintarIaChat() {
    const el = $('#r-ia-chat', raiz)
    if (!el) return
    if (!iaChat) {
      el.innerHTML = ''
      return
    }
    el.innerHTML = `
      <p class="pl-ok">Listo: ${config.lineas.length} componentes${iaChat.costo ? ` · US$${iaChat.costo.toFixed(3)}` : ''}. Revisa cada uno: las citas son literales de la conversación.</p>
      ${iaChat.descartadas.length ? `<p class="pl-aviso">${iaChat.descartadas.length} ${iaChat.descartadas.length === 1 ? 'cita no aparecía' : 'citas no aparecían'} tal cual en la conversación y se quitaron.</p>` : ''}
      ${
        iaChat.preguntas.length
          ? `<div class="pl-preguntas"><span class="pl-label">Pregúntale al cliente antes de enviar</span><ul>${iaChat.preguntas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
          : ''
      }`
  }

  function pintarRevision() {
    const el = $('#r-revision', raiz)
    if (!el) return
    if (!revision) {
      el.innerHTML = `<p class="pl-sub">Claude lee la propuesta como el cliente más quisquilloso y te devuelve lo ambiguo, lo que se presta para que el alcance crezca sin pagarse y lo que puede salir mal.</p>`
      return
    }
    const r = revision
    el.innerHTML = `
      <p class="pl-veredicto">${esc(r.veredicto)}</p>
      ${
        r.ambiguedades.length
          ? `<div class="pl-rev"><span class="pl-label">Ambigüedades</span>${r.ambiguedades
              .map((a) => `<div class="pl-rev__item"><b>${esc(a.donde)}</b><p>${esc(a.problema)}</p><p class="pl-rev__preg">Pregunta: ${esc(a.pregunta)}</p></div>`)
              .join('')}</div>`
          : ''
      }
      ${
        r.riesgos.length
          ? `<div class="pl-rev"><span class="pl-label">Alcance que se puede estirar</span>${r.riesgos
              .map((a) => `<div class="pl-rev__item"><b>${esc(a.riesgo)}</b><p>${esc(a.mitigacion)}</p></div>`)
              .join('')}</div>`
          : ''
      }
      ${r.premortem.length ? `<div class="pl-rev"><span class="pl-label">Si este proyecto saliera mal, sería porque…</span><ul>${r.premortem.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      ${r.cifrasRechazadas?.length ? `<p class="pl-aviso">Se quitaron ${r.cifrasRechazadas.length} cifras que no salían del cálculo.</p>` : ''}
      <p class="pl-sub">Revisión del ${esc(fechaCorta(r.generadaEl))}. Si cambias la propuesta, vuelve a pedirla.</p>`
  }

  function pintarAprende() {
    const el = $('#r-aprende', raiz)
    if (!el || !d.aceptacion) return
    const s = snap
    const incluidas = (s?.lineas ?? []).filter((l) => l.incluida)
    el.innerHTML = `
      <p class="pl-sub">Anota cuántas horas te tomó de verdad cada componente. Con tres mediciones o más por componente, Plano te dice si tu tabla se queda corta o larga.</p>
      <div class="pl-horas">${incluidas
        .map((l) => {
          const h = d.horas.find((x) => x.componenteId === l.id)
          return `<label><span>${esc(l.nombre)} <span class="pl-sub">estimado ${l.horas[1]} h</span></span><input type="number" min="0" step="0.5" data-horas="${l.id}" value="${h ? h.reales : ''}" ${d.demo ? 'disabled' : ''}/></label>`
        })
        .join('')}</div>
      ${d.demo ? '' : '<button type="button" class="pl-btn" data-accion="guardar-horas">Guardar horas reales</button>'}
      ${
        d.calibraciones.length
          ? `<div class="pl-rev"><span class="pl-label">Lo que dicen tus proyectos</span>${d.calibraciones
              .map((c) => `<div class="pl-rev__item"><b>${esc(c.nombre)}</b> <span class="pl-sub">${c.muestras} ${c.muestras === 1 ? 'medición' : 'mediciones'} · real/estimado ${String(c.factor).replace('.', ',')}</span><p>${esc(c.sugerencia)}</p></div>`)
              .join('')}</div>`
          : ''
      }`
  }

  function pintarTodo() {
    pintarComponentes()
    pintarMedidor()
    pintarPagos()
    pintarClausulas()
    pintarEncaje()
    pintarAvisos()
    pintarIaChat()
    pintarSegmentados()
    const precio = $('#p-precio-movil', raiz)
    if (precio) precio.textContent = snap ? m(snap.precio) : '-'
  }

  // ── Arranque ──────────────────────────────────────────────────────────────

  rellenarCampos()
  pintarCiclo()
  recalcular()
  pintarTodo()
  pintarRevision()
  pintarAprende()
  pintarGuardado()
  if (!d.iaDisponible) for (const b of $$('[data-accion^="ia-"]', raiz)) b.setAttribute('disabled', '')

  window.addEventListener('beforeunload', (e) => {
    if (estadoGuardado === 'pendiente' || estadoGuardado === 'guardando') {
      void guardarAhora()
      e.preventDefault()
    }
  })

}
