import { describe, it, expect } from 'vitest'
import { delocalizePath } from '../src/i18n/routing'
import { withoutTrailingSlash } from '../src/lib/security/paths'

// La ruta canónica del middleware es `withoutTrailingSlash(delocalizePath(p))`.
// Los guards exactos (el deck privado, el escenario de la sustentación) solo
// son seguros si las dos formas que Astro sirve para una misma página llegan
// a ellos idénticas. `/docs/presentacion/` servía el deck a cualquiera.
const canonica = (p: string) => withoutTrailingSlash(delocalizePath(p))

describe('withoutTrailingSlash', () => {
  it('quita la barra final, una o varias', () => {
    expect(withoutTrailingSlash('/docs/presentacion/')).toBe('/docs/presentacion')
    expect(withoutTrailingSlash('/sustentacion//')).toBe('/sustentacion')
    expect(withoutTrailingSlash('/admin/')).toBe('/admin')
  })

  it('deja la raíz y las rutas sin barra como están', () => {
    expect(withoutTrailingSlash('/')).toBe('/')
    expect(withoutTrailingSlash('//')).toBe('/')
    expect(withoutTrailingSlash('/docs/presentacion')).toBe('/docs/presentacion')
  })
})

describe('ruta canónica del middleware', () => {
  it('las dos formas de una ruta privada exacta llegan iguales al guard', () => {
    for (const ruta of ['/docs/presentacion', '/sustentacion', '/cobrar']) {
      expect(canonica(`${ruta}/`), ruta).toBe(ruta)
      expect(canonica(`/en${ruta}/`), `/en${ruta}/`).toBe(ruta)
    }
  })

  it('el mando público /remote no se convierte en /remote/<algo>', () => {
    // `startsWith('/remote/')` es el gate del control de presentaciones; el
    // mando de /final.html con barra final tiene que quedar fuera de él.
    expect(canonica('/remote/').startsWith('/remote/')).toBe(false)
    expect(canonica('/remote/abc123/').startsWith('/remote/')).toBe(true)
  })
})
