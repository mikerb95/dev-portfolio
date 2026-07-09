import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

// Feed RSS de las notas de ingeniería. Además de lectores RSS, es una señal
// de descubrimiento/frescura para crawlers y agregadores (se anuncia con
// <link rel="alternate"> en BaseLayout y se lista en robots-friendly tools).
const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://codebymike.tech')).href.replace(/\/$/, '')
  const notes = (await getCollection('notes', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  )

  const items = notes
    .map((n) => {
      const url = `${base}/notes/${n.id}`
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
    <title>Notas de ingeniería — CodeByMike</title>
    <link>${base}/notes</link>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Artículos técnicos de Mike: observabilidad, SRE, Astro, arquitectura y rendimiento.</description>
    <language>es-co</language>
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
