import { describe, it, expect, vi, beforeEach } from 'vitest'

// La escritura real va a Turso; aquí solo importa a quién se le entrega la
// promesa, no lo que escribe.
const record = vi.fn(() => Promise.resolve())
vi.mock('../src/lib/security/events', () => ({ recordSecurityEvent: record }))

const vercelWaitUntil = vi.fn()
vi.mock('@vercel/functions', () => ({ waitUntil: vercelWaitUntil }))

const { observeRequest, recordEnforcementEvent } = await import('../src/lib/security/sensor')

const headers = () => new Headers({ 'user-agent': 'Mozilla/5.0', 'x-forwarded-for': '203.0.113.7' })

beforeEach(() => {
  record.mockClear()
  vercelWaitUntil.mockReset()
})

describe('sensor: la escritura del evento sobrevive al response', () => {
  it('sin waitUntil explícito usa el de @vercel/functions (el middleware no lo pasa)', () => {
    const c = observeRequest({ method: 'GET', path: '/wp-login.php', headers: headers() })
    expect(c?.category).toBe('honeypot')
    expect(record).toHaveBeenCalledOnce()
    expect(vercelWaitUntil).toHaveBeenCalledWith(record.mock.results[0].value)
  })

  it('un waitUntil explícito tiene prioridad', () => {
    const propio = vi.fn()
    observeRequest({ method: 'GET', path: '/wp-login.php', headers: headers() }, propio)
    expect(propio).toHaveBeenCalledOnce()
    expect(vercelWaitUntil).not.toHaveBeenCalled()
  })

  it('el tráfico legítimo no escribe ni retiene nada', () => {
    expect(observeRequest({ method: 'GET', path: '/', headers: headers() })).toBeNull()
    expect(record).not.toHaveBeenCalled()
    expect(vercelWaitUntil).not.toHaveBeenCalled()
  })

  it('los eventos de enforcement también se retienen', () => {
    recordEnforcementEvent({
      category: 'blocklist',
      severity: 'high',
      ruleId: 'blocklist.hit',
      action: 'blocked',
      method: 'GET',
      path: '/',
      headers: headers(),
      statusCode: 403,
    })
    expect(vercelWaitUntil).toHaveBeenCalledOnce()
  })

  it('fail-open: si waitUntil lanza, el sensor no lanza y la clasificación sale igual', () => {
    vercelWaitUntil.mockImplementation(() => {
      throw new Error('sin contexto')
    })
    expect(() => observeRequest({ method: 'GET', path: '/wp-login.php', headers: headers() })).not.toThrow()
    expect(observeRequest({ method: 'GET', path: '/wp-login.php', headers: headers() })?.category).toBe('honeypot')
  })
})
