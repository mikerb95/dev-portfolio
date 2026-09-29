import { describe, expect, it } from 'vitest'
import {
  entornoAislado,
  exigirApiKey,
  FuenteIncorrecta,
  SinApiKey,
  verificarFuente,
} from '../agents/analista-siem/credencial'

describe('credencial del analista del micro-SIEM', () => {
  it('sin API key no arranca', () => {
    expect(() => exigirApiKey(undefined)).toThrow(SinApiKey)
    expect(() => exigirApiKey('')).toThrow(SinApiKey)
    expect(() => exigirApiKey('   ')).toThrow(SinApiKey)
  })

  it('rechaza valores que no tienen forma de API key de Claude Platform', () => {
    expect(() => exigirApiKey('sk-proj-abc')).toThrow(SinApiKey)
    expect(exigirApiKey('  sk-ant-api03-prueba  ')).toBe('sk-ant-api03-prueba')
  })

  it('solo acepta que la SDK arranque con la API key', () => {
    expect(() => verificarFuente('ANTHROPIC_API_KEY')).not.toThrow()
    // Lo que pasó en las primeras corridas: el login de claude.ai.
    for (const otra of ['oauth', '/login managed key', 'none', 'user', undefined]) {
      expect(() => verificarFuente(otra)).toThrow(FuenteIncorrecta)
    }
  })

  it('el subproceso no hereda credenciales del sitio ni otras vías de pago', () => {
    const env = entornoAislado(
      {
        PATH: '/usr/bin',
        HOME: '/home/x',
        TURSO_AUTH_TOKEN: 'secreto',
        ENCRYPTION_KEY: 'secreto',
        ANTHROPIC_AUTH_TOKEN: 'otro',
        CLAUDE_CODE_OAUTH_TOKEN: 'cuenta-personal',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_CONFIG_DIR: '/home/x/.claude',
      },
      { apiKey: 'sk-ant-api03-prueba', configDir: '/tmp/vacio', clavesDelSitio: new Set(['ENCRYPTION_KEY']) }
    )
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/x',
      ANTHROPIC_API_KEY: 'sk-ant-api03-prueba',
      CLAUDE_CONFIG_DIR: '/tmp/vacio',
    })
  })
})
