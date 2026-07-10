import { describe, it, expect } from 'vitest'
import { honeypotDelayMs, serveHoneypot } from '../src/lib/security/honeypot'

describe('honeypotDelayMs · tarpit acotado', () => {
  it('rand=0 da el mínimo (800ms)', () => {
    expect(honeypotDelayMs(() => 0)).toBe(800)
  })
  it('rand≈1 se queda por debajo del máximo (2000ms)', () => {
    const d = honeypotDelayMs(() => 0.999999)
    expect(d).toBeGreaterThanOrEqual(800)
    expect(d).toBeLessThan(2000)
  })
  it('siempre dentro de [800, 2000)', () => {
    for (const r of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const d = honeypotDelayMs(() => r)
      expect(d).toBeGreaterThanOrEqual(800)
      expect(d).toBeLessThan(2000)
    }
  })
})

describe('serveHoneypot · respuestas plausibles', () => {
  it("apitoken → 401 JSON de token inválido", async () => {
    const res = await serveHoneypot('apitoken')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body.error).toBe('invalid_token')
  })
  it('wp → 200 HTML con formulario de login', async () => {
    const res = await serveHoneypot('wp')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('loginform')
  })
  it('admin → 200 HTML', async () => {
    const res = await serveHoneypot('admin')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Sign in')
  })
  it('no expone headers que delaten la trampa', async () => {
    const res = await serveHoneypot('wp')
    expect(res.headers.get('x-honeypot')).toBeNull()
  })
})
