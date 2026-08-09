import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { trainingResources } from '../../../../../db/schema'
import {
  esNivel,
  esTipoRecurso,
  esVisibilidad,
  serializarLista,
  slugify,
} from '../../../../../lib/capacitacion/tipos'

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
    .from(trainingResources)
    .where(eq(trainingResources.id, id))
    .limit(1)
  if (!actual) return json(404, { error: 'recurso no encontrado' })

  const form = await request.formData()

  const title = texto(form.get('title'))
  if (!title) return json(400, { error: 'el título es obligatorio' })

  const kind = String(form.get('kind') ?? actual.kind)
  if (!esTipoRecurso(kind)) return json(400, { error: 'tipo de recurso desconocido' })

  const level = String(form.get('level') ?? actual.level)
  if (!esNivel(level)) return json(400, { error: 'nivel desconocido' })

  const visibility = String(form.get('visibility') ?? actual.visibility)
  if (!esVisibilidad(visibility)) return json(400, { error: 'visibilidad desconocida' })

  const slugPedido = texto(form.get('slug'))
  const slug = slugPedido ? slugify(slugPedido) : actual.slug
  if (slug !== actual.slug) {
    const [choque] = await db
      .select({ id: trainingResources.id })
      .from(trainingResources)
      .where(eq(trainingResources.slug, slug))
      .limit(1)
    // Aquí sí se rechaza en vez de inventar un sufijo: cambiar el slug es una
    // decisión explícita del admin sobre una URL que puede estar compartida, y
    // resolverla en silencio publicaría una distinta de la que pidió.
    if (choque && choque.id !== id) return json(409, { error: 'ya hay un recurso con ese slug' })
  }

  const [guardado] = await db
    .update(trainingResources)
    .set({
      slug,
      title,
      summary: texto(form.get('summary')),
      kind,
      level,
      visibility,
      body: texto(form.get('body')),
      externalUrl: texto(form.get('externalUrl')),
      fileUrl: texto(form.get('fileUrl')),
      deckId: numero(form.get('deckId')),
      programId: numero(form.get('programId')),
      topics: serializarLista(texto(form.get('topics'))),
      sortOrder: numero(form.get('sortOrder')) ?? actual.sortOrder,
      // La fecha de publicación se fija la primera vez que sale de borrador y
      // no se toca más: republicar no debe reordenar el banco ni mentir sobre
      // cuándo se publicó. Volver a borrador la borra.
      publishedAt:
        visibility === 'borrador' ? null : (actual.publishedAt ?? new Date()),
      updatedAt: new Date(),
    })
    .where(eq(trainingResources.id, id))
    .returning()

  return json(200, guardado)
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json(400, { error: 'id inválido' })
  await db.delete(trainingResources).where(eq(trainingResources.id, id))
  return json(200, { ok: true })
}
