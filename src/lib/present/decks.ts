// Biblioteca de decks: la parte persistente de la feature. Aquí se guarda el
// HTML del deck en Blob y el índice de sus slides (rótulo + notas) en Turso.
//
// Un deck puede subirse como UN archivo autónomo o como la CARPETA que exporta
// Claude Design (HTML + los .js del runtime + uploads/*.png). En el segundo
// caso los assets van a Blob público y sus rutas se reescriben en el HTML, de
// forma que lo que se guarda como deck sigue siendo un único archivo servido
// desde nuestro origen. Ver `assets.ts` para el porqué.
//
// La duplicación es deliberada: las notas están en el HTML y también en la
// base. El control remoto no carga el iframe (es un celular, y cargar el deck
// entero para leer un atributo sería absurdo), así que necesita las notas
// servidas desde la base. La base se reescribe entera cada vez que se
// reemplaza el archivo - el HTML es la fuente de verdad, esto es un índice.

import { desc, eq } from 'drizzle-orm'
import { serverEnv } from '../env'
import { del as blobDel, get as blobGet, put as blobPut } from '@vercel/blob'
import { db } from '../../db'
import { deckSlides, decks } from '../../db/schema'
import { parseDeck, DeckParseError } from './deck-parse'
import { missingAssets, normalizeAssetPath, rewriteAssetUrls } from './assets'

/** 8 MB para el HTML. Sobra: el export real ronda los 100 KB. */
export const MAX_DECK_BYTES = 8 * 1024 * 1024
/** 40 MB por asset suelto y 90 MB en total, por debajo del límite de request. */
export const MAX_ASSET_BYTES = 40 * 1024 * 1024
export const MAX_BUNDLE_BYTES = 90 * 1024 * 1024

/** Un archivo de la carpeta, con su ruta relativa al HTML de entrada. */
export type UploadedFile = { path: string; file: File }

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
    throw new DeckError(`el HTML del deck supera ${Math.round(MAX_DECK_BYTES / 1024 / 1024)} MB`)
  }
}

const isHtmlName = (name: string) => /\.html?$/i.test(name ?? '')

/**
 * De todos los archivos subidos, ¿cuál es el deck?
 *
 * No se elige por nombre: el export lo llama «Data Centers Bogota.dc.html» y
 * cualquier convención que inventemos aquí se rompería con el siguiente export.
 * Se elige por CONTENIDO - el HTML que declara un deck-stage con slides. De
 * paso, eso valida el archivo antes de subir un solo byte.
 */
async function findEntry(files: UploadedFile[]) {
  const candidates = files.filter((f) => isHtmlName(f.path) || isHtmlName(f.file.name))
  if (candidates.length === 0) throw new DeckError('no hay ningún archivo .html en lo que subiste')

  let lastError: string | null = null
  for (const candidate of candidates) {
    assertHtml(candidate.file)
    const html = await candidate.file.text()
    try {
      return { entry: candidate, html, parsed: parseDeck(html) }
    } catch (err) {
      if (err instanceof DeckParseError) {
        lastError = err.message
        continue
      }
      throw err
    }
  }
  throw new DeckError(
    candidates.length === 1
      ? (lastError ?? 'el archivo no es un deck válido')
      : `ninguno de los ${candidates.length} archivos .html es un deck válido (${lastError})`
  )
}

/**
 * Sube la carpeta y devuelve lo necesario para guardar.
 *
 * El orden importa: primero se parsea (fallar aquí no deja basura en Blob),
 * después se suben los assets, y solo al final el HTML ya reescrito.
 */
async function ingestFiles(files: UploadedFile[], title: string) {
  const { entry, html, parsed } = await findEntry(files)

  const total = files.reduce((a, f) => a + f.file.size, 0)
  if (total > MAX_BUNDLE_BYTES) {
    throw new DeckError(`la carpeta pesa ${Math.round(total / 1024 / 1024)} MB; el máximo es ${Math.round(MAX_BUNDLE_BYTES / 1024 / 1024)} MB`)
  }

  // Los assets se indexan por su ruta normalizada relativa al HTML de entrada.
  const entryDir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/') + 1) : ''
  const assets = new Map<string, File>()
  for (const f of files) {
    if (f === entry) continue
    if (f.file.size === 0) continue
    if (f.file.size > MAX_ASSET_BYTES) {
      throw new DeckError(`«${f.path}» supera ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB`)
    }
    const rel = entryDir && f.path.startsWith(entryDir) ? f.path.slice(entryDir.length) : f.path
    assets.set(normalizeAssetPath(rel), f.file)
  }

  const faltan = missingAssets(html, assets.keys())
  if (faltan.length > 0) {
    // Vale la pena cortar aquí: un deck al que le falta su runtime se proyecta
    // como una pantalla negra, y descubrirlo delante del público es el fallo
    // que toda esta pantalla de subida existe para evitar.
    throw new DeckError(
      `faltan ${faltan.length} archivo(s) que el deck necesita: ${faltan.slice(0, 5).join(', ')}` +
        (faltan.length > 5 ? '…' : '') +
        '. Sube la carpeta completa, no solo el .html.'
    )
  }

  // Los assets van a Blob PÚBLICO y se sirven desde el CDN directamente al
  // navegador. Solo el documento HTML necesita ser del mismo origen (lo exige
  // `contentDocument`); una imagen o un script no.
  //
  // Store aparte, con su propio token: Vercel fija el modo de acceso POR STORE
  // y de forma irreversible, y en el store por defecto viven los backups de la
  // base y los documentos de clientes - que son privados y deben seguir
  // siéndolo. Mezclarlos obligaría a elegir entre publicar los backups o
  // proxear 30 MB de imágenes por una función en cada visita.
  const assetsToken = serverEnv('DECK_ASSETS_BLOB_READ_WRITE_TOKEN')
  if (!assetsToken && assets.size > 0) {
    throw new DeckError(
      'falta DECK_ASSETS_BLOB_READ_WRITE_TOKEN: el store público de assets no está conectado al proyecto. ' +
        'Sin él los assets acabarían en el store privado y el deck se proyectaría sin imágenes.',
      503
    )
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const urls: Record<string, string> = {}
  await Promise.all(
    [...assets].map(async ([rel, file]) => {
      const blob = await blobPut(`decks/assets/${stamp}/${rel}`, file, {
        access: 'public',
        contentType: file.type || undefined,
        addRandomSuffix: false,
        token: assetsToken,
      })
      urls[rel] = blob.url
    })
  )

  const rewritten = rewriteAssetUrls(html, urls)

  // Privado a propósito: el deck se sirve por /decks/<id>.html, que es mismo
  // origen (requisito del control por DOM) y pasa por nuestros headers. Un blob
  // público sería una segunda URL del mismo contenido, fuera de todo control.
  const blob = await blobPut(blobPathFor(title), rewritten, {
    access: 'private',
    contentType: 'text/html; charset=utf-8',
    addRandomSuffix: true,
  })

  return { blob, parsed, size: rewritten.length, assetCount: assets.size }
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
  files: UploadedFile[]
}) {
  const title = input.title.trim()
  if (!title) throw new DeckError('el título es obligatorio')
  if (input.files.length === 0) throw new DeckError('no subiste ningún archivo')

  const { blob, parsed, size } = await ingestFiles(input.files, title)
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

export async function replaceDeckFile(deckId: number, files: UploadedFile[]) {
  const deck = await getDeck(deckId)
  if (!deck) throw new DeckError('deck no encontrado', 404)
  if (files.length === 0) throw new DeckError('no subiste ningún archivo')

  const { blob, parsed, size } = await ingestFiles(files, deck.title)

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
    // `null` = el blob ya no está (borrado a mano, o un reemplazo que falló a
    // medias). No es una excepción, es un 404 para quien pidió el archivo.
    const result = await blobGet(deck.blobPath, { access: 'private' })
    return result?.stream ?? null
  } catch {
    return null
  }
}
