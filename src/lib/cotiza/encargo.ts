// El encargo de Cotiza como dato: su configuración editable, sus estados y qué
// se puede hacer en cada uno (docs/plan-cotiza.md, Fase 2).
//
// La máquina de estados es corta a propósito:
//
//   borrador ──congelar──▶ enviado ──aceptar──▶ aceptado ──cerrar──▶ cerrado
//      ▲                     │
//      └──────reabrir────────┘        (borrador y enviado se pueden descartar)
//
// Reabrir solo existe ANTES de aceptar. Después, el precio es el pactado y lo
// nuevo entra por la bitácora como adicional: no hay botón para "ajustar" una
// propuesta aceptada, porque esa es exactamente la mala práctica que Cotiza
// existe para evitar.
//
// Módulo PURO e isomorfo.

import { NIVELES, type NivelConsultoria } from '../../data/cotiza'
import type { Moneda } from '../../data/tarifario'
import type { Entregable } from './motor'

export type EstadoEncargo = 'borrador' | 'enviado' | 'aceptado' | 'cerrado' | 'descartado'

export type AccionEncargo =
  | 'guardar'
  | 'congelar'
  | 'reabrir'
  | 'aceptar'
  | 'descartar'
  | 'cerrar'
  | 'solicitud'
  | 'reunion'
  | 'ronda'
  | 'adicional'
  | 'decidir'

const PERMITIDAS: Record<EstadoEncargo, AccionEncargo[]> = {
  borrador: ['guardar', 'congelar', 'descartar'],
  enviado: ['aceptar', 'reabrir', 'descartar'],
  aceptado: ['solicitud', 'reunion', 'ronda', 'adicional', 'decidir', 'cerrar'],
  cerrado: [],
  descartado: [],
}

export function puede(estado: EstadoEncargo, accion: AccionEncargo): boolean {
  return PERMITIDAS[estado]?.includes(accion) ?? false
}

export const ESTADO_TRAS: Partial<Record<AccionEncargo, EstadoEncargo>> = {
  congelar: 'enviado',
  reabrir: 'borrador',
  aceptar: 'aceptado',
  descartar: 'descartado',
  cerrar: 'cerrado',
}

export type ConfigEncargo = {
  titulo: string
  cliente: { nombre: string; empresa: string; contacto: string }
  moneda: Moneda
  entregables: Entregable[]
  /** Lo que NO incluye. Escribirlo es lo que después permite decir "eso no estaba". */
  exclusiones: string[]
  /** Lo que se da por hecho (el cliente entrega la información, etc.). */
  supuestos: string[]
  /** Privadas: nunca salen al cliente. */
  notas: string
}

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

const lista = (v: unknown, maxItems: number, maxLargo: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => texto(x, maxLargo))
    .filter(Boolean)
    .slice(0, maxItems)

const NIVEL_IDS = NIVELES.map((n) => n.id)

const numero = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN)

/**
 * Entregable tal como llegó del navegador, con los tipos corregidos. No
 * valida rangos: eso lo hace el motor al cotizar, con el mismo mensaje que vería
 * cualquier otro llamador. Aquí solo se descarta lo que no tiene forma de
 * entregable.
 */
function entregable(v: unknown): Entregable | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const nombre = texto(o.nombre, 120)
  switch (o.tipo) {
    case 'presentacion':
      return {
        tipo: 'presentacion',
        nombre,
        diapositivas: numero(o.diapositivas),
        anexos: o.anexos === true,
        documentosFuente: numero(o.documentosFuente),
        cantidad: o.cantidad === undefined ? 1 : numero(o.cantidad),
      }
    case 'revision':
      return { tipo: 'revision', nombre, documentos: numero(o.documentos), paginasPorDocumento: numero(o.paginasPorDocumento) }
    case 'libre':
      return {
        tipo: 'libre',
        nombre,
        nivel: (NIVEL_IDS.includes(o.nivel as NivelConsultoria) ? o.nivel : 'operativa') as NivelConsultoria,
        horas: numero(o.horas),
      }
    default:
      return null
  }
}

export function configVacia(): ConfigEncargo {
  return {
    titulo: '',
    cliente: { nombre: '', empresa: '', contacto: '' },
    moneda: 'COP',
    entregables: [],
    exclusiones: [],
    supuestos: [],
    notas: '',
  }
}

export function normalizarConfig(raw: unknown): ConfigEncargo {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const c = (o.cliente && typeof o.cliente === 'object' ? o.cliente : {}) as Record<string, unknown>
  return {
    titulo: texto(o.titulo, 160),
    cliente: { nombre: texto(c.nombre, 120), empresa: texto(c.empresa, 120), contacto: texto(c.contacto, 160) },
    moneda: o.moneda === 'USD' ? 'USD' : 'COP',
    entregables: (Array.isArray(o.entregables) ? o.entregables : [])
      .slice(0, 40)
      .map(entregable)
      .filter((e): e is Entregable => e !== null),
    exclusiones: lista(o.exclusiones, 30, 300),
    supuestos: lista(o.supuestos, 30, 300),
    notas: texto(o.notas, 4000),
  }
}

/** Lo que falta para poder congelar, en palabras. Vacío = se puede. */
export function faltantesParaCongelar(c: ConfigEncargo): string[] {
  const f: string[] = []
  if (!c.titulo) f.push('el título del encargo')
  if (!c.cliente.nombre) f.push('el nombre del cliente')
  if (c.entregables.length === 0) f.push('al menos un entregable')
  if (c.exclusiones.length === 0) f.push('al menos una exclusión (lo que no incluye)')
  return f
}

// ── Bitácora ────────────────────────────────────────────────────────────────

export const CANALES = ['whatsapp', 'correo', 'llamada', 'reunion', 'otro'] as const
export type Canal = (typeof CANALES)[number]

export const CLASIFICACIONES = ['dentro', 'cupo', 'adicional'] as const
export type Clasificacion = (typeof CLASIFICACIONES)[number]

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/**
 * Lo que da un `<input type="datetime-local">` ('2026-10-06T19:30'), leído
 * como hora de Bogotá. Colombia no tiene horario de verano, así que el
 * desfase es siempre −05:00. Sin esto, el servidor (en UTC) leería las 7:30
 * p. m. como las 7:30 p. m. UTC y un pedido fuera de horario parecería dentro.
 */
export function instanteDesdeBogota(local: unknown): Date | null {
  if (typeof local !== 'string') return null
  const m = LOCAL_RE.exec(local)
  if (!m) return null
  const d = new Date(`${local}:00-05:00`)
  if (Number.isNaN(d.getTime())) return null
  // Rechaza fechas que el motor de fechas "corrige" (31 de febrero).
  const vuelta = new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 16)
  return vuelta === local ? d : null
}
