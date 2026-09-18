import { describe, it, expect, vi } from 'vitest'

// `runInDemoContext` no abre nada si la demo no está configurada (es la primera
// defensa: sin base de demo, no hay demo). Para poder ejercitar el contexto
// hace falta que la variable exista ANTES de importar el módulo; la URL no se
// llega a abrir porque estos tests no consultan nada.
process.env.TURSO_DEMO_URL = 'file:/tmp/contexto-recarga-no-se-abre.db'

// El aislamiento de la demo y el modo respaldo del portal se sostienen sobre un
// AsyncLocalStorage: el middleware abre el contexto y las consultas lo leen.
// Si ese almacén vive en el módulo, basta con que el módulo se evalúe DOS veces
// (el dev server lo hace cada vez que se toca el archivo) para que el que abre
// el contexto y el que lo lee sean objetos distintos. Entonces la lectura no ve
// store y cae al camino por defecto: la base REAL.
//
// Pasó de verdad: en septiembre de 2026, /admin con pase de demo pintó
// proyectos e ingresos de la base principal mientras otra sesión editaba
// fuentes, y no hubo un solo error en ningún log. Reproducido 20 de 20 veces
// tocando src/db/index.ts con `astro dev` arriba.
//
// `vi.resetModules()` reproduce exactamente esa recarga sin necesitar navegador.
describe('contextos que sobreviven a una recarga de módulo', () => {
  it('el contexto de demo abierto por una copia lo ve la otra', async () => {
    const primera = await import('../src/db')
    vi.resetModules()
    const segunda = await import('../src/db')

    // La prueba de que son copias distintas: si fueran el mismo módulo, esto
    // no probaría nada. Se comparan las funciones y no los namespaces enteros
    // porque el export `db` es un Proxy que abriría la base real al tocarlo.
    expect(segunda.inDemoContext).not.toBe(primera.inDemoContext)
    expect(primera.runInDemoContext(() => segunda.inDemoContext())).toBe(true)
    expect(segunda.runInDemoContext(() => primera.inDemoContext())).toBe(true)
  })

  it('fuera del contexto sigue diciendo que no', async () => {
    const { inDemoContext } = await import('../src/db')
    expect(inDemoContext()).toBe(false)
  })

  it('el modo respaldo del portal aguanta lo mismo', async () => {
    const primera = await import('../src/lib/portal/respaldo')
    vi.resetModules()
    const segunda = await import('../src/lib/portal/respaldo')

    expect(segunda.enRespaldo).not.toBe(primera.enRespaldo)
    expect(primera.runInRespaldoContext(() => segunda.enRespaldo())).toBe(true)
    expect(segunda.enRespaldo()).toBe(false)
  })
})
