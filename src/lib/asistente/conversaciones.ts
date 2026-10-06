// Persistencia de las conversaciones del asistente en el panel (tabla
// asistente_conversaciones). Mismo diseño que las ejecuciones del analista
// (lib/analista/ejecuciones.ts): la fila es el estado del bucle, y reclamarla
// es un UPDATE condicional para que dos clics no la hagan avanzar dos veces.
//
// El gasto NO se suma aquí: lo lleva el tope compartido (presupuesto.ts), que
// es el mismo que usa la terminal.
//
// Solo servidor.

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { asistenteConversaciones } from '../../db/schema'
import type { Ejecucion, EstadoEjecucion } from '../analista/bucle'
import { contarTurnos } from './turnos'

type Fila = typeof asistenteConversaciones.$inferSelect

const DIA_MS = 86_400_000
export const RETENCION_DIAS = 30
/** Una conversación larga encarece cada pregunta nueva (se reenvía todo): a partir de aquí, otra. */
export const MAX_TURNOS = 12

function aEjecucion(f: Fila): Ejecucion {
  return {
    id: f.id,
    estado: f.estado,
    pregunta: f.pregunta,
    mensajes: JSON.parse(f.mensajes),
    // El asistente no seudonimiza: no maneja IPs, y los datos personales ya
    // salen limpios de cada herramienta.
    seudonimos: {},
    propuesta: f.propuesta ? JSON.parse(f.propuesta) : null,
    respuesta: f.respuesta,
    error: f.error,
    iteraciones: f.iteraciones,
    uso: {
      entrada: f.tokensEntrada,
      salida: f.tokensSalida,
      cacheLectura: f.tokensCacheLectura,
      cacheEscritura: f.tokensCacheEscritura,
    },
    costoUsd: f.costoUsd,
  }
}

function aFila(e: Ejecucion, ahora: Date) {
  return {
    estado: e.estado,
    pregunta: e.pregunta,
    mensajes: JSON.stringify(e.mensajes),
    propuesta: e.propuesta ? JSON.stringify(e.propuesta) : null,
    respuesta: e.respuesta,
    error: e.error,
    turnos: contarTurnos(e.mensajes as never),
    iteraciones: e.iteraciones,
    tokensEntrada: e.uso.entrada,
    tokensSalida: e.uso.salida,
    tokensCacheLectura: e.uso.cacheLectura,
    tokensCacheEscritura: e.uso.cacheEscritura,
    costoUsd: e.costoUsd,
    actualizada: ahora,
  }
}

export async function crearConversacion(e: Ejecucion, ahora = new Date()): Promise<void> {
  await db.insert(asistenteConversaciones).values({ id: e.id, creada: ahora, ...aFila(e, ahora) })
}

export async function guardarConversacion(e: Ejecucion, ahora = new Date()): Promise<void> {
  await db.update(asistenteConversaciones).set(aFila(e, ahora)).where(eq(asistenteConversaciones.id, e.id))
}

export async function obtenerConversacion(id: string): Promise<Ejecucion | null> {
  const [f] = await db.select().from(asistenteConversaciones).where(eq(asistenteConversaciones.id, id)).limit(1)
  return f ? aEjecucion(f) : null
}

/**
 * Toma una conversación para hacerla avanzar, de forma atómica: solo prospera
 * si sigue en uno de los estados `desde`. Dos pestañas no pueden decidir la
 * misma propuesta ni mandar dos preguntas encima de la misma respuesta.
 */
export async function reclamar(id: string, desde: EstadoEjecucion[], ahora = new Date()): Promise<Ejecucion | null> {
  const [f] = await db
    .update(asistenteConversaciones)
    .set({ estado: 'corriendo', actualizada: ahora })
    .where(and(eq(asistenteConversaciones.id, id), inArray(asistenteConversaciones.estado, desde)))
    .returning()
  return f ? aEjecucion(f) : null
}

export type ConversacionReciente = {
  id: string
  pregunta: string
  estado: EstadoEjecucion
  actualizada: Date
  turnos: number
  /** Hay una escritura esperando el "Aprobar". */
  pendiente: boolean
}

export async function listarRecientes(limite = 6): Promise<ConversacionReciente[]> {
  const filas = await db
    .select({
      id: asistenteConversaciones.id,
      pregunta: asistenteConversaciones.pregunta,
      estado: asistenteConversaciones.estado,
      actualizada: asistenteConversaciones.actualizada,
      turnos: asistenteConversaciones.turnos,
    })
    .from(asistenteConversaciones)
    .orderBy(desc(asistenteConversaciones.actualizada))
    .limit(limite)
  return filas.map((f) => ({ ...f, pendiente: f.estado === 'esperando_aprobacion' }))
}

/** Borra conversaciones viejas (la llama el cron de purga). Devuelve cuántas. */
export async function purgarConversaciones(ahora = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - RETENCION_DIAS * DIA_MS)
  const borradas = await db
    .delete(asistenteConversaciones)
    .where(sql`${asistenteConversaciones.creada} < ${Math.floor(limite.getTime() / 1000)}`)
    .returning({ id: asistenteConversaciones.id })
  return borradas.length
}
