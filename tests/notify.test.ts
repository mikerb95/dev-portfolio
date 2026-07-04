import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { headerSafe, sendPush, sendEmail } from '../src/lib/notify'

describe('headerSafe (bug del emoji en headers HTTP)', () => {
  it('quita emoji y símbolos que rompen fetch como ByteString', () => {
    expect(headerSafe('🔴 Monitor caído')).toBe(headerSafe('Monitor caído'))
    expect(headerSafe('⚠️ Alerta')).not.toMatch(/⚠/)
  })

  it('conserva acentos re-codificados como latin1 (el receptor los lee UTF-8)', () => {
    const out = headerSafe('Dominio próximo a vencer')
    // Cada char queda en rango 0-255: apto para header HTTP.
    for (const ch of out) expect(ch.charCodeAt(0)).toBeLessThan(256)
    // Decodificado de vuelta como UTF-8 recupera el texto original.
    const bytes = Uint8Array.from(out, (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('Dominio próximo a vencer')
  })

  it('texto ascii plano pasa intacto', () => {
    expect(headerSafe('Deploy OK')).toBe('Deploy OK')
  })

  it('recorta espacios sobrantes tras quitar emoji', () => {
    expect(headerSafe('🚀 despegue')).toBe('despegue')
  })
})

describe('sendPush', () => {
  beforeEach(() => {
    vi.stubEnv('NTFY_TOPIC', 'test-topic')
    vi.stubEnv('NTFY_SERVER', '')
    vi.stubEnv('NTFY_TOKEN', '')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sin NTFY_TOPIC se omite (skipped) sin llamar a la red', async () => {
    vi.stubEnv('NTFY_TOPIC', '')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await sendPush('t', 'm')).toMatchObject({ channel: 'push', ok: false, skipped: true })
    expect(spy).not.toHaveBeenCalled()
  })

  it('envía a ntfy con Title sanitizado (sin emoji)', async () => {
    const spy = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    const r = await sendPush('🔴 Caída detectada', 'El monitor X está caído', { priority: 5, tags: 'rotating_light' })
    expect(r.ok).toBe(true)
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ntfy.sh/test-topic')
    const headers = init.headers as Record<string, string>
    expect(headers.Title).not.toMatch(/🔴/)
    expect(headers.Priority).toBe('5')
    expect(headers.Tags).toBe('rotating_light')
    // El header debe ser un ByteString válido (esto era lo que rompía TODAS las alertas).
    for (const ch of headers.Title) expect(ch.charCodeAt(0)).toBeLessThan(256)
  })

  it('respuesta no-ok de ntfy → error reportado, no excepción', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 429 })))
    expect(await sendPush('t', 'm')).toMatchObject({ ok: false, error: 'ntfy 429' })
  })

  it('fallo de red → error reportado, no excepción', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await sendPush('t', 'm')).toMatchObject({ ok: false, error: 'ECONNREFUSED' })
  })
})

describe('sendEmail', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sin configuración se omite (skipped) sin llamar a la red', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('ALERT_EMAIL_TO', '')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await sendEmail('s', 't')).toMatchObject({ channel: 'email', ok: false, skipped: true })
    expect(spy).not.toHaveBeenCalled()
  })

  it('envía a Resend con múltiples destinatarios separados por coma', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key')
    vi.stubEnv('ALERT_EMAIL_TO', 'a@x.co, b@x.co')
    const spy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    expect((await sendEmail('Asunto', 'Cuerpo')).ok).toBe(true)
    const body = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.to).toEqual(['a@x.co', 'b@x.co'])
    expect(body.subject).toBe('Asunto')
  })
})
