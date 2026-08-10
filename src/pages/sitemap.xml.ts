import type { APIRoute } from 'astro'
import { getNotes, getTranslationSlug, noteSlug } from '../lib/notes'
import { db } from '../db'
import { projects } from '../db/schema'
import { eq } from 'drizzle-orm'
import { LOCALES, hasRowTranslation, localizePath, translatedAlternates } from '../i18n'

// '/log' se excluye a propósito: es una página "viva" renderizada en cliente
// (feed de GitHub en tiempo real), sin contenido indexable ni intención de
// búsqueda. Lleva noindex en log.astro; mantenerla fuera del sitemap evita
// anunciar thin content y diluir la calidad del sitio. Ver seo.MD (hallazgo #9).
//
// '/capacitacion' y '/capacitacion-ia' entran porque su función es que las
// encuentren: el banco público es captación, no solo entrega. Lo que NO entra
// es '/capacitacion/acceso' (utilitaria, con noindex) ni ningún recurso
// marcado con código, que además lleva noindex por página.
const STATIC_PATHS = ['/', '/tools', '/engineering', '/architecture', '/lab', '/demo', '/status', '/notes', '/security', '/certifications', '/contact', '/capacitacion', '/capacitacion-ia']

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://codebymike.tech')).href.replace(/\/$/, '')

  const [visibleProjects, notes] = await Promise.all([
    db
      .select({
        slug: projects.slug,
        createdAt: projects.createdAt,
        // Se lee la traducción solo para decidir si la URL /en/ se anuncia.
        titleEn: projects.titleEn,
      })
      .from(projects)
      .where(eq(projects.visible, true)),
    getNotes('es'),
  ])

  // Cada ruta estática se emite en los idiomas en los que EXISTE, con hreflang
  // recíproco (xhtml:link) entre ellas. El sitio se traduce por fases: emitir
  // /en/ para toda ruta (lo que hacía antes) publicaba en el sitemap URLs que
  // devolvían 404 - la peor forma posible de que un buscador descubra el
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

  // La plantilla de /projects/<slug> existe en los dos idiomas, pero el
  // contenido de cada proyecto se traduce fila por fila: solo se anuncia la URL
  // en inglés de los proyectos que SÍ tienen `title_en`. Anunciar el resto
  // sería publicar una URL /en/ cuyo contenido sale en español - thin content
  // a ojos de un buscador. Ver docs/plan-i18n-en.md §7.
  const projectEntries = visibleProjects.flatMap((p) => {
    const path = `/projects/${p.slug}`
    const translated = hasRowTranslation(p, ['title'], 'en')
    const alternates = translated
      ? LOCALES.map((l) => ({ hreflang: l, href: `${base}${localizePath(path, l)}` }))
      : []
    const urls = [{ loc: `${base}${path}`, lastmod: p.createdAt, alternates }]
    if (translated) {
      urls.push({ loc: `${base}${localizePath(path, 'en')}`, lastmod: p.createdAt, alternates })
    }
    return urls
  })

  // Notas: cada artículo se anuncia en español y, si existe su hermano
  // traducido, también en inglés - con el slug del hermano, que es distinto.
  const noteEntries = await Promise.all(
    notes.map(async (n) => {
      const slug = noteSlug(n)
      const enSlug = await getTranslationSlug(n)
      const path = `/notes/${slug}`
      const alternates = enSlug
        ? [
            { hreflang: 'es', href: `${base}${path}` },
            { hreflang: 'en', href: `${base}/en/notes/${enSlug}` },
          ]
        : []
      const urls = [{ loc: `${base}${path}`, lastmod: n.data.date, alternates }]
      if (enSlug) urls.push({ loc: `${base}/en/notes/${enSlug}`, lastmod: n.data.date, alternates })
      return urls
    })
  )

  const entries = [
    ...staticEntries,
    ...projectEntries,
    ...noteEntries.flat(),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map(
    (e) =>
      `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}${e.alternates
        .map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`)
        .join('')}${
        // x-default apuntando al español, igual que el <head> del HTML. Sin él
        // el sitemap contradice a la página: Google exige que cada URL de un
        // grupo hreflang declare el mismo conjunto de alternates, y una de las
        // dos fuentes anunciaría un idioma de respaldo que la otra no.
        e.alternates.find((a) => a.hreflang === 'es')
          ? `<xhtml:link rel="alternate" hreflang="x-default" href="${
              e.alternates.find((a) => a.hreflang === 'es')!.href
            }" />`
          : ''
      }</url>`
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
