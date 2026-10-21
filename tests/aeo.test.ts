import { describe, expect, it } from 'vitest'
import { AGENTES_IA, agenteDeUserAgent, asistenteDeVisita, esAsistente } from '../src/lib/aeo/agentes'
import { RUTAS_VETADAS, robotsTxt } from '../src/lib/aeo/robots'
import { absolutizarEnlaces, llmsFullTxt, llmsTxt, type NotaLlms } from '../src/lib/aeo/llms'
import { NEGOCIO_ID, faqPageJsonLd, negocioJsonLd, ofertasWeb } from '../src/lib/aeo/jsonld'
import { resumirPorFuente, type FilaAeo } from '../src/lib/aeo/resumen'
import { getDictionary } from '../src/i18n'
import { CAPACITACION, PAQUETES_WEB, TARIFA_HORA, formatearMonto } from '../src/data/tarifario'

const es = getDictionary('es')
const en = getDictionary('en')
const BASE = 'https://codebymike.net'

describe('agenteDeUserAgent', () => {
  it.each([
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)', 'gptbot'],
    ['Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)', 'oai-searchbot'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', 'chatgpt-user'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'claudebot'],
    ['Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)', 'claude-searchbot'],
    ['Mozilla/5.0 (compatible; Claude-User/1.0)', 'claude-user'],
    ['Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', 'perplexitybot'],
    ['meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'meta-externalagent'],
    ['CCBot/2.0 (https://commoncrawl.org/faq/)', 'ccbot'],
  ])('reconoce %s', (ua, id) => {
    expect(agenteDeUserAgent(ua)?.id).toBe(id)
  })

  it('no confunde ClaudeBot con Claude-SearchBot', () => {
    expect(agenteDeUserAgent('Claude-SearchBot/1.0')?.id).toBe('claude-searchbot')
    expect(agenteDeUserAgent('ClaudeBot/1.0')?.id).toBe('claudebot')
  })

  it('un navegador, Googlebot o un UA vacío no son agentes de IA', () => {
    expect(agenteDeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36')).toBeNull()
    expect(agenteDeUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBeNull()
    expect(agenteDeUserAgent('')).toBeNull()
    expect(agenteDeUserAgent(null)).toBeNull()
  })

  it('los tokens solo-robots no se buscan en el User-Agent', () => {
    // Google-Extended no rastrea: lo hace Googlebot. Contarlo sería inventar.
    expect(agenteDeUserAgent('Google-Extended')).toBeNull()
  })

  it('cada agente tiene id y token únicos', () => {
    expect(new Set(AGENTES_IA.map((a) => a.id)).size).toBe(AGENTES_IA.length)
    expect(new Set(AGENTES_IA.map((a) => a.token.toLowerCase())).size).toBe(AGENTES_IA.length)
  })
})

describe('asistenteDeVisita', () => {
  it('reconoce el utm_source aunque no haya referrer', () => {
    expect(asistenteDeVisita({ referrer: '', utmSource: 'chatgpt.com' })?.id).toBe('chatgpt')
  })

  it('reconoce el host del referrer y sus subdominios', () => {
    expect(asistenteDeVisita({ referrer: 'https://www.perplexity.ai/search?q=x' })?.id).toBe('perplexity')
    expect(asistenteDeVisita({ referrer: 'https://claude.ai/chat/123' })?.id).toBe('claude')
    expect(asistenteDeVisita({ referrer: 'https://gemini.google.com/app' })?.id).toBe('gemini')
  })

  it('no casa hosts que solo se parecen', () => {
    expect(asistenteDeVisita({ referrer: 'https://notclaude.ai/' })).toBeNull()
    expect(asistenteDeVisita({ referrer: 'https://www.google.com/' })).toBeNull()
    expect(asistenteDeVisita({ referrer: 'no es una url' })).toBeNull()
  })

  it('esAsistente solo acepta ids de la lista', () => {
    expect(esAsistente('chatgpt')).toBe(true)
    expect(esAsistente('<script>')).toBe(false)
    expect(esAsistente(42)).toBe(false)
  })
})

/** Agrupa robots.txt en grupos de User-agent y sus reglas, como lo lee un bot. */
function grupos(txt: string) {
  const out: { agentes: string[]; disallow: string[]; allow: string[] }[] = []
  let actual: (typeof out)[number] | null = null
  let leyendoAgentes = false
  for (const raw of txt.split('\n')) {
    const linea = raw.replace(/#.*/, '').trim()
    if (!linea) continue
    const [campo, ...resto] = linea.split(':')
    const valor = resto.join(':').trim()
    const c = campo!.toLowerCase()
    if (c === 'user-agent') {
      if (!leyendoAgentes) {
        actual = { agentes: [], disallow: [], allow: [] }
        out.push(actual)
      }
      actual!.agentes.push(valor)
      leyendoAgentes = true
    } else {
      leyendoAgentes = false
      if (c === 'disallow') actual?.disallow.push(valor)
      if (c === 'allow') actual?.allow.push(valor)
    }
  }
  return out
}

describe('robotsTxt', () => {
  const txt = robotsTxt(BASE)
  const gs = grupos(txt)

  it('el grupo de agentes de IA repite TODOS los Disallow del grupo *', () => {
    // Un bot con grupo propio ignora el de "*": sin esto, /admin quedaría
    // abierto a GPTBot.
    const ia = gs.find((g) => g.agentes.includes('GPTBot'))!
    const todos = gs.find((g) => g.agentes.includes('*'))!
    expect(ia.disallow).toEqual(todos.disallow)
    expect(todos.disallow).toEqual(RUTAS_VETADAS.map((r) => r.ruta))
    expect(ia.disallow).toContain('/admin')
    expect(ia.disallow).toContain('/api')
  })

  it('declara a cada agente de la lista', () => {
    const ia = gs.find((g) => g.agentes.includes('GPTBot'))!
    expect(ia.agentes).toEqual(AGENTES_IA.map((a) => a.token))
    expect(ia.allow).toEqual(['/'])
  })

  it('anuncia el sitemap y el llms.txt', () => {
    expect(txt).toContain(`Sitemap: ${BASE}/sitemap.xml`)
    expect(txt).toContain(`${BASE}/llms.txt`)
  })
})

const notas: NotaLlms[] = [
  {
    slug: 'mi-nota',
    title: 'Mi nota',
    description: 'Lo que resuelve.',
    lang: 'es',
    date: new Date('2026-10-01'),
    body: 'Ver [la otra](/notes/otra) y [GitHub](https://github.com).',
  },
  { slug: 'my-note', title: 'My note', description: 'What it solves.', lang: 'en', date: new Date('2026-10-01'), body: 'x' },
]

// Construido por código para que este archivo no contenga el carácter.
const RAYAS = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

describe('llmsTxt', () => {
  const txt = llmsTxt({ origen: BASE, es, en, notas })

  it('sigue el formato de llmstxt.org: H1, resumen en cita y secciones H2', () => {
    expect(txt.startsWith('# CodeByMike\n\n> ')).toBe(true)
    expect(txt).toMatch(/\n## Servicios\n/)
    expect(txt).toMatch(/\n## Optional\n/)
  })

  it('los precios salen del tarifario, no del texto', () => {
    for (const p of PAQUETES_WEB) expect(txt).toContain(formatearMonto(p.desde.COP, 'COP'))
    expect(txt).toContain(formatearMonto(TARIFA_HORA.COP, 'COP'))
    expect(txt).toContain(formatearMonto(CAPACITACION.sesionCOP, 'COP'))
  })

  it('lista las notas de los dos idiomas con su URL', () => {
    expect(txt).toContain(`[Mi nota](${BASE}/notes/mi-nota): Lo que resuelve.`)
    expect(txt).toContain(`[My note](${BASE}/en/notes/my-note): What it solves.`)
  })

  it('enlaza los servicios en los dos idiomas', () => {
    expect(txt).toContain(`(${BASE}/paginas-web)`)
    expect(txt).toContain(`(${BASE}/en/paginas-web)`)
    expect(txt).toContain(`(${BASE}/capacitacion-ia)`)
  })

  it('ninguna línea de enlace se parte en dos', () => {
    for (const l of txt.split('\n').filter((l) => l.startsWith('- ['))) expect(l).toMatch(/^- \[[^\]]+\]\(https:\/\/[^)]+\)/)
  })

  it('sin rayas tipográficas', () => {
    expect(txt).not.toMatch(RAYAS)
  })
})

describe('llmsFullTxt', () => {
  const txt = llmsFullTxt({ origen: BASE, es, notas })

  it('incluye el cuerpo de las notas en español con enlaces absolutos', () => {
    expect(txt).toContain(`[la otra](${BASE}/notes/otra)`)
    expect(txt).toContain('[GitHub](https://github.com)')
    expect(txt).not.toContain('My note')
  })

  it('incluye las preguntas frecuentes de los dos servicios', () => {
    expect(txt).toContain(es.paginasWeb.faqs[0]!.q)
    expect(txt).toContain(es.capacitacionIa.faqs[0]!.q)
  })

  it('absolutizarEnlaces no toca enlaces externos', () => {
    expect(absolutizarEnlaces('[a](https://x.com) [b](/y)', BASE)).toBe(`[a](https://x.com) [b](${BASE}/y)`)
  })
})

describe('JSON-LD', () => {
  it('las ofertas web llevan el precio "desde" del tarifario en la moneda del idioma', () => {
    const cop = ofertasWeb('es', es)
    const usd = ofertasWeb('en', en)
    expect(cop.map((o) => o.priceSpecification.minPrice)).toEqual(PAQUETES_WEB.map((p) => p.desde.COP))
    expect(usd.map((o) => o.priceSpecification.priceCurrency)).toEqual(['USD', 'USD', 'USD'])
    expect(usd.map((o) => o.priceSpecification.minPrice)).toEqual(PAQUETES_WEB.map((p) => p.desde.USD))
  })

  it('el negocio tiene @id fijo y su catálogo incluye la capacitación', () => {
    const n = negocioJsonLd('es', es)
    expect(n['@id']).toBe(NEGOCIO_ID)
    expect(n.hasOfferCatalog.itemListElement).toHaveLength(PAQUETES_WEB.length + 1)
  })

  it('el FAQPage refleja las preguntas del diccionario', () => {
    const f = faqPageJsonLd(es.paginasWeb.faqs)
    expect(f.mainEntity).toHaveLength(es.paginasWeb.faqs.length)
    expect(f.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: es.paginasWeb.faqs[0]!.q,
      acceptedAnswer: { '@type': 'Answer', text: es.paginasWeb.faqs[0]!.a },
    })
  })
})

describe('resumirPorFuente', () => {
  const filas: FilaAeo[] = [
    { dia: '2026-10-18', tipo: 'bot', fuente: 'gptbot', hits: 3, hitsLlms: 1 },
    { dia: '2026-10-19', tipo: 'bot', fuente: 'gptbot', hits: 2, hitsLlms: 0 },
    { dia: '2026-10-19', tipo: 'bot', fuente: 'claudebot', hits: 9, hitsLlms: 2 },
    { dia: '2026-10-19', tipo: 'referido', fuente: 'chatgpt', hits: 1, hitsLlms: 0 },
  ]

  it('suma por fuente, guarda el último día y ordena por actividad', () => {
    expect(resumirPorFuente(filas, 'bot')).toEqual([
      { fuente: 'claudebot', hits: 9, hitsLlms: 2, ultimoDia: '2026-10-19' },
      { fuente: 'gptbot', hits: 5, hitsLlms: 1, ultimoDia: '2026-10-19' },
    ])
    expect(resumirPorFuente(filas, 'referido')).toEqual([{ fuente: 'chatgpt', hits: 1, hitsLlms: 0, ultimoDia: '2026-10-19' }])
  })
})
