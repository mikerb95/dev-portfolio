import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  extractDomain,
  fetchDomainExpiry,
  daysUntil,
  domainAlertState,
} from '../src/lib/domains'

describe('extractDomain', () => {
  it('extrae el dominio registrable de URLs completas', () => {
    expect(extractDomain('https://codebymike.tech/about?x=1')).toBe('codebymike.tech')
    expect(extractDomain('http://www.dobleyo.cafe:8080/menu')).toBe('dobleyo.cafe')
  })

  it('maneja texto libre con el dominio adentro', () => {
    expect(extractDomain('Dominio codebymike.tech (Namecheap)')).toBe('codebymike.tech')
  })

  it('reduce subdominios al eTLD+1', () => {
    expect(extractDomain('app.staging.example.com')).toBe('example.com')
  })

  it('respeta sufijos de dos niveles (com.co, co.uk, …)', () => {
    expect(extractDomain('tienda.miempresa.com.co')).toBe('miempresa.com.co')
    expect(extractDomain('shop.brand.co.uk')).toBe('brand.co.uk')
  })

  it('devuelve null si no hay nada con pinta de dominio', () => {
    expect(extractDomain(null)).toBeNull()
    expect(extractDomain('')).toBeNull()
    expect(extractDomain('solo texto sin puntos')).toBeNull()
  })
})

describe('daysUntil / domainAlertState (umbrales de vencimiento)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-03T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000)

  it('clasifica según días restantes', () => {
    expect(domainAlertState(inDays(-1))).toBe('overdue')
    expect(domainAlertState(inDays(3))).toBe('critical')
    expect(domainAlertState(inDays(15))).toBe('soon')
    expect(domainAlertState(inDays(187))).toBe('ok')
    expect(domainAlertState(null)).toBeNull()
  })

  it('bordes exactos: 7d es crítico, 30d es próximo', () => {
    expect(domainAlertState(inDays(7))).toBe('critical')
    expect(domainAlertState(inDays(30))).toBe('soon')
    expect(domainAlertState(inDays(30.01))).toBe('ok')
  })

  it('daysUntil es independiente de la zona horaria (usa epoch UTC)', () => {
    // La misma fecha absoluta da los mismos días sin importar cómo se construyó:
    // un vencimiento a medianoche UTC vs. la misma medianoche expresada en -05:00.
    const utc = new Date('2026-07-10T00:00:00Z')
    const bogota = new Date('2026-07-09T19:00:00-05:00')
    expect(daysUntil(utc)).toBeCloseTo(daysUntil(bogota), 10)
    expect(daysUntil(utc)).toBeCloseTo(6.5, 5)
  })

  it('clock skew: un desfase de +10 min no cambia la clasificación lejos del borde', () => {
    const expiry = inDays(15)
    vi.setSystemTime(new Date(Date.now() + 10 * 60_000)) // el server se adelanta 10 min
    expect(domainAlertState(expiry)).toBe('soon')
  })
})

describe('fetchDomainExpiry (RDAP, fetch mockeado)', () => {
  afterEach(() => vi.unstubAllGlobals())

  const rdapResponse = (events: unknown) =>
    new Response(JSON.stringify({ events }), { status: 200 })

  it('lee la fecha del evento expiration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      rdapResponse([
        { eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' },
        { eventAction: 'expiration', eventDate: '2027-01-07T05:00:00Z' },
      ]),
    ))
    const d = await fetchDomainExpiry('https://codebymike.tech')
    expect(d?.toISOString()).toBe('2027-01-07T05:00:00.000Z')
  })

  it('devuelve null si RDAP responde error, sin eventos o con fecha inválida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    expect(await fetchDomainExpiry('codebymike.tech')).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => rdapResponse([])))
    expect(await fetchDomainExpiry('codebymike.tech')).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () =>
      rdapResponse([{ eventAction: 'expiration', eventDate: 'no-es-fecha' }]),
    ))
    expect(await fetchDomainExpiry('codebymike.tech')).toBeNull()
  })

  it('devuelve null si la red falla (nunca lanza)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await fetchDomainExpiry('codebymike.tech')).toBeNull()
  })

  it('devuelve null sin llamar a la red si el input no tiene dominio', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await fetchDomainExpiry('sin dominio')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})
