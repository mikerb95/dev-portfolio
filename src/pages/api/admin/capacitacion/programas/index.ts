import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { trainingPrograms } from '../../../../../db/schema'
import { listarProgramas } from '../../../../../lib/capacitacion/repo'
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

async function slugLibre(base: string): Promise<string> {
  const raiz = slugify(base) || 'programa'
  for (let i = 0; i < 50; i++) {
    const intento = i === 0 ? raiz : `${raiz}-${i + 1}`
    const [existe] = await db
      .select({ id: trainingPrograms.id })
      .from(trainingPrograms)
      .where(eq(trainingPrograms.slug, intento))
      .limit(1)
    if (!existe) return intento
  }
  return `${raiz}-${Date.now()}`
}

export const GET: APIRoute = async () => json(200, await listarProgramas())

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData()

  const title = texto(form.get('title'))
  if (!title) return json(400, { error: 'el título es obligatorio' })

  const format = String(form.get('format') ?? 'taller')
  if (!esFormato(format)) return json(400, { error: 'formato desconocido' })

  const level = String(form.get('level') ?? 'intro')
  if (!esNivel(level)) return json(400, { error: 'nivel desconocido' })

  const now = new Date()
  const [creado] = await db
    .insert(trainingPrograms)
    .values({
      slug: await slugLibre(texto(form.get('slug')) ?? title),
      title,
      summary: texto(form.get('summary')),
      audience: texto(form.get('audience')),
      format,
      level,
      durationHours: numero(form.get('durationHours')),
      outcomes: serializarLista(texto(form.get('outcomes'))),
      modules: serializarLista(texto(form.get('modules'))),
      priceNote: texto(form.get('priceNote')),
      sortOrder: numero(form.get('sortOrder')) ?? 0,
      isPublic: form.get('isPublic') === 'on' || form.get('isPublic') === 'true',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return json(201, creado)
}
