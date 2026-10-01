// Recolección y guardado del resumen semanal. Solo servidor.
//
// Cada sección se lee por separado con safeQuery: si una tabla no responde, esa
// cifra sale en cero y el resumen se manda igual. Un resumen al que le falta
// un dato es útil; uno que no llega, no.
//
// Costo en Turso (factura filas escaneadas): todo va por índices de fecha y
// sobre una semana. monitor_daily ya viene agregado por día; web_vitals queda
// fuera a propósito porque no tiene rollup y escanearla una semana es caro.
import { and, desc, eq, gte, isNull, lt, notInArray, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { db } from '../db'
import { analistaEjecuciones, appSettings, blockedIps, ciRuns, cronRuns, monitorDaily, monitorIncidents, monitors, securityEvents } from '../db/schema'
import { safeQuery } from './safe-query'
import { AUDIT_CATEGORIES } from './security/audit'
import { agregarAlHistorial, parsearHistorial, type DatosSemana, type Resumen } from './resumen-semanal'

export const CLAVE_HISTORIAL = 'resumen_semanal'

export async function recolectar(v: { desde: string; hasta: string; inicio: Date; fin: Date }): Promise<DatosSemana> {
  const enVentana = (col: SQLiteColumn) => and(gte(col, v.inicio), lt(col, v.fin))

  const [uptime, caidas, incidentes, abiertos, seguridad, categorias, bloqueos, crons, conFallo, ci, analista] = await Promise.all([
    safeQuery(
      () =>
        db
          .select({ id: monitors.id, nombre: monitors.name, total: sql<number>`sum(${monitorDaily.total})`, ok: sql<number>`sum(${monitorDaily.ok})` })
          .from(monitorDaily)
          .innerJoin(monitors, eq(monitors.id, monitorDaily.monitorId))
          .where(and(gte(monitorDaily.day, v.desde), sql`${monitorDaily.day} <= ${v.hasta}`))
          .groupBy(monitors.id, monitors.name),
      [],
      'resumen-semanal uptime'
    ),
    safeQuery(
      () =>
        db
          .select({ id: monitorIncidents.monitorId, n: sql<number>`count(*)` })
          .from(monitorIncidents)
          .where(enVentana(monitorIncidents.startedAt))
          .groupBy(monitorIncidents.monitorId),
      [],
      'resumen-semanal caidas'
    ),
    safeQuery(
      () =>
        db
          .select({ total: sql<number>`count(*)`, segundos: sql<number>`coalesce(sum(${monitorIncidents.durationSec}), 0)` })
          .from(monitorIncidents)
          .where(enVentana(monitorIncidents.startedAt)),
      [],
      'resumen-semanal incidentes'
    ),
    safeQuery(
      () => db.select({ n: sql<number>`count(*)` }).from(monitorIncidents).where(isNull(monitorIncidents.resolvedAt)),
      [],
      'resumen-semanal abiertos'
    ),
    safeQuery(
      () =>
        db
          .select({ hits: sql<number>`coalesce(sum(${securityEvents.hits}), 0)`, origenes: sql<number>`count(distinct ${securityEvents.ip})` })
          .from(securityEvents)
          .where(and(enVentana(securityEvents.at), notInArray(securityEvents.category, AUDIT_CATEGORIES))),
      [],
      'resumen-semanal seguridad'
    ),
    safeQuery(
      () =>
        db
          .select({ categoria: securityEvents.category, hits: sql<number>`sum(${securityEvents.hits})` })
          .from(securityEvents)
          .where(and(enVentana(securityEvents.at), notInArray(securityEvents.category, AUDIT_CATEGORIES)))
          .groupBy(securityEvents.category)
          .orderBy(desc(sql`sum(${securityEvents.hits})`))
          .limit(10),
      [],
      'resumen-semanal categorias'
    ),
    safeQuery(() => db.select({ n: sql<number>`count(*)` }).from(blockedIps).where(enVentana(blockedIps.createdAt)), [], 'resumen-semanal bloqueos'),
    safeQuery(
      () =>
        db
          .select({ total: sql<number>`count(*)`, fallos: sql<number>`sum(case when ${cronRuns.ok} then 0 else 1 end)` })
          .from(cronRuns)
          .where(enVentana(cronRuns.createdAt)),
      [],
      'resumen-semanal crons'
    ),
    safeQuery(
      () =>
        db
          .selectDistinct({ job: cronRuns.job })
          .from(cronRuns)
          .where(and(enVentana(cronRuns.createdAt), eq(cronRuns.ok, false))),
      [],
      'resumen-semanal crons con fallo'
    ),
    safeQuery(
      () =>
        db
          .select({ conclusion: ciRuns.conclusion, n: sql<number>`count(*)` })
          .from(ciRuns)
          .where(enVentana(ciRuns.createdAt))
          .groupBy(ciRuns.conclusion),
      [],
      'resumen-semanal ci'
    ),
    safeQuery(
      () =>
        db
          .select({ n: sql<number>`count(*)`, costo: sql<number>`coalesce(sum(${analistaEjecuciones.costoUsd}), 0)` })
          .from(analistaEjecuciones)
          .where(enVentana(analistaEjecuciones.creada)),
      [],
      'resumen-semanal analista'
    ),
  ])

  const caidasPor = new Map(caidas.map((c) => [c.id, Number(c.n)]))
  const ciPor = new Map(ci.map((c) => [c.conclusion, Number(c.n)]))
  return {
    desde: v.desde,
    hasta: v.hasta,
    uptime: uptime
      .filter((u) => Number(u.total) > 0)
      .map((u) => ({ nombre: u.nombre, pct: (Number(u.ok) / Number(u.total)) * 100, caidas: caidasPor.get(u.id) ?? 0 })),
    incidentes: {
      total: Number(incidentes[0]?.total ?? 0),
      minutos: Math.round(Number(incidentes[0]?.segundos ?? 0) / 60),
      abiertos: Number(abiertos[0]?.n ?? 0),
    },
    seguridad: {
      intentos: Number(seguridad[0]?.hits ?? 0),
      origenes: Number(seguridad[0]?.origenes ?? 0),
      porCategoria: categorias.map((c) => ({ categoria: c.categoria, intentos: Number(c.hits) })),
      bloqueos: Number(bloqueos[0]?.n ?? 0),
    },
    crons: { corridas: Number(crons[0]?.total ?? 0), fallos: Number(crons[0]?.fallos ?? 0), conFallo: conFallo.map((c) => c.job) },
    ci: {
      corridas: [...ciPor.values()].reduce((s, n) => s + n, 0),
      fallidas: ciPor.get('failure') ?? 0,
      revertidas: ciPor.get('rolled_back') ?? 0,
    },
    analista: { analisis: Number(analista[0]?.n ?? 0), costoUsd: Number(analista[0]?.costo ?? 0) },
  }
}

export async function leerHistorial(): Promise<Resumen[]> {
  const [fila] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, CLAVE_HISTORIAL)).limit(1)
  return parsearHistorial(fila?.value)
}

export async function guardarResumen(r: Resumen): Promise<void> {
  const valor = JSON.stringify(agregarAlHistorial(await leerHistorial().catch(() => []), r))
  const ahora = new Date()
  await db
    .insert(appSettings)
    .values({ key: CLAVE_HISTORIAL, value: valor, updatedAt: ahora })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: valor, updatedAt: ahora } })
}
