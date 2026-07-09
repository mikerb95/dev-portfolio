import { describe, it, expect } from 'vitest'
import { truncate, hashIp, maskIp } from '../src/lib/security/redact'

describe('truncate', () => {
  it('recorta a la longitud máxima', () => {
    expect(truncate('abcdef', 3)).toBe('abc')
    expect(truncate('ab', 3)).toBe('ab')
  })
  it('propaga null/undefined', () => {
    expect(truncate(null, 5)).toBeNull()
    expect(truncate(undefined, 5)).toBeNull()
  })
})

describe('hashIp', () => {
  it('es estable para la misma IP y salt', () => {
    expect(hashIp('1.2.3.4', 's')).toBe(hashIp('1.2.3.4', 's'))
  })
  it('cambia con el salt (evita reversión por diccionario)', () => {
    expect(hashIp('1.2.3.4', 'a')).not.toBe(hashIp('1.2.3.4', 'b'))
  })
  it('distingue IPs distintas', () => {
    expect(hashIp('1.2.3.4', 's')).not.toBe(hashIp('1.2.3.5', 's'))
  })
  it('devuelve null sin IP y 16 hex con IP', () => {
    expect(hashIp(null)).toBeNull()
    expect(hashIp('9.9.9.9')).toMatch(/^[a-f0-9]{16}$/)
  })
})

describe('maskIp', () => {
  it('IPv4 solo revela el primer octeto', () => {
    expect(maskIp('181.55.20.3')).toBe('181.x.x.x')
  })
  it('IPv6 solo revela el primer grupo', () => {
    expect(maskIp('2001:db8::1')).toBe('2001:…')
  })
  it('valores ausentes o raros no revelan nada', () => {
    expect(maskIp(null)).toBe('desconocida')
    expect(maskIp('no-es-ip')).toBe('oculta')
  })
})
