import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { DOCS_PAGINAS, DOCS_PAGINAS_EXCLUIDAS, docsSitemapPaths } from '../src/data/docs-paginas'

const enDisco = readdirSync(new URL('../src/pages/docs', import.meta.url))
  .filter((n) => n.endsWith('.astro'))
  .map((n) => n.replace(/\.astro$/, ''))

const indice = readFileSync(new URL('../src/pages/docs/index.astro', import.meta.url), 'utf8')
const hrefsDelIndice = new Set(
  [...indice.matchAll(/href: '\/docs\/([a-z0-9-]+)'/g)].map((m) => m[1]),
)

describe('páginas de /docs', () => {
  // Cruce contra el disco: si mañana alguien añade src/pages/docs/algo.astro y
  // no lo registra, este test falla antes de que la página quede huérfana - sin
  // pestaña, sin tarjeta en el índice y sin anunciarse a los buscadores.
  it('registra todas las páginas que existen en disco', () => {
    const registradas = new Set([...DOCS_PAGINAS.map((p) => p.slug), ...Object.keys(DOCS_PAGINAS_EXCLUIDAS)])
    const huerfanas = enDisco.filter((s) => !registradas.has(s))
    expect(huerfanas, 'sin registrar en src/data/docs-paginas.ts').toEqual([])
  })

  it('no registra páginas que ya no existen', () => {
    const disco = new Set(enDisco)
    const fantasmas = [...DOCS_PAGINAS.map((p) => p.slug), ...Object.keys(DOCS_PAGINAS_EXCLUIDAS)].filter(
      (s) => !disco.has(s),
    )
    expect(fantasmas, 'registradas pero sin archivo').toEqual([])
  })

  it('da una razón por cada página excluida', () => {
    for (const [slug, motivo] of Object.entries(DOCS_PAGINAS_EXCLUIDAS)) {
      expect(motivo.trim().length, `${slug} sin motivo`).toBeGreaterThan(20)
    }
  })

  it('enlaza toda página indexable desde el índice de /docs', () => {
    const sinTarjeta = DOCS_PAGINAS.filter((p) => p.indexable && !hrefsDelIndice.has(p.slug)).map((p) => p.slug)
    expect(sinTarjeta, 'sin tarjeta en el mapa de la documentación').toEqual([])
  })

  it('no enlaza desde el índice ninguna página que no exista', () => {
    const disco = new Set(enDisco)
    expect([...hrefsDelIndice].filter((s) => !disco.has(s))).toEqual([])
  })
})

describe('sitemap de /docs', () => {
  it('anuncia la portada y todas las subpáginas indexables', () => {
    const paths = docsSitemapPaths()
    expect(paths[0]).toBe('/docs')
    expect(paths).toHaveLength(1 + DOCS_PAGINAS.filter((p) => p.indexable).length)
    expect(new Set(paths).size, 'rutas repetidas').toBe(paths.length)
  })

  it('nunca anuncia el deck privado ni la versión imprimible', () => {
    // /docs/presentacion da 404 sin sesión: anunciarlo mandaría a los
    // buscadores a una puerta cerrada. La imprimible repetiría el mismo texto.
    const paths = docsSitemapPaths()
    for (const slug of Object.keys(DOCS_PAGINAS_EXCLUIDAS)) {
      if (slug === 'index') continue
      expect(paths).not.toContain(`/docs/${slug}`)
    }
  })
})
