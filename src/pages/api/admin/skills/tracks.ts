import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { skillTracks, skillMilestones } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { dayKeyOf } from '../../../../lib/skills'
import { TRACK_SEEDS, type TrackSeed } from '../../../../data/track-dotnet'

/**
 * Crea un track. Si `seed` coincide con una plantilla conocida, siembra
 * también su temario. La siembra es IDEMPOTENTE por título: volver a
 * dispararla sobre un track existente añade los hitos nuevos de la plantilla
 * sin duplicar ni pisar el estado de los que ya se cerraron.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const seedSlug = body.seed ? String(body.seed) : null
  const seed: TrackSeed | undefined = seedSlug
    ? TRACK_SEEDS.find((t) => t.slug === seedSlug)
    : undefined

  const slug = String(body.slug ?? seed?.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!slug) return json({ error: 'slug inválido' }, 400)

  const name = String(body.name ?? seed?.name ?? slug).trim()
  const now = new Date()

  const existing = await db
    .select({ id: skillTracks.id })
    .from(skillTracks)
    .where(eq(skillTracks.slug, slug))
    .limit(1)

  let trackId: number
  if (existing.length > 0) {
    trackId = existing[0].id
  } else {
    const [row] = await db
      .insert(skillTracks)
      .values({
        slug,
        name,
        tagline: body.tagline ?? seed?.tagline ?? null,
        motivation: body.motivation ?? seed?.motivation ?? null,
        weeklyGoalMinutes: Number(body.weeklyGoalMinutes ?? seed?.weeklyGoalMinutes ?? 360),
        accent: String(body.accent ?? seed?.accent ?? 'violet'),
        startedOn: dayKeyOf(),
        isActive: true,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: skillTracks.id })
    trackId = row.id
  }

  let seeded = 0
  if (seed) {
    const already = await db
      .select({ title: skillMilestones.title })
      .from(skillMilestones)
      .where(eq(skillMilestones.trackId, trackId))
    const known = new Set(already.map((m) => m.title))

    const pending = seed.milestones.filter((m) => !known.has(m.title))
    if (pending.length > 0) {
      await db.insert(skillMilestones).values(
        pending.map((m, i) => ({
          trackId,
          area: m.area,
          title: m.title,
          description: m.description,
          position: already.length + i + 1,
          status: 'pendiente' as const,
          createdAt: now,
          updatedAt: now,
        }))
      )
      seeded = pending.length
    }
  }

  return json({ ok: true, id: trackId, slug, seeded })
}

export const PATCH: APIRoute = async ({ request }) => {
  const { id, name, tagline, motivation, weeklyGoalMinutes, accent, isActive, isPublic } =
    await request.json()
  const trackId = Number(id)
  if (!Number.isInteger(trackId)) return json({ error: 'id inválido' }, 400)

  let goal: number | undefined
  if (weeklyGoalMinutes !== undefined) {
    goal = Math.round(Number(weeklyGoalMinutes))
    // Una meta de 0 apaga la barra y hace que "meta cumplida" no signifique
    // nada; el tope de 40 h/semana evita metas que solo sirven para fallar.
    if (!Number.isFinite(goal) || goal < 30 || goal > 40 * 60) {
      return json({ error: 'La meta semanal debe estar entre 30 y 2400 minutos' }, 400)
    }
  }

  await db
    .update(skillTracks)
    .set({
      ...(name !== undefined && { name: String(name).trim().slice(0, 120) }),
      ...(tagline !== undefined && { tagline: String(tagline).trim().slice(0, 300) || null }),
      ...(motivation !== undefined && {
        motivation: String(motivation).trim().slice(0, 1000) || null,
      }),
      ...(goal !== undefined && { weeklyGoalMinutes: goal }),
      ...(accent !== undefined && { accent: String(accent) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(isPublic !== undefined && { isPublic: Boolean(isPublic) }),
      updatedAt: new Date(),
    })
    .where(eq(skillTracks.id, trackId))

  return json({ ok: true })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
