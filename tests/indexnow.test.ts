import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  INDEXNOW_KEY,
  locsFromSitemap,
  submitToIndexNow,
  submitSitemapToIndexNow,
} from '../src/lib/indexnow'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('locsFromSitemap', () => {
  it('extrae todas las URLs <loc> y las recorta', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://codebymike.tech/</loc></url>
      <url><loc> https://codebymike.tech/notes </loc><lastmod>2026-07-09</lastmod></url>
    </urlset>`
    expect(locsFromSitemap(xml)).toEqual([
      'https://codebymike.tech/',
      'https://codebymike.tech/notes',
    ])
  })

  it('devuelve lista vacía si no hay <loc>', () => {
    expect(locsFromSitemap('<urlset></urlset>')).toEqual([])
  })
})

describe('submitToIndexNow', () => {
  it('no llama a fetch si no hay URLs', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const r = await submitToIndexNow('https://codebymike.tech', [])
    expect(spy).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: false, status: 0, submitted: 0 })
  })

  it('envía host, clave y keyLocation correctos', async () => {
    const spy = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', spy)

    const r = await submitToIndexNow('https://codebymike.tech/', [
      'https://codebymike.tech/notes',
    ])

    expect(r).toEqual({ ok: true, status: 200, submitted: 1 })
    const [url, opts] = spy.mock.calls[0]
    expect(url).toBe('https://api.indexnow.org/indexnow')
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body.host).toBe('codebymike.tech')
    expect(body.key).toBe(INDEXNOW_KEY)
    expect(body.keyLocation).toBe(`https://codebymike.tech/${INDEXNOW_KEY}.txt`)
    expect(body.urlList).toEqual(['https://codebymike.tech/notes'])
  })

  it('trata 202 (clave pendiente) como éxito', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))
    const r = await submitToIndexNow('https://codebymike.tech', ['https://codebymike.tech/'])
    expect(r.ok).toBe(true)
    expect(r.status).toBe(202)
  })

  it('reporta fallo en 4xx distinto de 202', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })))
    const r = await submitToIndexNow('https://codebymike.tech', ['https://codebymike.tech/'])
    expect(r.ok).toBe(false)
    expect(r.status).toBe(403)
  })
})

describe('submitSitemapToIndexNow', () => {
  it('lee el sitemap propio y reenvía sus URLs', async () => {
    const xml = '<urlset><url><loc>https://codebymike.tech/</loc></url></urlset>'
    const spy = vi.fn(async (input: string) => {
      if (String(input).endsWith('/sitemap.xml')) return new Response(xml, { status: 200 })
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', spy)

    const r = await submitSitemapToIndexNow('https://codebymike.tech')
    expect(r).toEqual({ ok: true, status: 200, submitted: 1 })
    // Segunda llamada = POST a IndexNow con la URL del sitemap.
    const body = JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string)
    expect(body.urlList).toEqual(['https://codebymike.tech/'])
  })

  it('aborta si el sitemap no responde 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    const r = await submitSitemapToIndexNow('https://codebymike.tech')
    expect(r).toEqual({ ok: false, status: 500, submitted: 0 })
  })
})
