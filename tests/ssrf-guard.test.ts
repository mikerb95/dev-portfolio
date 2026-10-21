import { describe, it, expect, afterEach, vi } from 'vitest'

// Resolución simulada: `.interno.test` hace de host privado, el resto es público.
vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn(async (host: string) => [{ address: host.endsWith('.interno.test') ? '10.0.0.7' : '93.184.216.34', family: 4 }]),
  },
}))

import { assertPublicHost, fetchPublico, lookupPublico, MAX_SALTOS, PrivateHostError } from '../src/lib/ssrf-guard'

afterEach(() => vi.unstubAllGlobals())

const redirige = (location: string) => new Response(null, { status: 302, headers: { location } })

describe('assertPublicHost', () => {
  it('rechaza IPs privadas literales y nombres internos', async () => {
    for (const h of ['127.0.0.1', '169.254.169.254', '10.1.2.3', '::1', 'localhost', 'x.interno.test']) {
      await expect(assertPublicHost(h)).rejects.toBeInstanceOf(PrivateHostError)
    }
  })

  it('deja pasar un host público', async () => {
    await expect(assertPublicHost('example.com')).resolves.toBeUndefined()
  })
})

describe('fetchPublico', () => {
  it('valida cada salto: no pide el destino privado de una redirección', async () => {
    const fetchMock = vi.fn(async () => redirige('http://169.254.169.254/latest/meta-data/'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPublico('https://example.com/')).rejects.toBeInstanceOf(PrivateHostError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('corta un bucle de redirecciones', async () => {
    const fetchMock = vi.fn(async () => redirige('https://example.com/otra-vez'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPublico('https://example.com/')).rejects.toThrow('demasiadas redirecciones')
    expect(fetchMock).toHaveBeenCalledTimes(MAX_SALTOS + 1)
  })

  it('no sigue redirecciones a esquemas que no son http(s)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => redirige('file:///etc/passwd')))
    await expect(fetchPublico('https://example.com/')).rejects.toThrow('esquema')
  })

  it('sigue redirecciones públicas e informa el destino final', async () => {
    const fetchMock = vi.fn(async (url: string) => (url === 'https://example.com/' ? redirige('/nuevo') : new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)
    const r = await fetchPublico('https://example.com/')
    expect(r).toMatchObject({ url: 'https://example.com/nuevo', redirected: true })
    expect(r.res.status).toBe(200)
  })

  it("con redirect: 'manual' devuelve el 3xx sin seguirlo", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => redirige('https://otro.example/')))
    const r = await fetchPublico('http://example.com/', { redirect: 'manual' })
    expect(r.res.status).toBe(302)
    expect(r.redirected).toBe(false)
  })

  it('cada petición sale con el dispatcher que fija la IP validada', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit & { dispatcher?: unknown }) => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    await fetchPublico('https://example.com/')
    expect(fetchMock.mock.calls[0]![1].dispatcher).toBeDefined()
  })
})

describe('lookupPublico (rebinding)', () => {
  it('rechaza en el momento de conectar un nombre que resuelve a loopback', async () => {
    const err = await new Promise<Error | null>((resolve) => lookupPublico('localhost', {}, (e) => resolve(e)))
    expect(err).toBeInstanceOf(PrivateHostError)
  })
})
