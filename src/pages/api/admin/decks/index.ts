import type { APIRoute } from 'astro'
import { createDeck, DeckError, listDecks } from '../../../../lib/present/decks'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const GET: APIRoute = async () => json(200, await listDecks())

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json(400, { error: 'falta el archivo del deck' })

    const deck = await createDeck({
      title: String(form.get('title') ?? '').trim(),
      description: (form.get('description') as string | null) ?? null,
      file,
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
