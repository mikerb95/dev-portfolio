import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

// Notas de ingeniería: artículos técnicos en markdown (src/content/notes).
// El id de cada entrada es el nombre del archivo sin extensión → /notes/<id>.
const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
})

export const collections = { notes }
