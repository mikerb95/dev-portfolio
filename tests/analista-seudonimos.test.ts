import { describe, expect, it } from 'vitest'
import { Seudonimos } from '../agents/analista-siem/seudonimos'

describe('Seudonimos del analista del micro-SIEM', () => {
  it('asigna alias estables en orden de aparición', () => {
    const s = new Seudonimos()
    expect(s.alias('203.0.113.7')).toBe('origen-01')
    expect(s.alias('198.51.100.2')).toBe('origen-02')
    expect(s.alias('203.0.113.7')).toBe('origen-01')
  })

  it('resuelve de vuelta solo los alias que emitió', () => {
    const s = new Seudonimos()
    s.alias('203.0.113.7')
    expect(s.ip('origen-01')).toBe('203.0.113.7')
    expect(s.ip(' origen-01 ')).toBe('203.0.113.7')
    // Un alias inventado por el modelo no se puede convertir en un bloqueo.
    expect(s.ip('origen-99')).toBeNull()
    expect(s.ip('203.0.113.7')).toBeNull()
  })

  it('nunca expone la IP en el alias', () => {
    const s = new Seudonimos()
    expect(s.alias('2001:db8::1')).not.toContain('2001')
  })

  it('trata la IP ausente como desconocida sin gastar alias', () => {
    const s = new Seudonimos()
    expect(s.alias(null)).toBe('desconocido')
    expect(s.alias('203.0.113.7')).toBe('origen-01')
  })

  it('en modo en claro el alias es la IP', () => {
    const s = new Seudonimos(true)
    expect(s.alias('203.0.113.7')).toBe('203.0.113.7')
    expect(s.ip('203.0.113.7')).toBe('203.0.113.7')
  })
})
