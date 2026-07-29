import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { db } from '../db'
import { projects } from '../db/schema'
import { eq } from 'drizzle-orm'
import { LOCALES, translatedAlternates } from '../i18n'

// '/log' se excluye a propósito: es una página "viva" renderizada en cliente
// (feed de GitHub en tiempo real), sin contenido indexable ni intención de
// búsqueda. Lleva noindex en log.astro; mantenerla fuera del sitemap evita
// anunciar thin content y diluir la calidad del sitio. Ver seo.MD (hallazgo #9).
const STATIC_PATHS = ['/', '/tools', '/engineering', '/architecture', '/lab', '/demo', '/status', '/notes', '/security', '/certifications', '/contact']

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://codebymike.tech')).href.replace(/\/$/, '')

  const [visibleProjects, notes] = await Promise.all([
    db
      .select({ slug: projects.slug, createdAt: projects.createdAt })
      .from(projects)
      .where(eq(projects.visible, true)),
    getCollection('notes', ({ data }) => !data.draft),
  ])

  // Cada ruta estática se emite en los idiomas en los que EXISTE, con hreflang
  // recíproco (xhtml:link) entre ellas. El sitio se traduce por fases: emitir
  // /en/ para toda ruta (lo que hacía antes) publicaba en el sitemap URLs que
  // devolvían 404 — la peor forma posible de que un buscador descubra el
  // inglés. `translatedAlternates` es la fuente de verdad de qué existe.
  const staticEntries = STATIC_PATHS.flatMap((path) => {
    const alt = translatedAlternates(path)
    const available = LOCALES.filter((l) => alt[l])
    return available.map((locale) => ({
      loc: `${base}${alt[locale]}`,
      lastmod: null as Date | null,
      // Un solo idioma disponible no necesita anunciar alternates.
      alternates:
        available.length > 1 ? available.map((l) => ({ hreflang: l, href: `${base}${alt[l]}` })) : [],
    }))
  })

  // Fase 3 del plan de i18n (docs/plan-i18n-en.md §7): los proyectos y notas
  // todavía no tienen traducción propia — solo se anuncia la versión en
  // español para no publicar una URL /en/ con contenido a medias.
  const entries = [
    ...staticEntries,
    ...visibleProjects.map((p) => ({
      loc: `${base}/projects/${p.slug}`,
      lastmod: p.createdAt,
      alternates: [] as { hreflang: string; href: string }[],
    })),
    ...notes.map((n) => ({
      loc: `${base}/notes/${n.id}`,
      lastmod: n.data.date,
      alternates: [] as { hreflang: string; href: string }[],
    })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map(
    (e) =>
      `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}${e.alternates
        .map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`)
        .join('')}</url>`
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
