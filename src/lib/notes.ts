// Acceso a la colección de notas por idioma. Existe para que el filtro
// "solo las de este idioma, sin borradores, más recientes primero" y la
// traducción id ↔ slug vivan en UN sitio: lo usan el índice, la página de
// artículo, los dos feeds RSS y el sitemap.
//
// El id de una entrada es "<lang>/<slug>" (los archivos viven en
// src/content/notes/<lang>/). La ruta pública NO lleva ese prefijo, así que
// todo lo que sale de aquí expone `slug` ya limpio.

import { getCollection, getEntry } from 'astro:content'
import type { CollectionEntry } from 'astro:content'
import type { Locale } from '../i18n'

export type Note = CollectionEntry<'notes'>

/** "es/mi-nota" → "mi-nota". El id lleva el idioma; la URL pública no. */
export function noteSlug(note: Note): string {
  return note.id.replace(/^(es|en)\//, '')
}

/** Ruta pública de la nota, ya con el prefijo de idioma que corresponda. */
export function notePath(note: Note): string {
  const slug = noteSlug(note)
  return note.data.lang === 'en' ? `/en/notes/${slug}` : `/notes/${slug}`
}

/** Notas publicadas de un idioma, de la más reciente a la más antigua. */
export async function getNotes(locale: Locale): Promise<Note[]> {
  const notes = await getCollection('notes', ({ data }) => !data.draft && data.lang === locale)
  return notes.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

/** Una nota por su slug público (sin prefijo de idioma). */
export async function getNote(slug: string, locale: Locale): Promise<Note | undefined> {
  const note = await getEntry('notes', `${locale}/${slug}`)
  // `lang` se comprueba además del directorio: si un frontmatter y su carpeta
  // se contradicen, gana el frontmatter y esa entrada no se sirve aquí.
  return note && !note.data.draft && note.data.lang === locale ? note : undefined
}

/**
 * Slug del artículo equivalente en el otro idioma, o `null` si no está
 * traducido. Se resuelve en las dos direcciones: la nota puede declarar su
 * `translationOf`, o ser la referenciada por otra.
 */
export async function getTranslationSlug(note: Note): Promise<string | null> {
  if (note.data.translationOf) return note.data.translationOf

  const otherLocale: Locale = note.data.lang === 'en' ? 'es' : 'en'
  const slug = noteSlug(note)
  const candidates = await getCollection(
    'notes',
    ({ data }) => !data.draft && data.lang === otherLocale && data.translationOf === slug
  )
  return candidates.length > 0 ? noteSlug(candidates[0]) : null
}
