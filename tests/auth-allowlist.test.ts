import { describe, it, expect } from 'vitest'
import { isAllowedGithubId, isAllowedLogin, isRecentAuth, RECENT_AUTH_MS } from '../src/lib/auth'

// El login con GitHub exige id Y login. El id es lo que no cambia: si la
// cuenta se renombra, GitHub libera `mikerb95` y cualquiera puede reclamarlo.
describe('allowlist por id de GitHub', () => {
  it('acepta el id de @mikerb95, como número o como texto', () => {
    expect(isAllowedGithubId(69970540)).toBe(true)
    expect(isAllowedGithubId('69970540')).toBe(true)
  })

  it('rechaza otros ids y la ausencia de id', () => {
    expect(isAllowedGithubId(1)).toBe(false)
    expect(isAllowedGithubId('')).toBe(false)
    expect(isAllowedGithubId(undefined)).toBe(false)
    expect(isAllowedGithubId(null)).toBe(false)
  })

  it('quien reclame el login tras un renombre no entra', () => {
    // Misma cadena de login, cuenta distinta: el login pasa, el id no.
    const intruso = { login: 'mikerb95', id: 123456789 }
    expect(isAllowedLogin(intruso.login)).toBe(true)
    expect(isAllowedGithubId(intruso.id) && isAllowedLogin(intruso.login)).toBe(false)
  })
})

describe('isRecentAuth: login reciente para dar de alta una llave', () => {
  const ahora = Date.parse('2026-09-23T12:00:00Z')

  it('vale dentro de la ventana', () => {
    expect(isRecentAuth(ahora, ahora)).toBe(true)
    expect(isRecentAuth(ahora - RECENT_AUTH_MS + 1_000, ahora)).toBe(true)
  })

  it('no vale pasada la ventana', () => {
    expect(isRecentAuth(ahora - RECENT_AUTH_MS - 1_000, ahora)).toBe(false)
  })

  it('las sesiones anteriores a este cambio no traen authTime y no valen', () => {
    expect(isRecentAuth(undefined, ahora)).toBe(false)
    expect(isRecentAuth(null, ahora)).toBe(false)
    expect(isRecentAuth(String(ahora), ahora)).toBe(false)
    expect(isRecentAuth(Number.NaN, ahora)).toBe(false)
  })

  it('tolera unos segundos de desfase entre instancias, pero no un authTime del futuro', () => {
    expect(isRecentAuth(ahora + 30_000, ahora)).toBe(true)
    expect(isRecentAuth(ahora + 24 * 60 * 60_000, ahora)).toBe(false)
  })
})
