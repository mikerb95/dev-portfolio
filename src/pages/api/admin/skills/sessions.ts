import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { skillSessions } from '../../../../db/schema'
import { and, eq } from 'drizzle-orm'
import { dayKeyOf, isValidDayKey } from '../../../../lib/skills'

const MAX_MINUTES = 16 * 60 // un día de estudio de 16 h es un dedo resbalado, no un récord

export const POST: APIRoute = async ({ request }) => {
  const { trackId, day, minutes, topic, note, milestoneId } = await request.json()

  const id = Number(trackId)
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'trackId inválido' }, 400)
  }

  // Sin fecha, hoy: el caso normal es registrar la sesión al terminarla.
  const dayKey = day ? String(day) : dayKeyOf()
  if (!isValidDayKey(dayKey)) {
    return json({ error: 'Fecha inválida, se espera YYYY-MM-DD' }, 400)
  }

  const mins = Math.round(Number(minutes))
  if (!Number.isFinite(mins) || mins <= 0 || mins > MAX_MINUTES) {
    return json({ error: `Los minutos deben estar entre 1 y ${MAX_MINUTES}` }, 400)
  }

  const topicText = String(topic ?? '').trim()
  if (!topicText) {
    return json({ error: 'El tema es obligatorio' }, 400)
  }

  const [row] = await db
    .insert(skillSessions)
    .values({
      trackId: id,
      day: dayKey,
      minutes: mins,
      topic: topicText.slice(0, 200),
      note: note ? String(note).trim().slice(0, 2000) || null : null,
      milestoneId: milestoneId ? Number(milestoneId) : null,
      createdAt: new Date(),
    })
    .returning({ id: skillSessions.id })

  return json({ ok: true, id: row?.id })
}

export const DELETE: APIRoute = async ({ request }) => {
  const { id, trackId } = await request.json()
  const sessionId = Number(id)
  const track = Number(trackId)
  if (!Number.isInteger(sessionId) || !Number.isInteger(track)) {
    return json({ error: 'Parámetros inválidos' }, 400)
  }

  // El trackId viaja en el WHERE aunque el id ya sea único: borrar la sesión
  // de otro track por un id mal copiado corrompe silenciosamente una racha.
  await db
    .delete(skillSessions)
    .where(and(eq(skillSessions.id, sessionId), eq(skillSessions.trackId, track)))

  return json({ ok: true })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
