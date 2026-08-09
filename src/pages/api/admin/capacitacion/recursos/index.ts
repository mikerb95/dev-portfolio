import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { trainingResources } from '../../../../../db/schema'
import { listarRecursos } from '../../../../../lib/capacitacion/repo'
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

/**
 * Slug libre a partir del título. Se reintenta con sufijo numérico en vez de
 * devolver un error: el slug es un detalle de la URL y hacer que el admin
 * resuelva a mano una colisión que la máquina puede resolver sola es fricción
 * sin ganancia.
 */
async function slugLibre(base: string): Promise<string> {
  const raiz = slugify(base) || 'recurso'
  for (let i = 0; i < 50; i++) {
    const intento = i === 0 ? raiz : `${raiz}-${i + 1}`
    const [existe] = await db
      .select({ id: trainingResources.id })
      .from(trainingResources)
      .where(eq(trainingResources.slug, intento))
      .limit(1)
    if (!existe) return intento
  }
  return `${raiz}-${Date.now()}`
}

export const GET: APIRoute = async () =>
  json(200, await listarRecursos({ incluirBorradores: true, conPase: true }))

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData()

  const title = texto(form.get('title'))
  if (!title) return json(400, { error: 'el título es obligatorio' })

  const kind = String(form.get('kind') ?? 'guia')
  if (!esTipoRecurso(kind)) return json(400, { error: 'tipo de recurso desconocido' })

  const level = String(form.get('level') ?? 'intro')
  if (!esNivel(level)) return json(400, { error: 'nivel desconocido' })

  const visibility = String(form.get('visibility') ?? 'borrador')
  if (!esVisibilidad(visibility)) return json(400, { error: 'visibilidad desconocida' })

  const now = new Date()
  const slug = texto(form.get('slug'))
  const [creado] = await db
    .insert(trainingResources)
    .values({
      slug: await slugLibre(slug ?? title),
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
      sortOrder: numero(form.get('sortOrder')) ?? 0,
      // Publicado es el momento en que deja de ser borrador, no el de creación:
      // es la fecha que ve la gente y la que ordena el banco.
      publishedAt: visibility === 'borrador' ? null : now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return json(201, creado)
}
