// Persistencia de las ejecuciones del analista (tabla analista_ejecuciones) y
// el tope de gasto diario. Solo servidor.

import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../../db'
import { analistaEjecuciones } from '../../db/schema'
import { serverEnv } from '../env'
import type { Ejecucion, EstadoEjecucion } from './bucle'

type Fila = typeof analistaEjecuciones.$inferSelect

const DIA_MS = 86_400_000
/** Una ejecución `corriendo` sin actividad en este tiempo se da por muerta (la función expiró). */
export const EN_CURSO_MS = 5 * 60_000
export const RETENCION_DIAS = 30

/** Tope diario en USD (`ANALISTA_TOPE_DIARIO_USD`, por defecto 3). */
export function topeDiarioUsd(): number {
  const n = Number(serverEnv('ANALISTA_TOPE_DIARIO_USD'))
  return Number.isFinite(n) && n >= 0 ? n : 3
}

function aEjecucion(f: Fila): Ejecucion {
  return {
    id: f.id,
    estado: f.estado,
    pregunta: f.pregunta,
    mensajes: JSON.parse(f.mensajes),
    seudonimos: JSON.parse(f.seudonimos),
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
    seudonimos: JSON.stringify(e.seudonimos),
    propuesta: e.propuesta ? JSON.stringify(e.propuesta) : null,
    respuesta: e.respuesta,
    error: e.error,
    iteraciones: e.iteraciones,
    tokensEntrada: e.uso.entrada,
    tokensSalida: e.uso.salida,
    tokensCacheLectura: e.uso.cacheLectura,
    tokensCacheEscritura: e.uso.cacheEscritura,
    costoUsd: e.costoUsd,
    actualizada: ahora,
  }
}

export async function crearEjecucion(e: Ejecucion, ahora = new Date()): Promise<void> {
  await db.insert(analistaEjecuciones).values({ id: e.id, creada: ahora, ...aFila(e, ahora) })
}

export async function guardarEjecucion(e: Ejecucion, ahora = new Date()): Promise<void> {
  await db.update(analistaEjecuciones).set(aFila(e, ahora)).where(eq(analistaEjecuciones.id, e.id))
}

export async function obtenerEjecucion(id: string): Promise<Ejecucion | null> {
  const [f] = await db.select().from(analistaEjecuciones).where(eq(analistaEjecuciones.id, id)).limit(1)
  return f ? aEjecucion(f) : null
}

/**
 * Toma la propuesta pendiente para decidirla, de forma atómica: el UPDATE
 * solo prospera si la fila sigue esperando. Dos clics (o dos pestañas) no
 * pueden decidir el mismo bloqueo dos veces; el segundo recibe null.
 */
export async function reclamarPropuesta(id: string, ahora = new Date()): Promise<Ejecucion | null> {
  const [f] = await db
    .update(analistaEjecuciones)
    .set({ estado: 'corriendo', actualizada: ahora })
    .where(and(eq(analistaEjecuciones.id, id), eq(analistaEjecuciones.estado, 'esperando_aprobacion')))
    .returning()
  return f ? aEjecucion(f) : null
}

/** Gasto de las últimas 24 h. Lanza si la base no responde: el llamador no debe gastar a ciegas. */
export async function gastoUltimas24h(ahora = new Date()): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${analistaEjecuciones.costoUsd}), 0)` })
    .from(analistaEjecuciones)
    .where(gt(analistaEjecuciones.actualizada, new Date(ahora.getTime() - DIA_MS)))
  return Number(r?.total ?? 0)
}

export async function presupuestoRestante(ahora = new Date()): Promise<number> {
  return topeDiarioUsd() - (await gastoUltimas24h(ahora))
}

/** ¿Hay un análisis vivo ahora mismo? Se permite uno a la vez. */
export async function hayEnCurso(ahora = new Date()): Promise<boolean> {
  const [f] = await db
    .select({ id: analistaEjecuciones.id })
    .from(analistaEjecuciones)
    .where(
      and(
        eq(analistaEjecuciones.estado, 'corriendo'),
        gt(analistaEjecuciones.actualizada, new Date(ahora.getTime() - EN_CURSO_MS))
      )
    )
    .limit(1)
  return !!f
}

export type ResumenEjecucion = {
  id: string
  creada: Date
  estado: EstadoEjecucion
  pregunta: string
  respuesta: string | null
  error: string | null
  costoUsd: number
  /** Origen y motivo del bloqueo pendiente, si lo hay. Nunca la IP. */
  pendiente: { origen: string; motivo: string } | null
}

/** Historial para la pantalla: sin mensajes ni seudónimos (esos no salen del servidor). */
export async function listarEjecuciones(limite = 20): Promise<ResumenEjecucion[]> {
  const filas = await db
    .select({
      id: analistaEjecuciones.id,
      creada: analistaEjecuciones.creada,
      estado: analistaEjecuciones.estado,
      pregunta: analistaEjecuciones.pregunta,
      respuesta: analistaEjecuciones.respuesta,
      error: analistaEjecuciones.error,
      costoUsd: analistaEjecuciones.costoUsd,
      propuesta: analistaEjecuciones.propuesta,
    })
    .from(analistaEjecuciones)
    .orderBy(desc(analistaEjecuciones.creada))
    .limit(limite)
  return filas.map(({ propuesta, ...f }) => {
    const p = propuesta ? (JSON.parse(propuesta) as { origen: string; motivo: string }) : null
    return { ...f, pendiente: p ? { origen: p.origen, motivo: p.motivo } : null }
  })
}

/** Borra ejecuciones viejas (la llama el cron de purga). Devuelve cuántas. */
export async function purgarEjecuciones(ahora = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - RETENCION_DIAS * DIA_MS)
  const borradas = await db
    .delete(analistaEjecuciones)
    .where(sql`${analistaEjecuciones.creada} < ${Math.floor(limite.getTime() / 1000)}`)
    .returning({ id: analistaEjecuciones.id })
  return borradas.length
}
