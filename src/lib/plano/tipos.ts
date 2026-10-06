// Tipos de Plano compartidos por el constructor, el servidor y el enlace del
// cliente. Módulo PURO (solo tipos y constantes).

import type { HitoId } from '../../data/plano'
import type { ClausulaRenderizada } from '../../data/clausulas'
import type { Moneda } from '../../data/tarifario'
import type { Rango } from '../asistente/calculo-cotizacion'
import type { MapaContacto } from './contacto'
import type { CicloEmpresa } from './fechas'
import type { PlanPago, TipoPlan } from './pagos'

export type Prioridad = 'esencial' | 'recomendado' | 'extra'
export type NivelVersion = 'esencial' | 'recomendada' | 'completa'

export const NIVELES: readonly NivelVersion[] = ['esencial', 'recomendada', 'completa']

export const NIVEL_LABEL: Record<NivelVersion, string> = {
  esencial: 'Esencial',
  recomendada: 'Recomendada',
  completa: 'Completa',
}

/**
 * "Panel de administración (2 tipos de dato administrado)". Un "(2)" a secas
 * se leía como dos paneles, dos usuarios o un nivel 2 (lo señaló la revisión
 * del cliente difícil en la primera corrida real, 6 oct 2026).
 */
export function cantidadConUnidad(cantidad: number, unidad: string | undefined): string {
  if (cantidad <= 1) return ''
  const corta = (unidad ?? 'unidades').replace(/\s*\(.*\)\s*$/, '')
  return ` (${cantidad} × ${corta})`
}

export type LineaConfig = {
  id: string
  cantidad: number
  prioridad: Prioridad
  /** Respuesta elegida por pregunta: id de pregunta → índice de opción. */
  respuestas: Record<string, number>
  /** Frase literal del cliente que originó la línea (la pone "del chat al plano"). */
  cita?: string
  /** Por qué está la línea, en una frase. */
  razon?: string
}

export type ClienteConfig = {
  nombre: string
  empresa: string
  tipo: 'persona' | 'empresa'
  correo: string
  telefono: string
  documento: string
  ciclo: CicloEmpresa | null
}

export type PerillasConfig = {
  /** El cliente puede elegir entre las tres versiones. */
  version: boolean
  /** El cliente puede elegir el plan de pago (entre los que apliquen). */
  planPago: boolean
  /** Ids de líneas que el cliente puede quitar o poner por su cuenta. */
  lineas: string[]
}

export type ConfigPropuesta = {
  titulo: string
  /** Párrafo de apertura para el cliente: qué entendí de lo que necesita. */
  resumen: string
  moneda: Moneda
  cliente: ClienteConfig
  base: 'presencia' | 'negocio' | null
  lineas: LineaConfig[]
  /** Versión que se propone por defecto. */
  version: NivelVersion
  /** Inclusiones o exclusiones puntuales por línea, por encima de la versión (las decide el cliente con perillas). */
  ajustesLineas: Record<string, boolean>
  planPago: TipoPlan
  numCuotas: number
  /** Día de firma e inicio, 'YYYY-MM-DD'. */
  fechaInicio: string
  /** Lo que NO incluye, en frases cortas. */
  exclusiones: string[]
  clausulasDesactivadas: string[]
  contacto: MapaContacto
  perillas: PerillasConfig
}

export type LineaCalculada = {
  id: string
  nombre: string
  /** Qué cuenta como una unidad, si el componente se cobra por unidad. */
  unidad?: string
  cantidad: number
  prioridad: Prioridad
  incluida: boolean
  /** Horas de la tabla (sin colchón) con el rango ya cerrado por las respuestas. */
  horas: Rango
  /** Horas del rango entero de la tabla, para dibujar cuánto se cerró. */
  horasTabla: Rango
  preguntasRespondidas: number
  preguntasTotal: number
  cita?: string
  razon?: string
}

export type VersionCalculada = {
  nivel: NivelVersion
  /** Precio que se le ofrece al cliente (el techo del rango). */
  precio: number
  rango: Rango
  horas: Rango
  lineas: string[]
  /** Nombres de lo que esta versión deja fuera respecto de la completa. */
  sinIncluir: string[]
  /** true si es idéntica a la versión anterior (no vale la pena mostrarla). */
  repetida: boolean
}

export type HitoCalculado = { id: HitoId; nombre: string; entregable: string; fecha: string; horasAcumuladas: number }

/** Todo lo calculado de una propuesta. Es lo que se congela en cada versión. */
export type Snapshot = {
  /** Versión del formato, por si cambia la forma del snapshot. */
  formato: 1
  generadoEl: string
  titulo: string
  resumen: string
  moneda: Moneda
  cliente: ClienteConfig
  base: { id: 'presencia' | 'negocio'; nombre: string; precio: number } | null
  lineas: LineaCalculada[]
  version: NivelVersion
  versiones: VersionCalculada[]
  /** Precio que se ofrece (techo del rango de la versión elegida). */
  precio: number
  rango: Rango
  /** Horas con colchón. */
  horas: Rango
  colchonPct: number
  tarifaHora: number
  aplicoMinimo: boolean
  /** 0 a 1: cuánto se cerró el rango con las respuestas. */
  certeza: number
  hitos: HitoCalculado[]
  plan: PlanPago
  opcionesPlan: { cuotas: boolean; contado: boolean; maxCuotas: number }
  clausulas: ClausulaRenderizada[]
  contacto: MapaContacto
  exclusiones: string[]
  perillas: PerillasConfig
  validoHasta: string
  /** Toda cifra de dinero que la propuesta permite mencionar (para la guardia de la IA). */
  cifras: number[]
}

/** Lo que el cliente puede cambiar desde su enlace. Todo opcional. */
export type EleccionCliente = {
  version?: NivelVersion
  planPago?: TipoPlan
  numCuotas?: number
  lineas?: Record<string, boolean>
}
