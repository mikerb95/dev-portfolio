import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { trainingPrograms } from '../../../../../db/schema'
import { esFormato, esNivel, serializarLista, slugify } from '../../../../../lib/capacitacion/tipos'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const texto = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

const numero = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json(400, { error: 'id inválido' })

  const [actual] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, id))
    .limit(1)
  if (!actual) return json(404, { error: 'programa no encontrado' })

  const form = await request.formData()

  const title = texto(form.get('title'))
  if (!title) return json(400, { error: 'el título es obligatorio' })

  const format = String(form.get('format') ?? actual.format)
  if (!esFormato(format)) return json(400, { error: 'formato desconocido' })

  const level = String(form.get('level') ?? actual.level)
  if (!esNivel(level)) return json(400, { error: 'nivel desconocido' })

  const slugPedido = texto(form.get('slug'))
  const slug = slugPedido ? slugify(slugPedido) : actual.slug
  if (slug !== actual.slug) {
    const [choque] = await db
      .select({ id: trainingPrograms.id })
      .from(trainingPrograms)
      .where(eq(trainingPrograms.slug, slug))
      .limit(1)
    if (choque && choque.id !== id) return json(409, { error: 'ya hay un programa con ese slug' })
  }

  const [guardado] = await db
    .update(trainingPrograms)
    .set({
      slug,
      title,
      summary: texto(form.get('summary')),
      audience: texto(form.get('audience')),
      format,
      level,
      durationHours: numero(form.get('durationHours')),
      outcomes: serializarLista(texto(form.get('outcomes'))),
      modules: serializarLista(texto(form.get('modules'))),
      priceNote: texto(form.get('priceNote')),
      sortOrder: numero(form.get('sortOrder')) ?? actual.sortOrder,
      isPublic: form.get('isPublic') === 'on' || form.get('isPublic') === 'true',
      updatedAt: new Date(),
    })
    .where(eq(trainingPrograms.id, id))
    .returning()

  return json(200, guardado)
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json(400, { error: 'id inválido' })
  // Los recursos que colgaban del programa NO se borran: el FK es `set null` y
  // el material del banco sobrevive al catálogo comercial que lo agrupaba.
  await db.delete(trainingPrograms).where(eq(trainingPrograms.id, id))
  return json(200, { ok: true })
}
