import { describe, it, expect, afterEach, vi } from 'vitest'
import { probe, fetchSslExpiry } from '../src/lib/monitors'

afterEach(() => vi.unstubAllGlobals())

const okResponse = (body = 'ok', status = 200) => new Response(body, { status })

describe('probe', () => {
  it('status esperado y latencia normal → up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()))
    const r = await probe({ url: 'https://example.com' })
    expect(r).toMatchObject({ ok: true, state: 'up', statusCode: 200, error: null })
    expect(r.responseMs).toBeGreaterThanOrEqual(0)
  })

  it('status distinto al esperado → down con mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('err', 500)))
    const r = await probe({ url: 'https://example.com' })
    expect(r.ok).toBe(false)
    expect(r.state).toBe('down')
    expect(r.statusCode).toBe(500)
    expect(r.error).toContain('HTTP 500')
  })

  it('respeta expectedStatus personalizado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('', 204)))
    const r = await probe({ url: 'https://example.com', expectedStatus: 204 })
    expect(r.state).toBe('up')
  })

  it('expectedText presente → up; ausente → down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('<h1>CodeByMike</h1>')))
    expect((await probe({ url: 'https://x.co', expectedText: 'CodeByMike' })).state).toBe('up')

    vi.stubGlobal('fetch', vi.fn(async () => okResponse('<h1>Otra cosa</h1>')))
    const r = await probe({ url: 'https://x.co', expectedText: 'CodeByMike' })
    expect(r.state).toBe('down')
    expect(r.error).toContain('texto esperado')
  })

  it('latencia por encima del umbral → degraded (sigue ok)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return okResponse()
    }))
    const r = await probe({ url: 'https://x.co', latencyThresholdMs: 10 })
    expect(r.ok).toBe(true)
    expect(r.state).toBe('degraded')
  })

  it('error de red → down, nunca lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND') }))
    const r = await probe({ url: 'https://no-existe.invalid' })
    expect(r).toMatchObject({ ok: false, state: 'down', statusCode: null })
    expect(r.error).toContain('ENOTFOUND')
  })

  it('abort/timeout → down con mensaje de timeout', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortErr }))
    const r = await probe({ url: 'https://lento.example' })
    expect(r.state).toBe('down')
    expect(r.error).toContain('Timeout')
  })
})

describe('fetchSslExpiry', () => {
  it('devuelve null para URLs no https o inválidas sin abrir sockets', async () => {
    expect(await fetchSslExpiry('http://example.com')).toBeNull()
    expect(await fetchSslExpiry('no es una url')).toBeNull()
  })
})
