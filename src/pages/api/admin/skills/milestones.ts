import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { skillMilestones } from '../../../../db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { dayKeyOf, isValidDayKey } from '../../../../lib/skills'

const STATUSES = ['pendiente', 'en_curso', 'hecho'] as const
type Status = (typeof STATUSES)[number]

export const POST: APIRoute = async ({ request }) => {
  const { trackId, area, title, description } = await request.json()
  const track = Number(trackId)
  const areaText = String(area ?? '').trim()
  const titleText = String(title ?? '').trim()

  if (!Number.isInteger(track) || !areaText || !titleText) {
    return json({ error: 'trackId, área y título son obligatorios' }, 400)
  }

  // El nuevo hito va al final de su área, sin renumerar los existentes.
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${skillMilestones.position}), 0)` })
    .from(skillMilestones)
    .where(eq(skillMilestones.trackId, track))

  const now = new Date()
  const [row] = await db
    .insert(skillMilestones)
    .values({
      trackId: track,
      area: areaText.slice(0, 80),
      title: titleText.slice(0, 200),
      description: description ? String(description).trim().slice(0, 1000) || null : null,
      position: Number(maxPos) + 1,
      status: 'pendiente',
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: skillMilestones.id })

  return json({ ok: true, id: row?.id })
}

export const PATCH: APIRoute = async ({ request }) => {
  const { id, trackId, status, evidenceUrl } = await request.json()
  const milestoneId = Number(id)
  const track = Number(trackId)

  if (!Number.isInteger(milestoneId) || !Number.isInteger(track)) {
    return json({ error: 'Parámetros inválidos' }, 400)
  }
  if (status !== undefined && !STATUSES.includes(status as Status)) {
    return json({ error: 'Estado inválido' }, 400)
  }

  // La fecha de cierre se pone al pasar a "hecho" y se limpia al salir: es la
  // que ordena los logros derivados, así que un hito reabierto no puede
  // quedarse con la fecha vieja o desbloquearía badges que ya no aplican.
  const completedOn =
    status === 'hecho' ? dayKeyOf() : status !== undefined ? null : undefined

  await db
    .update(skillMilestones)
    .set({
      ...(status !== undefined && { status: status as Status }),
      ...(completedOn !== undefined && { completedOn }),
      ...(evidenceUrl !== undefined && {
        evidenceUrl: evidenceUrl ? String(evidenceUrl).trim().slice(0, 500) || null : null,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(skillMilestones.id, milestoneId), eq(skillMilestones.trackId, track)))

  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id, trackId } = await request.json()
  const milestoneId = Number(id)
  const track = Number(trackId)
  if (!Number.isInteger(milestoneId) || !Number.isInteger(track)) {
    return json({ error: 'Parámetros inválidos' }, 400)
  }

  await db
    .delete(skillMilestones)
    .where(and(eq(skillMilestones.id, milestoneId), eq(skillMilestones.trackId, track)))

  return json({ ok: true })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
