import { describe, expect, it } from 'vitest'
import { aplicarHeadersBase, aplicarHeadersPrivados, endurecerPrivada } from '../src/lib/security/private-headers'

describe('endurecerPrivada', () => {
  it('el 302 a /login sale con los headers de ruta privada', () => {
    // Response.redirect devuelve headers inmutables, igual que context.redirect.
    const res = endurecerPrivada(Response.redirect('https://codebymike.net/login?callbackUrl=%2Fentrar', 302), {
      framable: false,
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://codebymike.net/login?callbackUrl=%2Fentrar')
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
  })

  it('conserva cuerpo, estado y los headers que la respuesta ya traía', async () => {
    const original = new Response(JSON.stringify({ error: 'no' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60', 'Cache-Control': 'no-store' },
    })
    const res = endurecerPrivada(original, { framable: false })
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'no' })
  })

  it('el micrófono solo se abre cuando se pide (dictado de Cotiza)', () => {
    const cerrado = new Headers()
    aplicarHeadersBase(cerrado)
    expect(cerrado.get('Permissions-Policy')).toContain('microphone=()')
    const abierto = new Headers()
    aplicarHeadersBase(abierto, { microfono: true })
    expect(abierto.get('Permissions-Policy')).toContain('microphone=(self)')
    expect(abierto.get('Permissions-Policy')).toContain('camera=()')
  })

  it('en rutas enmarcables omite X-Frame-Options y deja frame-ancestors self', () => {
    const h = new Headers()
    aplicarHeadersPrivados(h, { framable: true })
    expect(h.has('X-Frame-Options')).toBe(false)
    expect(h.get('Content-Security-Policy')).toContain("frame-ancestors 'self'")
  })
})
