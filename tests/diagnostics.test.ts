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
