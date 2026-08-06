import type { APIRoute } from 'astro'
import {
  DeckError,
  deleteDeck,
  getDeck,
  replaceDeckFile,
  updateDeckMeta,
  type UploadedFile,
} from '../../../../lib/present/decks'

/** Igual que en el alta: las rutas relativas viajan aparte (ver index.ts). */
function collectFiles(form: FormData): UploadedFile[] {
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  const paths = form.getAll('paths').map(String)
  return files.map((file, i) => ({ path: paths[i] || file.name, file }))
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const parseId = (raw: string | undefined) => {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id)
  if (!id) return json(400, { error: 'id inválido' })

  try {
    const body = (await request.json()) as { title?: string; description?: string | null }
    const deck = await updateDeckMeta(id, body)
    if (!deck) return json(404, { error: 'deck no encontrado' })
    return json(200, deck)
  } catch (err) {
    if (err instanceof DeckError) return json(err.status, { error: err.message })
    return json(500, { error: 'no se pudo actualizar el deck' })
  }
}

/** Reemplazo del archivo: mismo deck, mismo id, HTML nuevo. */
export const PUT: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id)
  if (!id) return json(400, { error: 'id inválido' })

  try {
    const form = await request.formData()
    const files = collectFiles(form)
    if (files.length === 0) return json(400, { error: 'falta el archivo del deck' })
    return json(200, await replaceDeckFile(id, files))
  } catch (err) {
    if (err instanceof DeckError) return json(err.status, { error: err.message })
    console.error('[decks] reemplazo fallido', err)
    return json(500, { error: 'no se pudo reemplazar el archivo' })
  }
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id)
  if (!id) return json(400, { error: 'id inválido' })
  if (!(await getDeck(id))) return json(404, { error: 'deck no encontrado' })
  await deleteDeck(id)
  return json(200, { ok: true })
}
