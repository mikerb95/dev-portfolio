// Puente entre la colección de notas y los generadores puros de llms.txt.
// Vive aparte porque importa astro:content, y llms.ts tiene que poder
// probarse sin él.

import { getNotes, noteSlug } from '../notes'
import type { NotaLlms } from './llms'

export async function notasParaLlms(): Promise<NotaLlms[]> {
  const [es, en] = await Promise.all([getNotes('es'), getNotes('en')])
  return [...es, ...en].map((n) => ({
    slug: noteSlug(n),
    title: n.data.title,
    description: n.data.description,
    lang: n.data.lang,
    date: n.data.date,
    body: n.body ?? '',
  }))
}
