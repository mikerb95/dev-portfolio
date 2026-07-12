import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db', () => ({ db: {} }))

import { selectIpsToBlock, selectBulkBlockIps, type IpCandidate } from '../src/lib/security/autoblock'

const cand = (over: Partial<IpCandidate> = {}): IpCandidate => ({
  ip: '1.2.3.4',
  honeypot: 0,
  high: 0,
  ...over,
})

const base = { highThreshold: 8, alreadyBlocked: new Set<string>() }

describe('selectIpsToBlock', () => {
  it('un honeypot tocado basta para bloquear', () => {
    const out = selectIpsToBlock([cand({ honeypot: 1 })], base)
    expect(out).toHaveLength(1)
    expect(out[0]!.ruleId).toBe('autoblock.honeypot')
  })

  it('bloquea una ráfaga high por encima del umbral', () => {
    const out = selectIpsToBlock([cand({ high: 8 })], base)
    expect(out[0]!.ruleId).toBe('autoblock.high')
  })

  it('no bloquea si high está bajo el umbral', () => {
    expect(selectIpsToBlock([cand({ high: 7 })], base)).toHaveLength(0)
  })

  it('honeypot tiene prioridad sobre el conteo high', () => {
    const out = selectIpsToBlock([cand({ honeypot: 1, high: 100 })], base)
    expect(out[0]!.ruleId).toBe('autoblock.honeypot')
  })

  it('excluye IPs ya bloqueadas', () => {
    const out = selectIpsToBlock([cand({ ip: '9.9.9.9', honeypot: 1 })], {
      ...base,
      alreadyBlocked: new Set(['9.9.9.9']),
    })
    expect(out).toHaveLength(0)
  })

  it('respeta la allowlist', () => {
    const out = selectIpsToBlock([cand({ ip: '10.0.0.1', honeypot: 5 })], {
      ...base,
      allowlisted: (ip) => ip === '10.0.0.1',
    })
    expect(out).toHaveLength(0)
  })

  it('ignora candidatos sin IP', () => {
    expect(selectIpsToBlock([cand({ ip: '', honeypot: 1 })], base)).toHaveLength(0)
  })

  it('procesa varias IPs a la vez', () => {
    const out = selectIpsToBlock(
      [cand({ ip: 'a', honeypot: 1 }), cand({ ip: 'b', high: 10 }), cand({ ip: 'c', high: 1 })],
      base
    )
    expect(out.map((d) => d.ip)).toEqual(['a', 'b'])
  })
})

describe('selectBulkBlockIps', () => {
  const capacity = 500

  it('bloquea todas las IPs sin importar la severidad', () => {
    const out = selectBulkBlockIps(['1.1.1.1', '2.2.2.2', '3.3.3.3'], {
      alreadyBlocked: new Set(),
      capacity,
    })
    expect(out.toApply).toEqual(['1.1.1.1', '2.2.2.2', '3.3.3.3'])
    expect(out.candidates).toBe(3)
    expect(out.skipped).toBe(0)
    expect(out.overflow).toBe(0)
  })

  it('salta las IPs ya bloqueadas (skipped)', () => {
    const out = selectBulkBlockIps(['1.1.1.1', '2.2.2.2'], {
      alreadyBlocked: new Set(['2.2.2.2']),
      capacity,
    })
    expect(out.toApply).toEqual(['1.1.1.1'])
    expect(out.skipped).toBe(1)
  })

  it('excluye la allowlist de los candidatos', () => {
    const out = selectBulkBlockIps(['1.1.1.1', '10.0.0.1'], {
      alreadyBlocked: new Set(),
      capacity,
      allowlisted: (ip) => ip === '10.0.0.1',
    })
    expect(out.toApply).toEqual(['1.1.1.1'])
    expect(out.candidates).toBe(1)
  })

  it('respeta el tope y marca overflow', () => {
    const out = selectBulkBlockIps(['a', 'b', 'c'], { alreadyBlocked: new Set(), capacity: 2 })
    expect(out.toApply).toEqual(['a', 'b'])
    expect(out.overflow).toBe(1)
  })

  it('capacity negativa (tope ya superado) no bloquea nada', () => {
    const out = selectBulkBlockIps(['a', 'b'], { alreadyBlocked: new Set(), capacity: -3 })
    expect(out.toApply).toHaveLength(0)
    expect(out.overflow).toBe(2)
  })

  it('ignora IPs vacías', () => {
    const out = selectBulkBlockIps(['', 'a'], { alreadyBlocked: new Set(), capacity })
    expect(out.toApply).toEqual(['a'])
  })
})
