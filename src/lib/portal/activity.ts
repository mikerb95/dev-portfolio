import { and, desc, eq, lt } from 'drizzle-orm'
import { db } from '../../db'
import { portalActivity } from '../../db/schema'

// Feed de actividad del portal: el registro de "qué ha pasado en mi proyecto".
//
// Dos reglas heredadas de `recordSecurityEvent`, por las mismas razones:
//  1. **Fire-and-forget**: registrar actividad no puede tumbar la operación que
//     la generó. Si emitir la entrada falla, la factura ya se emitió igual.
//  2. **Nunca lanza**: quien llama no envuelve en try/catch ni comprueba nada.

export type ActivityType =
  | 'milestone'
  | 'invoice'
  | 'document'
  | 'message'
  | 'incident'
  | 'deploy'
  | 'system'

/** Etiquetas de cara al cliente. Aquí y no en el componente: las usa también el filtro. */
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  milestone: 'Avance',
  invoice: 'Facturación',
  document: 'Documentos',
  message: 'Mensajes',
  incident: 'Incidentes',
  deploy: 'Despliegues',
  system: 'Sistema',
}

/** ¿Es un tipo de actividad conocido? Valida lo que llega por `?tipo=`. */
export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && value in ACTIVITY_LABELS
}

export type ActivityInput = {
  clientId: number
  projectId?: number | null
  type: ActivityType
  title: string
  detail?: string | null
  href?: string | null
  /**
   * Por defecto visible. Se emite en `false` cuando algo se registra por
   * completitud del historial pero no aporta al cliente.
   */
  visibleToClient?: boolean
  at?: Date
}

/**
 * Registra una entrada del feed. No devuelve nada y no lanza: es deliberado,
 * para que ningún llamador se vea tentado a ramificar según si funcionó.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    await db.insert(portalActivity).values({
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      type: input.type,
      title: input.title,
      detail: input.detail ?? null,
      href: input.href ?? null,
      visibleToClient: input.visibleToClient ?? true,
      at: input.at ?? new Date(),
    })
  } catch {
    // Fail-open: el feed es observabilidad, no la operación.
  }
}

export type ActivityPage = {
  items: (typeof portalActivity.$inferSelect)[]
  /** Cursor para la página siguiente: `at` del último elemento. null si no hay más. */
  nextCursor: number | null
}

const PAGE_SIZE = 20

/**
 * Página del feed de un cliente. `clientId` sale SIEMPRE de la sesión, nunca del
 * request — igual que en el resto del portal.
 *
 * `projectId` sí puede venir del request: quien llama lo valida antes contra los
 * proyectos del cliente. Aun así el `WHERE` lleva el clientId además del
 * projectId: si esa validación fallara, la fila ajena tampoco saldría de aquí.
 */
export async function clientActivity(
  clientId: number,
  opts: { projectId?: number | null; type?: ActivityType | null; cursor?: number | null; limit?: number } = {}
): Promise<ActivityPage> {
  const limit = Math.min(opts.limit ?? PAGE_SIZE, 50)

  const filters = [eq(portalActivity.clientId, clientId), eq(portalActivity.visibleToClient, true)]
  if (opts.projectId) filters.push(eq(portalActivity.projectId, opts.projectId))
  if (opts.type) filters.push(eq(portalActivity.type, opts.type))
  // Paginación por cursor y no por OFFSET: con OFFSET, una entrada nueva
  // insertada entre dos páginas desplaza el corte y el usuario ve repetida la
  // última fila de la página anterior.
  if (opts.cursor) filters.push(lt(portalActivity.at, new Date(opts.cursor)))

  // Se pide uno de más para saber si hay página siguiente sin un count aparte.
  const rows = await db
    .select()
    .from(portalActivity)
    .where(and(...filters))
    .orderBy(desc(portalActivity.at), desc(portalActivity.id))
    .limit(limit + 1)

  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return {
    items,
    nextCursor: rows.length > limit && last ? last.at.getTime() : null,
  }
}

/** Marca del elemento más reciente visible del cliente. Alimenta el digest. */
export async function lastActivityAt(clientId: number): Promise<Date | null> {
  const [row] = await db
    .select({ at: portalActivity.at })
    .from(portalActivity)
    .where(and(eq(portalActivity.clientId, clientId), eq(portalActivity.visibleToClient, true)))
    .orderBy(desc(portalActivity.at))
    .limit(1)
  return row?.at ?? null
}
