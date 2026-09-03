import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El build de Astro importa el middleware para prerenderizar /docs/* y
// /architecture, y el middleware importa `src/db`. Si ese import abre el
// cliente de libSQL, un entorno sin credenciales (GitHub Actions) no puede
// construir aunque ninguna página prerenderizada consulte nada: es justo lo
// que rompió el CI 59 corridas seguidas desde el 24 ago 2026 (prerender de
// /architecture → LibsqlError: URL_INVALID: The URL 'undefined').
describe('src/db se puede importar sin credenciales', () => {
  const guardadas = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    for (const k of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'TURSO_DEMO_URL', 'TURSO_DEMO_AUTH_TOKEN']) {
      delete process.env[k]
    }
  })

  afterEach(() => {
    process.env = { ...guardadas }
  })

  it('no lanza al importar el módulo sin TURSO_DATABASE_URL', async () => {
    await expect(import('../src/db')).resolves.toBeDefined()
  })

  it('deja el fallo para quien de verdad consulta, no para quien importa', async () => {
    const { db } = await import('../src/db')
    // Tocar el proxy es lo que construye el cliente; sin URL válida, eso sí
    // debe fallar. El fail-open del middleware es quien atrapa este error.
    expect(() => db.select()).toThrow()
  })

  it('reporta la demo como no disponible en vez de intentar abrirla', async () => {
    const { demoAvailable, runInDemoContext } = await import('../src/db')
    expect(demoAvailable).toBe(false)
    // Sin base de demo, el contexto es un no-op: nunca redirige a la real.
    expect(runInDemoContext(() => 'ejecutado')).toBe('ejecutado')
  })
})
