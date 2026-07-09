import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db', () => ({ db: {} }))

import { escalatedTtlSec, BLOCK_TTL_STEPS_SEC } from '../src/lib/security/blocklist'
import { isRateLimitablePath, isAuthPath } from '../src/lib/security/paths'

describe('escalatedTtlSec · escalado por reincidencia', () => {
  it('primer bloqueo = 1h, segundo = 24h, tercero = 7d', () => {
    expect(escalatedTtlSec(0)).toBe(3600)
    expect(escalatedTtlSec(1)).toBe(86_400)
    expect(escalatedTtlSec(2)).toBe(604_800)
  })
  it('reincidencias posteriores se mantienen en el máximo (7d)', () => {
    expect(escalatedTtlSec(5)).toBe(BLOCK_TTL_STEPS_SEC[BLOCK_TTL_STEPS_SEC.length - 1])
  })
  it('valores negativos se tratan como primer bloqueo', () => {
    expect(escalatedTtlSec(-3)).toBe(3600)
  })
})

describe('isRateLimitablePath · excluye assets', () => {
  it('cuenta páginas y APIs dinámicas', () => {
    for (const p of ['/', '/projects', '/api/contact', '/notes/x']) expect(isRateLimitablePath(p)).toBe(true)
  })
  it('ignora assets estáticos y del bundle', () => {
    for (const p of ['/_astro/index.abc.js', '/favicon.svg', '/fonts/inter.woff2', '/robots.txt', '/og.png'])
      expect(isRateLimitablePath(p)).toBe(false)
  })
})

describe('isAuthPath', () => {
  it('reconoce rutas de autenticación', () => {
    expect(isAuthPath('/api/auth/callback/github')).toBe(true)
    expect(isAuthPath('/login')).toBe(true)
    expect(isAuthPath('/entrar')).toBe(true)
  })
  it('no marca rutas normales', () => {
    expect(isAuthPath('/projects')).toBe(false)
    expect(isAuthPath('/api/contact')).toBe(false)
  })
})
