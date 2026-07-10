import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { db } from '../db'
import { projects } from '../db/schema'
import { eq } from 'drizzle-orm'

// '/log' se excluye a propósito: es una página "viva" renderizada en cliente
// (feed de GitHub en tiempo real), sin contenido indexable ni intención de
// búsqueda. Lleva noindex en log.astro; mantenerla fuera del sitemap evita
// anunciar thin content y diluir la calidad del sitio. Ver seo.MD (hallazgo #9).
const STATIC_PATHS = ['/', '/tools', '/status', '/notes', '/security', '/certifications', '/contact']

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://codebymike.tech')).href.replace(/\/$/, '')

  const [visibleProjects, notes] = await Promise.all([
    db
      .select({ slug: projects.slug, createdAt: projects.createdAt })
      .from(projects)
      .where(eq(projects.visible, true)),
    getCollection('notes', ({ data }) => !data.draft),
  ])

  const entries = [
    ...STATIC_PATHS.map((path) => ({ loc: `${base}${path === '/' ? '' : path}`, lastmod: null as Date | null })),
    ...visibleProjects.map((p) => ({ loc: `${base}/projects/${p.slug}`, lastmod: p.createdAt })),
    ...notes.map((n) => ({ loc: `${base}/notes/${n.id}`, lastmod: n.data.date })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`
  )
  .join('\n')}
</urlset>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
