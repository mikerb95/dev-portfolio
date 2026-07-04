import { describe, it, expect } from 'vitest'
import {
  routeMatches,
  pickChaos,
  isProtectedRoute,
  clampExpiry,
  MAX_TTL_S,
  type ChaosFlag,
} from '../src/lib/chaos'

const flag = (over: Partial<ChaosFlag> = {}): ChaosFlag => ({
  id: 1,
  kind: 'error500',
  targetRoute: '/projects',
  param: null,
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
})

describe('routeMatches', () => {
  it('coincidencia exacta', () => {
    expect(routeMatches('/projects', '/projects')).toBe(true)
    expect(routeMatches('/projects', '/projects/1')).toBe(false)
    expect(routeMatches('/projects', '/about')).toBe(false)
  })

  it('comodín /* cubre la ruta base y sus hijas, no prefijos ajenos', () => {
    expect(routeMatches('/projects/*', '/projects')).toBe(true)
    expect(routeMatches('/projects/*', '/projects/slidehub')).toBe(true)
    expect(routeMatches('/projects/*', '/projects-x')).toBe(false)
  })

  it('comodín simple * es prefijo', () => {
    expect(routeMatches('/api/*', '/api/health')).toBe(true)
    expect(routeMatches('/api/*', '/apix')).toBe(false)
  })
})

describe('isProtectedRoute', () => {
  it('protege admin, api/admin y api/auth (exacto y sub-rutas)', () => {
    expect(isProtectedRoute('/admin')).toBe(true)
    expect(isProtectedRoute('/admin/lab/chaos')).toBe(true)
    expect(isProtectedRoute('/api/admin/monitors')).toBe(true)
    expect(isProtectedRoute('/api/auth/signin')).toBe(true)
  })

  it('no protege rutas públicas', () => {
    expect(isProtectedRoute('/projects')).toBe(false)
    expect(isProtectedRoute('/api/health')).toBe(false)
    expect(isProtectedRoute('/adminis-trador')).toBe(false) // no es sub-ruta real
  })
})

describe('pickChaos', () => {
  it('elige el flag vigente que aplica a la ruta', () => {
    const f = flag({ targetRoute: '/projects/*' })
    expect(pickChaos([f], '/projects/1')?.id).toBe(1)
    expect(pickChaos([f], '/about')).toBeNull()
  })

  it('NUNCA aplica caos a rutas protegidas aunque el flag las apunte', () => {
    const f = flag({ targetRoute: '/admin/*' })
    expect(pickChaos([f], '/admin/lab/chaos')).toBeNull()
    const g = flag({ targetRoute: '/api/auth' })
    expect(pickChaos([g], '/api/auth')).toBeNull()
  })

  it('ignora flags expirados', () => {
    const f = flag({ expiresAt: new Date(Date.now() - 1000) })
    expect(pickChaos([f], '/projects')).toBeNull()
  })

  it('sin flags no hay caos', () => {
    expect(pickChaos([], '/projects')).toBeNull()
  })
})

describe('clampExpiry', () => {
  const now = new Date('2026-07-04T12:00:00Z')

  it('acota el TTL al máximo (15 min)', () => {
    const exp = clampExpiry(99_999, now)
    expect((exp.getTime() - now.getTime()) / 1000).toBe(MAX_TTL_S)
  })

  it('impone un piso de 5s para TTLs inválidos o diminutos', () => {
    expect((clampExpiry(0, now).getTime() - now.getTime()) / 1000).toBe(5)
    expect((clampExpiry(-100, now).getTime() - now.getTime()) / 1000).toBe(5)
  })

  it('respeta un TTL normal', () => {
    expect((clampExpiry(300, now).getTime() - now.getTime()) / 1000).toBe(300)
  })
})
