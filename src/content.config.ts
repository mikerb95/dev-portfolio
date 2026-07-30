import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

// Notas de ingeniería: artículos técnicos en markdown (src/content/notes).
// Los archivos viven bajo un directorio por idioma (`es/`, `en/`), así que el
// id de cada entrada es "<lang>/<slug>", no el slug pelado. Las rutas públicas
// NO llevan ese prefijo: /notes/<slug> resuelve contra es/<slug> y
// /en/notes/<slug> contra en/<slug>. Las URLs en español no cambiaron al
// introducir el inglés, así que no hacen falta redirecciones 301.
// Ver docs/plan-i18n-en.md §8.
//
// `translationOf` apunta al slug hermano en el otro idioma (los slugs también
// se traducen: "por-que-construi-mi-propio-monitor" ↔
// "why-i-built-my-own-monitor"). Es lo que permite emitir el hreflang recíproco
// y que el selector de idioma lleve al artículo equivalente, no al índice.
const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    lang: z.enum(['es', 'en']).default('es'),
    /** Slug (sin prefijo de idioma) del artículo equivalente en el otro idioma. */
    translationOf: z.string().optional(),
  }),
})

export const collections = { notes }
