import { describe, it, expect, afterEach, vi } from 'vitest'
import { normalizeTarget, diagnosticSuite, type DiagnosticTarget } from '../src/lib/diagnostics'

// DNS mockeado: el default resuelve todo; cada test puede sobreescribir.
vi.mock('node:dns/promises', () => ({
  default: {
    resolve4: vi.fn(async () => ['76.76.21.21']),
    resolve6: vi.fn(async () => []),
    resolveCname: vi.fn(async () => []),
    resolveMx: vi.fn(async () => [{ exchange: 'mx.zoho.com', priority: 10 }]),
    resolveNs: vi.fn(async () => ['ns1.vercel-dns.com']),
    resolveTxt: vi.fn(async () => [['v=spf1 ~all']]),
  },
}))
import dns from 'node:dns/promises'

const target = (): DiagnosticTarget => normalizeTarget('https://example.com')!

/** Router de fetch por URL para simular el sitio completo. */
type Routes = Record<string, () => Response | Promise<Response>>
function stubFetchRoutes(routes: Routes, fallback = () => new Response('<html>ok</html>', { status: 200 })) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const u = String(url)
    for (const [prefix, handler] of Object.entries(routes)) {
      if (u.startsWith(prefix)) return handler()
    }
    return fallback()
  }))
}

const runTest = async (id: string) => {
  const entry = diagnosticSuite(target()).find((d) => d.id === id)!
  return entry.run()
}

afterEach(() => vi.unstubAllGlobals())

describe('diagnosticSuite (estructura)', () => {
  it('expone las 12 pruebas con id y label', () => {
    const ids = diagnosticSuite(target()).map((d) => d.id)
    expect(ids).toEqual([
      'reachability', 'tls', 'https-redirect', 'security-headers',
      'dns', 'domain-expiry', 'robots', 'sitemap',
      'seo-meta', 'performance', 'lighthouse', 'accessibility',
    ])
  })
})

describe('reachability', () => {
  it('HTTP 200 → pass con latencia y metadatos', async () => {
    stubFetchRoutes({}, () => new Response('ok', { status: 200, headers: { 'content-type': 'text/html', server: 'Vercel' } }))
    const r = await runTest('reachability')
    expect(r.status).toBe('pass')
    expect(r.summary).toMatch(/HTTP 200 · \d+ms/)
    expect(r.details?.join('\n')).toContain('Content-Type: text/html')
  })

  it('HTTP 500 → fail, 404 → warn', async () => {
    stubFetchRoutes({}, () => new Response('x', { status: 500 }))
    expect((await runTest('reachability')).status).toBe('fail')

    stubFetchRoutes({}, () => new Response('x', { status: 404 }))
    expect((await runTest('reachability')).status).toBe('warn')
  })

  it('excepción de red → fail cronometrado (via timed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    const r = await runTest('reachability')
    expect(r.status).toBe('fail')
    expect(r.summary).toContain('ECONNRESET')
    expect(r.ms).toBeGreaterThanOrEqual(0)
  })
})

describe('https-redirect', () => {
  it('301 con Location https → pass', async () => {
    stubFetchRoutes({
      'http://': () => new Response(null, { status: 301, headers: { location: 'https://example.com/' } }),
    })
    const r = await runTest('https-redirect')
    expect(r.status).toBe('pass')
    expect(r.summary).toContain('301')
  })

  it('redirección que no va a https → warn', async () => {
    stubFetchRoutes({
      'http://': () => new Response(null, { status: 302, headers: { location: 'http://otro.com/' } }),
    })
    expect((await runTest('https-redirect')).status).toBe('warn')
  })

  it('sirve 200 por http sin redirigir → warn; sin respuesta http → info', async () => {
    stubFetchRoutes({ 'http://': () => new Response('ok', { status: 200 }) })
    expect((await runTest('https-redirect')).status).toBe('warn')

    stubFetchRoutes({ 'http://': () => { throw new Error('ECONNREFUSED') } })
    expect((await runTest('https-redirect')).status).toBe('info')
  })
})

describe('security-headers', () => {
  it('todas presentes → pass', async () => {
    stubFetchRoutes({}, () => new Response('ok', {
      status: 200,
      headers: {
        'strict-transport-security': 'max-age=63072000',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'",
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'permissions-policy': 'geolocation=()',
      },
    }))
    const r = await runTest('security-headers')
    expect(r.status).toBe('pass')
    expect(r.summary).toBe('6/6 presentes')
  })

  it('falta una crítica (HSTS) → warn', async () => {
    stubFetchRoutes({}, () => new Response('ok', { status: 200, headers: { 'x-content-type-options': 'nosniff' } }))
    const r = await runTest('security-headers')
    expect(r.status).toBe('warn')
    expect(r.details?.join('\n')).toContain('✗ HSTS')
  })
})

describe('dns', () => {
  it('con registros A → pass y resumen con conteos', async () => {
    stubFetchRoutes({})
    const r = await runTest('dns')
    expect(r.status).toBe('pass')
    expect(r.summary).toContain('1 A')
    expect(r.details?.join('\n')).toContain('76.76.21.21')
  })

  it('sin A/AAAA/CNAME → fail', async () => {
    stubFetchRoutes({})
    vi.mocked(dns.resolve4).mockRejectedValueOnce(new Error('ENOTFOUND'))
    vi.mocked(dns.resolve6).mockRejectedValueOnce(new Error('ENOTFOUND'))
    vi.mocked(dns.resolveCname).mockRejectedValueOnce(new Error('ENOTFOUND'))
    const r = await runTest('dns')
    expect(r.status).toBe('fail')
    expect(r.summary).toBe('No resuelve')
  })
})

describe('domain-expiry (RDAP)', () => {
  it('lejos del vencimiento → pass; ≤30d → warn; vencido → fail', async () => {
    const rdap = (days: number) => () =>
      new Response(JSON.stringify({
        events: [{ eventAction: 'expiration', eventDate: new Date(Date.now() + days * 86_400_000).toISOString() }],
      }), { status: 200 })

    stubFetchRoutes({ 'https://rdap.org/': rdap(187) })
    expect((await runTest('domain-expiry')).status).toBe('pass')

    stubFetchRoutes({ 'https://rdap.org/': rdap(10) })
    expect((await runTest('domain-expiry')).status).toBe('warn')

    stubFetchRoutes({ 'https://rdap.org/': rdap(-3) })
    const r = await runTest('domain-expiry')
    expect(r.status).toBe('fail')
    expect(r.summary).toContain('Vencido hace 3d')
  })

  it('TLD sin RDAP → info (no falla)', async () => {
    stubFetchRoutes({ 'https://rdap.org/': () => new Response('x', { status: 404 }) })
    expect((await runTest('domain-expiry')).status).toBe('info')
  })
})

describe('robots.txt', () => {
  it('robots real con Sitemap → pass', async () => {
    stubFetchRoutes({
      'https://example.com/robots.txt': () =>
        new Response('User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml', {
          status: 200, headers: { 'content-type': 'text/plain' },
        }),
    })
    const r = await runTest('robots')
    expect(r.status).toBe('pass')
    expect(r.summary).toContain('Sitemap')
  })

  it('catch-all de SPA (HTML con 200) → warn; 404 → info', async () => {
    stubFetchRoutes({
      'https://example.com/robots.txt': () =>
        new Response('<html>app</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    })
    expect((await runTest('robots')).status).toBe('warn')

    stubFetchRoutes({ 'https://example.com/robots.txt': () => new Response('x', { status: 404 }) })
    expect((await runTest('robots')).status).toBe('info')
  })
})

describe('sitemap.xml', () => {
  it('urlset válido → pass con conteo de URLs', async () => {
    stubFetchRoutes({
      'https://example.com/sitemap.xml': () =>
        new Response('<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about</loc></url></urlset>', {
          status: 200, headers: { 'content-type': 'application/xml' },
        }),
    })
    const r = await runTest('sitemap')
    expect(r.status).toBe('pass')
    expect(r.summary).toContain('2+ URLs')
  })

  it('índice de sitemaps → pass; catch-all → warn; ausente → info', async () => {
    stubFetchRoutes({
      'https://example.com/sitemap.xml': () =>
        new Response('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>', {
          status: 200, headers: { 'content-type': 'application/xml' },
        }),
    })
    expect((await runTest('sitemap')).summary).toBe('Índice de sitemaps')

    stubFetchRoutes({
      'https://example.com/sitemap.xml': () =>
        new Response('<html>app</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    })
    expect((await runTest('sitemap')).status).toBe('warn')

    stubFetchRoutes({ 'https://example.com/sitemap.xml': () => new Response('x', { status: 404 }) })
    expect((await runTest('sitemap')).status).toBe('info')
  })
})

describe('tls', () => {
  it('objetivo http → info sin abrir sockets', async () => {
    const t = normalizeTarget('http://example.com')!
    const entry = diagnosticSuite(t).find((d) => d.id === 'tls')!
    const r = await entry.run()
    expect(r.status).toBe('info')
    expect(r.summary).toContain('no usa HTTPS')
  })
})

// seo-meta, performance y accessibility comparten `getHtml` (memoizado por
// invocación de diagnosticSuite): un solo fetch a t.url basta para las tres.
const html = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })

describe('seo-meta', () => {
  it('title, description y canonical presentes → pass', async () => {
    stubFetchRoutes({}, () =>
      html(
        '<html lang="es"><head><title>Página</title>' +
          '<meta name="description" content="Una descripción">' +
          '<link rel="canonical" href="https://example.com/">' +
          '<meta property="og:title" content="Página OG">' +
          '</head></html>',
      ),
    )
    const r = await runTest('seo-meta')
    expect(r.status).toBe('pass')
    expect(r.summary).toContain('canonical')
  })

  it('falta un campo → warn con el nombre del que falta', async () => {
    stubFetchRoutes({}, () =>
      html('<html lang="es"><head><title>Página</title><link rel="canonical" href="https://example.com/"></head></html>'),
    )
    const r = await runTest('seo-meta')
    expect(r.status).toBe('warn')
    expect(r.summary).toContain('meta description')
  })

  it('faltan dos o más campos → warn igual (no escala a fail)', async () => {
    stubFetchRoutes({}, () => html('<html><head></head></html>'))
    const r = await runTest('seo-meta')
    expect(r.status).toBe('warn')
    expect(r.summary).toContain('title')
    expect(r.summary).toContain('meta description')
  })

  it('sin poder descargar el HTML → fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    const r = await runTest('seo-meta')
    expect(r.status).toBe('fail')
    expect(r.summary).toContain('No se pudo descargar')
  })
})

describe('performance', () => {
  it('cuenta scripts, hojas de estilo e imágenes enlazadas', async () => {
    stubFetchRoutes({}, () =>
      html(
        '<html><head><link rel="stylesheet" href="/a.css"><script src="/a.js"></script></head>' +
          '<body><img src="/1.png"><img src="/2.png"></body></html>',
      ),
    )
    const r = await runTest('performance')
    expect(r.status).toBe('pass') // responde sin latencia simulada: TTFB ~0ms
    expect(r.details).toContain('Scripts enlazados: 1')
    expect(r.details).toContain('Hojas de estilo: 1')
    expect(r.details).toContain('Imágenes: 2')
  })

  it('reporta el tamaño del HTML descargado', async () => {
    const body = '<html>' + 'x'.repeat(2048) + '</html>'
    stubFetchRoutes({}, () => html(body))
    const r = await runTest('performance')
    expect(r.summary).toContain('KB HTML')
    expect(r.details?.some((d) => d.includes('Tamaño del HTML'))).toBe(true)
  })

  it('sin poder medir (fetch falla) → fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
    const r = await runTest('performance')
    expect(r.status).toBe('fail')
    expect(r.summary).toContain('No se pudo medir')
  })
})

describe('accessibility (heurística)', () => {
  it('html correcto sin hallazgos → pass', async () => {
    stubFetchRoutes({}, () =>
      html(
        '<html lang="es"><body><h1>Título</h1>' +
          '<img src="/x.png" alt="descripción"><a href="/x">Ver el catálogo completo</a>' +
          '</body></html>',
      ),
    )
    const r = await runTest('accessibility')
    expect(r.status).toBe('pass')
    expect(r.summary).toContain('Sin hallazgos')
  })

  it('un solo hallazgo (falta lang) → warn', async () => {
    stubFetchRoutes({}, () => html('<html><body><h1>Título</h1></body></html>'))
    const r = await runTest('accessibility')
    expect(r.status).toBe('warn')
    expect(r.details).toContain('Falta atributo lang en <html>')
  })

  it('tres o más hallazgos acumulados → fail', async () => {
    // Sin lang, sin h1, un <img> sin alt, un link con texto genérico: 4 hallazgos.
    stubFetchRoutes({}, () =>
      html('<html><body><img src="/x.png"><a href="/x">click here</a></body></html>'),
    )
    const r = await runTest('accessibility')
    expect(r.status).toBe('fail')
    expect(r.details).toContain('Sin <h1>')
    expect(r.details).toContain('1 imagen(es) sin alt')
    expect(r.details).toContain('1 enlace(s) con texto genérico')
  })

  it('un <label for> asociado exime al input de ser un hallazgo', async () => {
    stubFetchRoutes({}, () =>
      html(
        '<html lang="es"><body><h1>Form</h1>' +
          '<label for="email">Email</label><input id="email" type="email">' +
          '<a href="/x">Ver detalles del producto</a></body></html>',
      ),
    )
    const r = await runTest('accessibility')
    expect(r.status).toBe('pass')
  })

  it('un input sin label ni aria-label cuenta como hallazgo', async () => {
    stubFetchRoutes({}, () =>
      html('<html lang="es"><body><h1>Form</h1><input type="text"></body></html>'),
    )
    const r = await runTest('accessibility')
    expect(r.details).toContain('1 campo(s) sin label/aria-label')
  })

  it('múltiples <h1> también es un hallazgo', async () => {
    stubFetchRoutes({}, () =>
      html('<html lang="es"><body><h1>Uno</h1><h1>Dos</h1></body></html>'),
    )
    const r = await runTest('accessibility')
    expect(r.details).toContain('2 etiquetas <h1> (debería haber una)')
  })

  it('sin poder analizar el HTML → fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dns') }))
    const r = await runTest('accessibility')
    expect(r.status).toBe('fail')
    expect(r.summary).toContain('No se pudo analizar')
  })
})

describe('lighthouse (PageSpeed Insights)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sin PSI_API_KEY → info, sin llamar a la red', async () => {
    vi.stubEnv('PSI_API_KEY', '')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const r = await runTest('lighthouse')
    expect(r.status).toBe('info')
    expect(r.summary).toContain('No configurado')
    expect(spy).not.toHaveBeenCalled()
  })

  it('PSI responde con scores → pass si rendimiento ≥90', async () => {
    vi.stubEnv('PSI_API_KEY', 'clave-de-prueba')
    stubFetchRoutes({
      'https://www.googleapis.com/pagespeedonline/v5/runPagespeed': () =>
        new Response(
          JSON.stringify({
            lighthouseResult: {
              categories: {
                performance: { score: 0.95 },
                accessibility: { score: 0.9 },
                'best-practices': { score: 1 },
                seo: { score: 1 },
              },
              audits: {
                'largest-contentful-paint': { displayValue: '1.2 s' },
                'cumulative-layout-shift': { displayValue: '0.01' },
                'total-blocking-time': { displayValue: '50 ms' },
              },
            },
          }),
          { status: 200 },
        ),
    })
    const r = await runTest('lighthouse')
    expect(r.status).toBe('pass')
    expect(r.summary).toContain('Rendimiento 95')
    expect(r.details).toContain('LCP: 1.2 s · CLS: 0.01 · TBT: 50 ms')
  })

  it('rendimiento entre 50 y 89 → warn; por debajo de 50 → fail', async () => {
    vi.stubEnv('PSI_API_KEY', 'clave-de-prueba')
    const conScore = (score: number) => () =>
      new Response(
        JSON.stringify({ lighthouseResult: { categories: { performance: { score } }, audits: {} } }),
        { status: 200 },
      )

    stubFetchRoutes({ 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed': conScore(0.7) })
    expect((await runTest('lighthouse')).status).toBe('warn')

    stubFetchRoutes({ 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed': conScore(0.3) })
    expect((await runTest('lighthouse')).status).toBe('fail')
  })

  it('PSI responde con error HTTP → fail', async () => {
    vi.stubEnv('PSI_API_KEY', 'clave-de-prueba')
    stubFetchRoutes({
      'https://www.googleapis.com/pagespeedonline/v5/runPagespeed': () => new Response('quota', { status: 429 }),
    })
    const r = await runTest('lighthouse')
    expect(r.status).toBe('fail')
    expect(r.summary).toContain('429')
  })

  it('PSI responde 200 pero sin datos de Lighthouse → fail', async () => {
    vi.stubEnv('PSI_API_KEY', 'clave-de-prueba')
    stubFetchRoutes({
      'https://www.googleapis.com/pagespeedonline/v5/runPagespeed': () =>
        new Response(JSON.stringify({}), { status: 200 }),
    })
    const r = await runTest('lighthouse')
    expect(r.status).toBe('fail')
    expect(r.summary).toContain('sin datos de Lighthouse')
  })
})
