// Tipos y normalización para interacciones (seguimiento/CRM).

export const INTERACTION_TYPES = ['call', 'meeting', 'email', 'whatsapp', 'note', 'task', 'other'] as const
export type InteractionType = (typeof INTERACTION_TYPES)[number]

export const TYPE_LABELS: Record<InteractionType, string> = {
  call: 'Llamada', meeting: 'Reunión', email: 'Email', whatsapp: 'WhatsApp',
  note: 'Nota', task: 'Tarea', other: 'Otro',
}

// Iconos (path d) por tipo — estilo lucide, una sola path por simplicidad
export const TYPE_ICONS: Record<InteractionType, string> = {
  call: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  meeting: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-.001 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  email: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  whatsapp: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  task: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  other: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 16v-4 M12 8h.01',
}

const toDate = (v: unknown): Date | null => {
  if (!v) return null
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Normaliza el body de una interacción para insert/update.
 * En `forInsert` rellena occurredAt/done por defecto.
 * Gestiona doneAt según el flag done.
 */
export function normalizeInteractionInput(
  body: Record<string, any>,
  { forInsert }: { forInsert: boolean },
): Record<string, unknown> {
  const v: Record<string, unknown> = {}
  const setIf = (k: string, val: unknown) => { if (body[k] !== undefined) v[k] = val }

  if (body.type !== undefined) {
    v.type = INTERACTION_TYPES.includes(body.type) ? body.type : 'note'
  } else if (forInsert) {
    v.type = 'note'
  }
  if (body.clientId !== undefined) v.clientId = body.clientId ? Number(body.clientId) : null
  if (body.projectId !== undefined) v.projectId = body.projectId ? Number(body.projectId) : null
  setIf('title', typeof body.title === 'string' ? body.title.trim() : body.title)
  setIf('body', body.body?.trim?.() || null)
  setIf('nextAction', body.nextAction?.trim?.() || null)

  if (body.occurredAt !== undefined) v.occurredAt = toDate(body.occurredAt) ?? new Date()
  else if (forInsert) v.occurredAt = new Date()

  if (body.dueDate !== undefined) v.dueDate = toDate(body.dueDate)

  if (body.done !== undefined) {
    const done = !!body.done
    v.done = done
    v.doneAt = done ? (toDate(body.doneAt) ?? new Date()) : null
  } else if (forInsert) {
    v.done = false
    v.doneAt = null
  }
  return v
}
