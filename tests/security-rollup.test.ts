import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db', () => ({ db: {} }))

import { aggregateByCategory, floorHour, floorDay, type RawEvent } from '../src/lib/security/rollup'

const ev = (over: Partial<RawEvent> = {}): RawEvent => ({
  ip: '1.1.1.1',
  path: '/',
  category: 'recon_cms',
  country: 'US',
  hits: 1,
  ...over,
})

describe('aggregateByCategory', () => {
  it('suma hits por categoría y cuenta IPs únicas', () => {
    const out = aggregateByCategory([
      ev({ category: 'injection', ip: 'a', hits: 3 }),
      ev({ category: 'injection', ip: 'b', hits: 2 }),
      ev({ category: 'injection', ip: 'a', hits: 1 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.count).toBe(6)
    expect(out[0]!.uniqueIps).toBe(2)
  })

  it('elige topPath y topCountry por hits ponderados', () => {
    const [agg] = aggregateByCategory([
      ev({ path: '/a', country: 'CO', hits: 1 }),
      ev({ path: '/b', country: 'RU', hits: 5 }),
      ev({ path: '/a', country: 'CO', hits: 1 }),
    ])
    expect(agg!.topPath).toBe('/b')
    expect(agg!.topCountry).toBe('RU')
  })

  it('separa categorías distintas', () => {
    const out = aggregateByCategory([ev({ category: 'a' }), ev({ category: 'b' })])
    expect(out.map((o) => o.category).sort()).toEqual(['a', 'b'])
  })

  it('trata hits<=0 como 1 (defensa)', () => {
    const [agg] = aggregateByCategory([ev({ hits: 0 }), ev({ hits: -5 })])
    expect(agg!.count).toBe(2)
  })

  it('ignora country nulo para topCountry', () => {
    const [agg] = aggregateByCategory([ev({ country: null }), ev({ country: null })])
    expect(agg!.topCountry).toBeNull()
  })
})

describe('floorHour / floorDay', () => {
  it('trunca a la hora y al día UTC', () => {
    const t = Date.UTC(2026, 6, 9, 14, 37, 12)
    expect(new Date(floorHour(t)).toISOString()).toBe('2026-07-09T14:00:00.000Z')
    expect(new Date(floorDay(t)).toISOString()).toBe('2026-07-09T00:00:00.000Z')
  })
})
