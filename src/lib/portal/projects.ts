// Datos de proyecto para el portal: hitos, avance y salud del servicio.
//
// TODA función de este módulo recibe `clientId` y filtra por él. No es
// redundante con el gate de sesión: el gate dice "hay sesión", esto dice "y los
// datos son suyos". Sin lo segundo, /portal/proyecto/42 mostraría el proyecto
// de otro a un cliente perfectamente autenticado.
//
// La salud del servicio (uptime real, latencia, incidentes) sale de los mismos
// monitores que alimentan /status. Que el cliente vea el uptime de SU proyecto
// medido de verdad es lo que separa esto de un tablero de marketing.

import { and, avg, count, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { monitorChecks, monitorIncidents, monitors, projectMilestones, projects } from '../../db/schema'

export type Milestone = typeof projectMilestones.$inferSelect

/** Proyectos visibles del cliente, ordenados: los activos primero. */
export async function clientProjects(clientId: number) {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      description: projects.description,
      status: projects.status,
      techStack: projects.techStack,
      previewUrl: projects.previewUrl,
      startDate: projects.startDate,
      endDate: projects.endDate,
    })
    .from(projects)
    .where(eq(projects.clientId, clientId))
    .orderBy(desc(projects.startDate))

  const order = { activo: 0, pausado: 1, completado: 2, archivado: 3 } as const
  return rows.sort((a, b) => (order[a.status ?? 'activo'] ?? 9) - (order[b.status ?? 'activo'] ?? 9))
}

/**
 * Hitos que el cliente puede ver de un proyecto suyo.
 *
 * El `clientId` entra en el WHERE aunque ya tengamos el `projectId`: así, pedir
 * los hitos de un proyecto ajeno devuelve vacío en vez de datos de otro.
 */
export async function projectMilestonesFor(clientId: number, projectId: number): Promise<Milestone[]> {
  return db
    .select({
      id: projectMilestones.id,
      projectId: projectMilestones.projectId,
      title: projectMilestones.title,
      description: projectMilestones.description,
      status: projectMilestones.status,
      dueAt: projectMilestones.dueAt,
      completedAt: projectMilestones.completedAt,
      visibleToClient: projectMilestones.visibleToClient,
      sortOrder: projectMilestones.sortOrder,
      createdAt: projectMilestones.createdAt,
    })
    .from(projectMilestones)
    .innerJoin(projects, eq(projectMilestones.projectId, projects.id))
    .where(
      and(
        eq(projectMilestones.projectId, projectId),
        eq(projects.clientId, clientId),
        eq(projectMilestones.visibleToClient, true)
      )
    )
    .orderBy(projectMilestones.sortOrder, projectMilestones.id)
}

export type Progress = { total: number; done: number; pct: number; next: Milestone | null }

/**
 * Avance del proyecto según sus hitos. Puro: la regla de qué cuenta como
 * "avance" es una decisión de producto y merece test propio.
 *
 * Un hito en curso cuenta como medio: sin eso, un proyecto de 4 hitos donde
 * llevo 3 semanas trabajando en el segundo muestra 25% y parece abandonado.
 */
export function computeProgress(milestones: Milestone[]): Progress {
  const total = milestones.length
  if (!total) return { total: 0, done: 0, pct: 0, next: null }

  const done = milestones.filter((m) => m.status === 'completado').length
  const inProgress = milestones.filter((m) => m.status === 'en_curso').length
  const pct = Math.round(((done + inProgress * 0.5) / total) * 100)

  // El "próximo" es el primero en curso; si no hay ninguno, el primero pendiente.
  const next = milestones.find((m) => m.status === 'en_curso') ?? milestones.find((m) => m.status === 'pendiente') ?? null

  return { total, done, pct, next }
}

export type ServiceHealth = {
  monitorCount: number
  uptimePct: number | null
  avgLatencyMs: number | null
  status: 'up' | 'degraded' | 'down' | 'unknown'
  openIncidents: number
  lastCheckedAt: Date | null
}

const UPTIME_WINDOW_DAYS = 30

/**
 * Salud agregada de los monitores de un proyecto en los últimos 30 días.
 * Devuelve null en las métricas si el proyecto no tiene monitores: mejor no
 * mostrar la tarjeta que inventar un 100% que nadie midió.
 */
export async function projectHealth(clientId: number, projectId: number): Promise<ServiceHealth> {
  const empty: ServiceHealth = {
    monitorCount: 0,
    uptimePct: null,
    avgLatencyMs: null,
    status: 'unknown',
    openIncidents: 0,
    lastCheckedAt: null,
  }

  const rows = await db
    .select({ id: monitors.id, lastStatus: monitors.lastStatus, lastCheckedAt: monitors.lastCheckedAt })
    .from(monitors)
    .innerJoin(projects, eq(monitors.projectId, projects.id))
    .where(and(eq(monitors.projectId, projectId), eq(projects.clientId, clientId), eq(monitors.active, true)))

  if (!rows.length) return empty

  const ids = rows.map((r) => r.id)
  const since = new Date(Date.now() - UPTIME_WINDOW_DAYS * 86_400_000)

  // Uptime = éxitos / total, la misma definición que usan /status y los SLOs
  // (ver src/lib/slo.ts). Que el cliente vea aquí un número distinto del que
  // publico sería peor que no mostrarlo.
  const [checks] = await db
    .select({
      total: count(),
      up: sql<number>`sum(case when ${monitorChecks.ok} then 1 else 0 end)`,
      latency: avg(monitorChecks.responseMs),
    })
    .from(monitorChecks)
    .where(and(inArray(monitorChecks.monitorId, ids), gte(monitorChecks.at, since)))

  const [incidents] = await db
    .select({ n: count() })
    .from(monitorIncidents)
    .where(and(inArray(monitorIncidents.monitorId, ids), sql`${monitorIncidents.resolvedAt} is null`))

  // El peor monitor manda: con cinco servicios y uno caído, el proyecto NO está
  // "arriba" — está caído para el usuario que necesita ese uno.
  const worst = rows.some((r) => r.lastStatus === 'down')
    ? 'down'
    : rows.some((r) => r.lastStatus === 'degraded')
      ? 'degraded'
      : rows.every((r) => r.lastStatus === 'up')
        ? 'up'
        : 'unknown'

  const total = Number(checks?.total ?? 0)
  const lastChecked = rows
    .map((r) => r.lastCheckedAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return {
    monitorCount: rows.length,
    uptimePct: total > 0 ? Math.round((Number(checks.up ?? 0) / total) * 1000) / 10 : null,
    avgLatencyMs: checks?.latency != null ? Math.round(Number(checks.latency)) : null,
    status: worst,
    openIncidents: Number(incidents?.n ?? 0),
    lastCheckedAt: lastChecked ?? null,
  }
}

export const MILESTONE_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  completado: 'Completado',
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  activo: 'Activo',
  pausado: 'En pausa',
  completado: 'Completado',
  archivado: 'Archivado',
}
