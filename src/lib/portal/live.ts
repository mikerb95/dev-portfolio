import type { PortalRole } from './session'
import { clientProjects, computeProgress, projectHealth, projectMilestonesFor } from './projects'
import { clientInvoiceSummary } from './invoices'
import { clientThreads } from './threads'
import { unreadCount } from './notifications'

// Digest de la capa viva del portal: el objeto mínimo que el navegador sondea
// cada 20 s para saber si algo cambió. No devuelve contenido, solo contadores y
// marcas de tiempo — quien detecta un cambio pide el detalle por su ruta de
// siempre. Así el ciclo caliente del portal no arrastra cuerpos grandes ni
// duplica la lógica de ninguna vista.
//
// Cero SQL nuevo: todo sale de los helpers que ya alimentan el dashboard. Si
// mañana cambia la regla de "avance" o de "factura pendiente", cambia en un
// solo sitio y el digest la hereda.

export type PortalLiveDigest = {
  v: 1
  at: string
  notifications: { unread: number }
  threads: { unread: number; lastMessageAt: string | null }
  invoices: { pending: number; pendingCents: number; overdue: number; currency: string }
  project: {
    id: number
    /**
     * `done`/`total` viajan además del `pct` porque la tarjeta de avance escribe
     * "3 de 5 hitos completados": sin ellos el número grande se actualizaría solo
     * y el texto de debajo quedaría contradiciéndolo.
     */
    progress: { pct: number; done: number; total: number }
    /**
     * Marca de cambio de los hitos. `project_milestones` no tiene `updatedAt`,
     * así que es el máximo de `completedAt`/`createdAt`: se mueve al añadir un
     * hito y al completarlo, que son los dos eventos que el cliente espera ver
     * aparecer solos. Un cambio a `en_curso` no la mueve, pero sí mueve
     * `progressPct` (un hito en curso cuenta como medio), así que el par
     * (pct, at) cubre todo lo que el cliente percibe. Solo una corrección de
     * texto pasa inadvertida hasta la siguiente recarga, y eso es aceptable:
     * el precio de detectarla era una columna nueva y una migración.
     */
    milestonesAt: string | null
    health: {
      status: 'up' | 'degraded' | 'down' | 'unknown'
      uptimePct: number | null
      openIncidents: number
      lastCheckedAt: string | null
    } | null
  } | null
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

/** Máxima de un conjunto de fechas, ignorando nulos. null si no hay ninguna. */
const maxDate = (dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null)

export type PortalLiveParams = {
  clientId: number
  userId: number
  role: PortalRole
  /** Viene de `?p=` — SIN validar. Se valida aquí contra los proyectos del cliente. */
  requestedProjectId?: number | null
  now?: Date
}

/**
 * Estado vivo del portal para una sesión. `clientId` y `userId` salen SIEMPRE de
 * la sesión, nunca del request: es la regla que impide que un portal muestre los
 * datos de otro cliente (ver tests/portal-isolation.test.ts).
 *
 * `requestedProjectId` sí viene del request, y por eso se valida contra la lista
 * del cliente: un id ajeno cae al primer proyecto propio en vez de dar 403 —
 * igual que en `portal/index.astro`. Un 403 confirmaría que ese id existe.
 */
export async function portalLiveDigest(params: PortalLiveParams): Promise<PortalLiveDigest> {
  const { clientId, userId, role, requestedProjectId, now = new Date() } = params

  // El rol `billing` no ve mensajes en ninguna vista del portal; el digest no
  // puede ser la rendija por la que se enteren de que existen.
  const canSeeMessages = role !== 'billing'

  const projects = await clientProjects(clientId)
  const current = projects.find((p) => p.id === requestedProjectId) ?? projects[0] ?? null

  const [notifUnread, threads, invoices, milestones, health] = await Promise.all([
    unreadCount(userId),
    canSeeMessages ? clientThreads(clientId, userId) : Promise.resolve([]),
    clientInvoiceSummary(clientId, now),
    current ? projectMilestonesFor(clientId, current.id) : Promise.resolve([]),
    current ? projectHealth(clientId, current.id) : Promise.resolve(null),
  ])

  // `next` (el hito siguiente) se descarta a propósito: es un objeto entero de
  // la fila y el digest no transporta contenido, solo señales de cambio.
  const { pct, done, total } = computeProgress(milestones)

  return {
    v: 1,
    at: now.toISOString(),
    notifications: { unread: notifUnread },
    threads: {
      unread: threads.filter((t) => t.unread > 0).length,
      lastMessageAt: iso(maxDate(threads.map((t) => t.lastMessageAt))),
    },
    invoices: {
      pending: invoices.dueCount,
      pendingCents: invoices.dueCents,
      overdue: invoices.overdueCount,
      currency: invoices.currency,
    },
    project: current
      ? {
          id: current.id,
          progress: pick(computeProgress(milestones), ['pct', 'done', 'total']),
          milestonesAt: iso(maxDate(milestones.flatMap((m) => [m.completedAt, m.createdAt]))),
          health: health
            ? {
                status: health.status,
                uptimePct: health.uptimePct,
                openIncidents: health.openIncidents,
                lastCheckedAt: iso(health.lastCheckedAt),
              }
            : null,
        }
      : null,
  }
}
