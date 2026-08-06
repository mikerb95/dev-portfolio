// Biblioteca de decks: la parte persistente de la feature. Un deck es UN
// archivo HTML autónomo; aquí se guarda el archivo en Blob y el índice de sus
// slides (rótulo + notas) en Turso.
//
// La duplicación es deliberada: las notas están en el HTML y también en la
// base. El control remoto no carga el iframe (es un celular, y cargar el deck
// entero para leer un atributo sería absurdo), así que necesita las notas
// servidas desde la base. La base se reescribe entera cada vez que se
// reemplaza el archivo — el HTML es la fuente de verdad, esto es un índice.

import { desc, eq } from 'drizzle-orm'
import { del as blobDel, get as blobGet, put as blobPut } from '@vercel/blob'
import { db } from '../../db'
import { deckSlides, decks } from '../../db/schema'
import { parseDeck, DeckParseError } from './deck-parse'

/** 8 MB. Un deck autónomo con imágenes en base64 cabe de sobra; un vídeo no. */
export const MAX_DECK_BYTES = 8 * 1024 * 1024

export class DeckError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'DeckError'
  }
}

const blobPathFor = (title: string) =>
  `decks/${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'deck'}.html`

function assertHtml(file: File): void {
  if (!file || typeof file.size !== 'number') throw new DeckError('falta el archivo del deck')
  if (file.size === 0) throw new DeckError('el archivo está vacío')
  if (file.size > MAX_DECK_BYTES) {
    throw new DeckError(`el archivo supera ${Math.round(MAX_DECK_BYTES / 1024 / 1024)} MB`)
  }
  const name = (file.name ?? '').toLowerCase()
  if (!name.endsWith('.html') && !name.endsWith('.htm')) {
    throw new DeckError('el deck debe ser un archivo .html')
  }
}

/**
 * Sube el archivo, lo parsea y devuelve lo necesario para guardar. El parseo va
 * ANTES de escribir en Blob: un HTML sin `<deck-stage>` se rechaza sin dejar
 * basura en el almacén.
 */
async function ingestFile(file: File, title: string) {
  assertHtml(file)
  const html = await file.text()

  let parsed
  try {
    parsed = parseDeck(html)
  } catch (err) {
    if (err instanceof DeckParseError) throw new DeckError(err.message)
    throw err
  }

  // Privado a propósito: el deck se sirve por /decks/<id>.html, que es mismo
  // origen (requisito del control por DOM) y pasa por nuestros headers. Un blob
  // público sería una segunda URL del mismo contenido, fuera de todo control.
  const blob = await blobPut(blobPathFor(title), html, {
    access: 'private',
    contentType: 'text/html; charset=utf-8',
    addRandomSuffix: true,
  })

  return { blob, parsed, size: file.size }
}

async function writeSlides(deckId: number, slides: { idx: number; label: string | null; speakerNotes: string | null }[]) {
  await db.delete(deckSlides).where(eq(deckSlides.deckId, deckId))
  if (slides.length === 0) return
  await db.insert(deckSlides).values(
    slides.map((s) => ({ deckId, idx: s.idx, label: s.label, speakerNotes: s.speakerNotes }))
  )
}

export async function createDeck(input: {
  title: string
  description: string | null
  file: File
}) {
  const title = input.title.trim()
  if (!title) throw new DeckError('el título es obligatorio')

  const { blob, parsed, size } = await ingestFile(input.file, title)
  const now = new Date()

  const [row] = await db
    .insert(decks)
    .values({
      title,
      description: input.description?.trim() || null,
      blobPath: blob.pathname,
      blobUrl: blob.url,
      fileSize: size,
      slideCount: parsed.slides.length,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  await writeSlides(row.id, parsed.slides)
  return row
}

export async function replaceDeckFile(deckId: number, file: File) {
  const deck = await getDeck(deckId)
  if (!deck) throw new DeckError('deck no encontrado', 404)

  const { blob, parsed, size } = await ingestFile(file, deck.title)

  await db
    .update(decks)
    .set({
      blobPath: blob.pathname,
      blobUrl: blob.url,
      fileSize: size,
      slideCount: parsed.slides.length,
      updatedAt: new Date(),
    })
    .where(eq(decks.id, deckId))

  await writeSlides(deckId, parsed.slides)

  // El archivo viejo se borra al final: si algo falla antes, el deck sigue
  // teniendo un HTML que servir.
  await blobDel(deck.blobUrl).catch(() => {})

  return getDeck(deckId)
}

export async function updateDeckMeta(deckId: number, meta: { title?: string; description?: string | null }) {
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof meta.title === 'string') {
    const t = meta.title.trim()
    if (!t) throw new DeckError('el título no puede quedar vacío')
    patch.title = t
  }
  if (meta.description !== undefined) {
    patch.description = meta.description?.trim() || null
  }
  await db.update(decks).set(patch).where(eq(decks.id, deckId))
  return getDeck(deckId)
}

export async function deleteDeck(deckId: number) {
  const deck = await getDeck(deckId)
  if (!deck) return
  // `deck_slides` cae por cascada; el feedback NO (referencia con set null),
  // porque lo que opinó el público sobre un deck sobrevive al deck.
  await db.delete(decks).where(eq(decks.id, deckId))
  await blobDel(deck.blobUrl).catch(() => {})
}

export async function getDeck(deckId: number) {
  if (!Number.isInteger(deckId)) return null
  const [row] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1)
  return row ?? null
}

export async function listDecks() {
  return db.select().from(decks).orderBy(desc(decks.updatedAt), desc(decks.id))
}

export type SlideNote = { idx: number; label: string | null; speakerNotes: string | null }

export async function getDeckSlides(deckId: number): Promise<SlideNote[]> {
  return db
    .select({ idx: deckSlides.idx, label: deckSlides.label, speakerNotes: deckSlides.speakerNotes })
    .from(deckSlides)
    .where(eq(deckSlides.deckId, deckId))
    .orderBy(deckSlides.idx)
}

export async function touchDeckSession(deckId: number) {
  await db.update(decks).set({ lastSessionAt: new Date() }).where(eq(decks.id, deckId))
}

/** Contenido del archivo, para servirlo desde nuestro propio origen. */
export async function readDeckHtml(deckId: number): Promise<ReadableStream | null> {
  const deck = await getDeck(deckId)
  if (!deck) return null
  try {
    const { stream } = await blobGet(deck.blobPath, { access: 'private' })
    return stream
  } catch {
    return null
  }
}
