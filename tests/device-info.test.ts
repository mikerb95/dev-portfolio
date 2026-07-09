import { describe, it, expect } from 'vitest'
import { clientIp, describeDevice } from '../src/lib/device-info'

const h = (init: Record<string, string>) => new Headers(init)

describe('clientIp', () => {
  it('toma la primera IP de x-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' }))).toBe('203.0.113.5')
  })

  it('recorta espacios', () => {
    expect(clientIp(h({ 'x-forwarded-for': '  203.0.113.5  ' }))).toBe('203.0.113.5')
  })

  it('cae a x-real-ip si no hay x-forwarded-for', () => {
    expect(clientIp(h({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('devuelve null sin headers de IP', () => {
    expect(clientIp(h({}))).toBeNull()
  })
})

describe('describeDevice', () => {
  it('sin User-Agent devuelve desconocido', () => {
    expect(describeDevice(null)).toBe('Dispositivo desconocido')
    expect(describeDevice(undefined)).toBe('Dispositivo desconocido')
  })

  it('Chrome en Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    expect(describeDevice(ua)).toBe('Chrome · Windows')
  })

  it('Safari en iOS (iPhone)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(describeDevice(ua)).toBe('Safari · iOS')
  })

  it('Edge se distingue de Chrome', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0'
    expect(describeDevice(ua)).toBe('Edge · Windows')
  })

  it('Firefox en macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
    expect(describeDevice(ua)).toBe('Firefox · macOS')
  })

  it('Chrome en Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
    expect(describeDevice(ua)).toBe('Chrome · Android')
  })
})
