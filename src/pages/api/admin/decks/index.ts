import type { APIRoute } from 'astro'
import { createDeck, DeckError, listDecks, type UploadedFile } from '../../../../lib/present/decks'

/**
 * Reconstruye la carpeta a partir del FormData.
 *
 * Las rutas viajan en un campo `paths` paralelo porque `FormData` solo conserva
 * el nombre base del archivo: `webkitRelativePath` se pierde al serializar, y
 * sin la ruta no se puede distinguir `uploads/logo.png` de `logo.png` ni
 * resolver las referencias relativas del HTML.
 */
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

export const GET: APIRoute = async () => json(200, await listDecks())

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData()
    const files = collectFiles(form)
    if (files.length === 0) return json(400, { error: 'falta el archivo del deck' })

    const deck = await createDeck({
      title: String(form.get('title') ?? '').trim(),
      description: (form.get('description') as string | null) ?? null,
      files,
    })
    return json(201, deck)
  } catch (err) {
    if (err instanceof DeckError) return json(err.status, { error: err.message })
    // El mensaje real puede traer detalles del almacén de blobs; al cliente le
    // basta con saber que no se subió.
    console.error('[decks] alta fallida', err)
    return json(500, { error: 'no se pudo subir el deck' })
  }
}
