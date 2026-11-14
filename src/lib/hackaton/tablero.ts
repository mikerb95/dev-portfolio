// Tablero del equipo para la hackatón def/acc (RF-045 a RF-047).
//
// El estado completo vive en una sola fila (JSON) y cambia SOLO por
// operaciones que pasan por `aplicar`. Esa función es pura y corre en los dos
// lados: el servidor la usa para validar y guardar, y el navegador para
// pintar el cambio al instante. Si dos personas escriben a la vez, el servidor
// vuelve a aplicar la operación sobre la versión más nueva en lugar de pisar
// el estado entero: por eso se mandan operaciones y no el JSON completo.
//
// Módulo isomorfo: nada de node:crypto, ni ../db, ni reloj.

import { GRUPOS, LIMITE_PERSONAS, TAREAS, type Prioridad, PRIORIDADES } from '../../data/hackaton'
import { repartir } from './reparto'

export type EstadoTarea = 'pendiente' | 'en_curso' | 'hecha'
export const ESTADOS_TAREA: EstadoTarea[] = ['pendiente', 'en_curso', 'hecha']

export interface Persona {
  id: string
  nombre: string
  /** Índice en la paleta de la página. */
  color: number
}

export interface Grupo {
  id: string
  nombre: string
  tipo: 'frente' | 'extra'
  dueno: string | null
  /** Fijado a mano: el reparto lo respeta si se pide conservar ajustes. */
  manual: boolean
  apoyo: string[]
}

export interface Tarea {
  id: string
  grupo: string
  numero?: number
  titulo: string
  prioridad: Prioridad
  horas: number
  estado: EstadoTarea
  dueno: string | null
  /** false = hereda el dueño de su grupo. */
  manual: boolean
  /** Se quedó sin dueño porque quitaron a su persona: la página la resalta. */
  huerfana: boolean
  porConfirmar?: boolean
}

export interface Estado {
  v: 1
  limite: { min: number; max: number }
  /** Contador de ids: el reductor es determinista, no puede usar azar. */
  contador: number
  personas: Persona[]
  grupos: Grupo[]
  tareas: Tarea[]
}

export type Operacion =
  | { tipo: 'persona.agregar'; nombre: string }
  | { tipo: 'persona.quitar'; id: string }
  | { tipo: 'repartir'; modo: 'conservar' | 'cero' }
  | { tipo: 'grupo.asignar'; grupo: string; persona: string | null }
  | { tipo: 'tarea.asignar'; tarea: string; persona: string | null | 'grupo' }
  | { tipo: 'tarea.estado'; tarea: string; estado: EstadoTarea }
  | { tipo: 'tarea.editar'; tarea: string; titulo?: string; prioridad?: Prioridad; horas?: number }
  | { tipo: 'tarea.agregar'; grupo: string; titulo: string; prioridad: Prioridad; horas: number }
  | { tipo: 'tarea.borrar'; tarea: string }
  | { tipo: 'reiniciar' }

/** Error de regla de negocio: el mensaje se le muestra a la persona tal cual. */
export class ErrorTablero extends Error {}

export const PALETA = 6
export const MAX_TAREAS = 150

export function estadoInicial(): Estado {
  let n = 0
  return {
    v: 1,
    limite: { min: LIMITE_PERSONAS.min, max: LIMITE_PERSONAS.max },
    contador: TAREAS.length,
    personas: [],
    grupos: GRUPOS.map((g) => ({ ...g, dueno: null, manual: false, apoyo: [] })),
    tareas: TAREAS.map((t) => ({
      id: `t${++n}`,
      grupo: t.grupo,
      ...(t.numero !== undefined ? { numero: t.numero } : {}),
      titulo: t.titulo,
      prioridad: t.prioridad,
      horas: t.horas,
      estado: 'pendiente' as const,
      dueno: null,
      manual: false,
      huerfana: false,
      ...(t.porConfirmar ? { porConfirmar: true } : {}),
    })),
  }
}

const clonar = (e: Estado): Estado => JSON.parse(JSON.stringify(e)) as Estado

function tareaDe(e: Estado, id: string): Tarea {
  const t = e.tareas.find((x) => x.id === id)
  if (!t) throw new ErrorTablero('Esa tarea ya no existe.')
  return t
}

function grupoDe(e: Estado, id: string): Grupo {
  const g = e.grupos.find((x) => x.id === id)
  if (!g) throw new ErrorTablero('Ese frente no existe.')
  return g
}

function personaValida(e: Estado, id: string): void {
  if (!e.personas.some((p) => p.id === id)) throw new ErrorTablero('Esa persona ya no está en el equipo.')
}

/** Las tareas que heredan toman el dueño de su grupo. */
function propagar(e: Estado): void {
  const duenos = new Map(e.grupos.map((g) => [g.id, g.dueno]))
  for (const t of e.tareas) {
    if (!t.manual) t.dueno = duenos.get(t.grupo) ?? null
    if (t.dueno) t.huerfana = false
  }
}

export function horasPorGrupo(e: Estado): Record<string, number> {
  const horas: Record<string, number> = Object.fromEntries(e.grupos.map((g) => [g.id, 0]))
  for (const t of e.tareas) horas[t.grupo] = (horas[t.grupo] ?? 0) + t.horas
  return horas
}

/**
 * Aplica una operación y devuelve un estado NUEVO (no muta la entrada).
 * Lanza ErrorTablero si la operación no cabe en las reglas.
 */
export function aplicar(estado: Estado, op: Operacion): Estado {
  if (op.tipo === 'reiniciar') return estadoInicial()
  const e = clonar(estado)

  switch (op.tipo) {
    case 'persona.agregar': {
      const nombre = op.nombre.trim()
      if (!nombre) throw new ErrorTablero('Escribe un nombre.')
      if (e.personas.length >= e.limite.max) {
        throw new ErrorTablero(`El reglamento admite máximo ${e.limite.max} personas por equipo.`)
      }
      if (e.personas.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new ErrorTablero('Esa persona ya está en el equipo.')
      }
      const usados = new Set(e.personas.map((p) => p.color))
      let color = 0
      while (usados.has(color) && color < PALETA - 1) color++
      e.personas.push({ id: `p${++e.contador}`, nombre, color })
      break
    }
    case 'persona.quitar': {
      personaValida(e, op.id)
      e.personas = e.personas.filter((p) => p.id !== op.id)
      for (const g of e.grupos) {
        if (g.dueno === op.id) {
          g.dueno = null
          g.manual = false
        }
        g.apoyo = g.apoyo.filter((p) => p !== op.id)
      }
      for (const t of e.tareas) {
        if (t.dueno !== op.id) continue
        // Fijada sin dueño: si heredara, tomaría el dueño del frente (que
        // puede ser otra persona) y desaparecería de la vista de pendientes.
        t.dueno = null
        t.manual = true
        t.huerfana = true
      }
      break
    }
    case 'repartir': {
      if (op.modo === 'cero') {
        for (const g of e.grupos) if (g.tipo === 'frente') g.manual = false
        for (const t of e.tareas) t.manual = false
      }
      // Una huérfana no es un ajuste deliberado: vuelve a heredar.
      for (const t of e.tareas) if (t.huerfana) t.manual = false
      const frentes = e.grupos.filter((g) => g.tipo === 'frente')
      const horas = horasPorGrupo(e)
      const manuales: Record<string, string> = {}
      for (const g of frentes) if (g.manual && g.dueno) manuales[g.id] = g.dueno
      const r = repartir({
        personas: e.personas.map((p) => p.id),
        frentes: frentes.map((g) => ({ id: g.id, horas: horas[g.id] ?? 0 })),
        manuales,
      })
      for (const g of frentes) {
        g.dueno = r.dueno[g.id] ?? null
        g.apoyo = r.apoyo[g.id] ?? []
      }
      break
    }
    case 'grupo.asignar': {
      const g = grupoDe(e, op.grupo)
      if (op.persona) personaValida(e, op.persona)
      g.dueno = op.persona
      g.manual = op.persona !== null
      g.apoyo = g.apoyo.filter((p) => p !== op.persona)
      // Las huérfanas del frente siguen al dueño nuevo: reasignar el frente
      // completo es justo la forma de recogerlas.
      if (op.persona) for (const t of e.tareas) if (t.grupo === g.id && t.huerfana) t.manual = false
      break
    }
    case 'tarea.asignar': {
      const t = tareaDe(e, op.tarea)
      if (op.persona === 'grupo') {
        t.manual = false
      } else {
        if (op.persona) personaValida(e, op.persona)
        t.dueno = op.persona
        t.manual = true
        if (!op.persona) t.huerfana = false
      }
      break
    }
    case 'tarea.estado': {
      tareaDe(e, op.tarea).estado = op.estado
      break
    }
    case 'tarea.editar': {
      const t = tareaDe(e, op.tarea)
      if (op.titulo !== undefined) {
        const titulo = op.titulo.trim()
        if (!titulo) throw new ErrorTablero('La tarea necesita un título.')
        t.titulo = titulo
      }
      if (op.prioridad !== undefined) t.prioridad = op.prioridad
      if (op.horas !== undefined) t.horas = op.horas
      // Editar a mano es confirmar el dato.
      delete t.porConfirmar
      break
    }
    case 'tarea.agregar': {
      grupoDe(e, op.grupo)
      if (e.tareas.length >= MAX_TAREAS) throw new ErrorTablero(`El tablero admite hasta ${MAX_TAREAS} tareas.`)
      const titulo = op.titulo.trim()
      if (!titulo) throw new ErrorTablero('La tarea necesita un título.')
      e.tareas.push({
        id: `t${++e.contador}`,
        grupo: op.grupo,
        titulo,
        prioridad: op.prioridad,
        horas: op.horas,
        estado: 'pendiente',
        dueno: null,
        manual: false,
        huerfana: false,
      })
      break
    }
    case 'tarea.borrar': {
      tareaDe(e, op.tarea)
      e.tareas = e.tareas.filter((t) => t.id !== op.tarea)
      break
    }
  }

  propagar(e)
  return e
}

// ── Lecturas derivadas (para la página) ─────────────────────────────────────

/**
 * Horas por persona según las tareas que tiene. Una tarea que hereda de un
 * frente con apoyo se reparte por partes iguales entre dueño y apoyo.
 */
export function cargaPorPersona(e: Estado): Record<string, number> {
  const carga: Record<string, number> = Object.fromEntries(e.personas.map((p) => [p.id, 0]))
  const grupos = new Map(e.grupos.map((g) => [g.id, g]))
  for (const t of e.tareas) {
    if (!t.dueno || !(t.dueno in carga)) continue
    const g = grupos.get(t.grupo)
    const manos = !t.manual && g && g.dueno === t.dueno ? [t.dueno, ...g.apoyo] : [t.dueno]
    for (const p of manos) if (p in carga) carga[p] += t.horas / manos.length
  }
  for (const p of Object.keys(carga)) carga[p] = Math.round(carga[p] * 100) / 100
  return carga
}

export interface Progreso {
  hechas: number
  total: number
  horasHechas: number
  horasTotal: number
  /** 0 a 1, ponderado por horas; si nada tiene horas, por conteo. */
  avance: number
}

export function progreso(tareas: Tarea[]): Progreso {
  let hechas = 0
  let horasHechas = 0
  let horasTotal = 0
  for (const t of tareas) {
    horasTotal += t.horas
    if (t.estado === 'hecha') {
      hechas++
      horasHechas += t.horas
    }
  }
  const avance = horasTotal > 0 ? horasHechas / horasTotal : tareas.length ? hechas / tareas.length : 0
  return {
    hechas,
    total: tareas.length,
    horasHechas: Math.round(horasHechas * 100) / 100,
    horasTotal: Math.round(horasTotal * 100) / 100,
    avance,
  }
}

export interface Filtros {
  /** id de persona, o 'sin' para las tareas sin dueño. */
  persona?: string
  grupo?: string
  prioridad?: Prioridad
  estado?: EstadoTarea
}

export function filtrar(tareas: Tarea[], f: Filtros): Tarea[] {
  return tareas.filter(
    (t) =>
      (!f.persona || (f.persona === 'sin' ? !t.dueno : t.dueno === f.persona)) &&
      (!f.grupo || t.grupo === f.grupo) &&
      (!f.prioridad || t.prioridad === f.prioridad) &&
      (!f.estado || t.estado === f.estado)
  )
}

export const esPrioridad = (x: unknown): x is Prioridad => PRIORIDADES.includes(x as Prioridad)
