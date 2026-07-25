import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

// Feed en inglés de las notas de ingeniería. Vacío hasta que exista al menos
// un artículo traducido (Fase 4 de docs/plan-i18n-en.md — la colección de
// contenido aún no distingue idioma). Un canal RSS sin items es válido: mejor
// eso que mezclar artículos en español bajo un feed anunciado como inglés.
const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://codebymike.tech')).href.replace(/\/$/, '')
  // TODO(fase 4 i18n): filtrar por `data.lang === 'en'` una vez la colección
  // de notas distinga idioma. Hoy no hay ninguna nota en inglés.
  const notes = (await getCollection('notes', () => false)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  )

  const items = notes
    .map((n) => {
      const url = `${base}/en/notes/${n.id}`
      return `    <item>
      <title>${escapeXml(n.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(n.data.description)}</description>
      <pubDate>${n.data.date.toUTCString()}</pubDate>
${n.data.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join('\n')}
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Engineering notes — CodeByMike</title>
    <link>${base}/en/notes</link>
    <atom:link href="${base}/en/rss.xml" rel="self" type="application/rss+xml" />
    <description>Mike's technical writing: observability, SRE, Astro, architecture, and performance.</description>
    <language>en-us</language>
    <lastBuildDate>${(notes[0]?.data.date ?? new Date()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
