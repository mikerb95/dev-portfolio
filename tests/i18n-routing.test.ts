import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  TRANSLATED_ROUTES,
  alternateUrls,
  delocalizePath,
  getLocaleFromUrl,
  isLocalizedPrivateRequest,
  hasTranslation,
  isPrivateCanonicalPath,
  localizePath,
  localizedHref,
  translatedAlternates,
  untranslatedLocalizedTarget,
} from '../src/i18n/routing'

describe('getLocaleFromUrl', () => {
  it('detecta /en al inicio', () => {
    expect(getLocaleFromUrl('/en')).toBe('en')
    expect(getLocaleFromUrl('/en/')).toBe('en')
    expect(getLocaleFromUrl('/en/contact')).toBe('en')
  })

  it('todo lo demás es español (default)', () => {
    expect(getLocaleFromUrl('/')).toBe('es')
    expect(getLocaleFromUrl('/contact')).toBe('es')
    expect(getLocaleFromUrl('/engineering')).toBe('es')
  })

  it('no confunde un segmento que empieza por "en" con el prefijo', () => {
    expect(getLocaleFromUrl('/english/algo')).toBe('es')
    expect(getLocaleFromUrl('/entrar')).toBe('es')
    expect(getLocaleFromUrl('/enterprise')).toBe('es')
  })

  it('mayúsculas no cuentan como prefijo (case-sensitive, como el filesystem)', () => {
    expect(getLocaleFromUrl('/EN/admin')).toBe('es')
  })
})

describe('delocalizePath', () => {
  it('quita el prefijo /en', () => {
    expect(delocalizePath('/en/contact')).toBe('/contact')
    expect(delocalizePath('/en')).toBe('/')
    expect(delocalizePath('/en/')).toBe('/')
  })

  it('deja igual una ruta sin prefijo', () => {
    expect(delocalizePath('/contact')).toBe('/contact')
    expect(delocalizePath('/')).toBe('/')
  })

  it('colapsa el doble slash que deja /en//admin', () => {
    expect(delocalizePath('/en//admin')).toBe('/admin')
  })

  it('es idempotente (delocalizar dos veces da lo mismo)', () => {
    const once = delocalizePath('/en/notes/algo')
    expect(delocalizePath(once)).toBe(once)
  })
})

describe('localizePath', () => {
  it('español no lleva prefijo', () => {
    expect(localizePath('/contact', 'es')).toBe('/contact')
    expect(localizePath('/en/contact', 'es')).toBe('/contact')
  })

  it('inglés antepone /en', () => {
    expect(localizePath('/contact', 'en')).toBe('/en/contact')
    expect(localizePath('/', 'en')).toBe('/en')
  })

  it('ida y vuelta no acumula prefijos', () => {
    expect(localizePath(localizePath('/tools', 'en'), 'en')).toBe('/en/tools')
  })
})

describe('alternateUrls', () => {
  it('da la URL de cada idioma para la misma página', () => {
    expect(alternateUrls('/en/engineering')).toEqual({ es: '/engineering', en: '/en/engineering' })
    expect(alternateUrls('/engineering')).toEqual({ es: '/engineering', en: '/en/engineering' })
  })

  it('la home usa /en, no /en/', () => {
    expect(alternateUrls('/').en).toBe('/en')
  })
})

describe('isPrivateCanonicalPath', () => {
  it.each(['/admin', '/admin/monitors', '/api', '/api/contact', '/api/admin/security', '/portal', '/portal/login', '/cobrar', '/cobrar/algo', '/login', '/logout', '/entrar', '/docs/presentacion'])(
    '%s es privada',
    (path) => {
      expect(isPrivateCanonicalPath(path)).toBe(true)
    }
  )

  it.each(['/', '/contact', '/engineering', '/notes', '/docs', '/docs/testing', '/c/AB3K9F', '/mis-pagos'])(
    '%s NO es privada',
    (path) => {
      expect(isPrivateCanonicalPath(path)).toBe(false)
    }
  )

  it('no confunde /portada o /adminland con rutas reales', () => {
    expect(isPrivateCanonicalPath('/portada')).toBe(false)
    expect(isPrivateCanonicalPath('/adminland')).toBe(false)
  })
})

describe('isLocalizedPrivateRequest — el guard que corta en el middleware', () => {
  it('bloquea cualquier combinación /en/ + ruta privada', () => {
    expect(isLocalizedPrivateRequest('/en/admin')).toBe(true)
    expect(isLocalizedPrivateRequest('/en/admin/monitors')).toBe(true)
    expect(isLocalizedPrivateRequest('/en/api/contact')).toBe(true)
    expect(isLocalizedPrivateRequest('/en/portal/login')).toBe(true)
    expect(isLocalizedPrivateRequest('/en/cobrar')).toBe(true)
    expect(isLocalizedPrivateRequest('/en/login')).toBe(true)
    expect(isLocalizedPrivateRequest('/en/docs/presentacion')).toBe(true)
  })

  it('no bloquea la ruta privada en español (default locale, sin prefijo)', () => {
    expect(isLocalizedPrivateRequest('/admin')).toBe(false)
    expect(isLocalizedPrivateRequest('/api/contact')).toBe(false)
  })

  it('no bloquea páginas públicas bajo /en/', () => {
    expect(isLocalizedPrivateRequest('/en/contact')).toBe(false)
    expect(isLocalizedPrivateRequest('/en/notes')).toBe(false)
    expect(isLocalizedPrivateRequest('/en')).toBe(false)
  })

  it('casos adversariales: doble slash y variantes que un atacante probaría', () => {
    expect(isLocalizedPrivateRequest('/en//admin')).toBe(true)
    // Mayúsculas no matchean el prefijo -> no es "localizado", así que este
    // guard no aplica (pero tampoco existe una ruta real en /EN/admin: el
    // filesystem de rutas de Astro es case-sensitive).
    expect(isLocalizedPrivateRequest('/EN/admin')).toBe(false)
    expect(isLocalizedPrivateRequest('/english/admin')).toBe(false)
  })
})

// El bug original: nav, footer, hreflang y sitemap generaban `/en/<ruta>` para
// TODA ruta, cuando solo un puñado de páginas tiene versión en inglés. Cada
// enlace de esos era un 404. Estos tests fijan el contrato de "qué existe en
// inglés" y lo cruzan contra el filesystem real.
describe('hasTranslation', () => {
  it('el idioma por defecto siempre existe', () => {
    expect(hasTranslation('/notes', 'es')).toBe(true)
    expect(hasTranslation('/cualquier-cosa', 'es')).toBe(true)
  })

  it('reconoce las páginas que sí están traducidas', () => {
    expect(hasTranslation('/tools', 'en')).toBe(true)
    expect(hasTranslation('/en/tools', 'en')).toBe(true)
    expect(hasTranslation('/', 'en')).toBe(true)
  })

  it('las páginas sin traducir no existen en inglés', () => {
    expect(hasTranslation('/notes', 'en')).toBe(false)
    expect(hasTranslation('/lab', 'en')).toBe(false)
    expect(hasTranslation('/paginas-web', 'en')).toBe(true)
  })
})

describe('localizedHref', () => {
  it('prefija solo lo que existe en inglés', () => {
    expect(localizedHref('/tools', 'en')).toBe('/en/tools')
    expect(localizedHref('/', 'en')).toBe('/en')
  })

  it('cae al español cuando la página no está traducida (nunca un 404)', () => {
    expect(localizedHref('/notes', 'en')).toBe('/notes')
    expect(localizedHref('/lab', 'en')).toBe('/lab')
  })

  it('desde inglés hacia español siempre quita el prefijo', () => {
    expect(localizedHref('/en/tools', 'es')).toBe('/tools')
    expect(localizedHref('/en', 'es')).toBe('/')
  })
})

describe('translatedAlternates', () => {
  it('solo anuncia los idiomas en los que la página existe', () => {
    expect(translatedAlternates('/tools')).toEqual({ es: '/tools', en: '/en/tools' })
    expect(translatedAlternates('/notes')).toEqual({ es: '/notes' })
    expect(translatedAlternates('/en/notes')).toEqual({ es: '/notes' })
  })
})

describe('untranslatedLocalizedTarget', () => {
  it('manda /en/<sin traducir> a la versión en español', () => {
    expect(untranslatedLocalizedTarget('/en/notes')).toBe('/notes')
    expect(untranslatedLocalizedTarget('/en/lab')).toBe('/lab')
  })

  it('no toca las páginas que sí existen en inglés', () => {
    expect(untranslatedLocalizedTarget('/en/tools')).toBeNull()
    expect(untranslatedLocalizedTarget('/en')).toBeNull()
  })

  it('no toca nada sin prefijo de idioma', () => {
    expect(untranslatedLocalizedTarget('/notes')).toBeNull()
  })

  it('las rutas privadas NO se redirigen: siguen siendo 404 seco', () => {
    expect(untranslatedLocalizedTarget('/en/admin')).toBeNull()
    expect(untranslatedLocalizedTarget('/en/api/contact')).toBeNull()
    expect(untranslatedLocalizedTarget('/en//admin')).toBeNull()
  })
})

describe('TRANSLATED_ROUTES contra el filesystem', () => {
  const pagesEn = join(process.cwd(), 'src/pages/en')

  // Ruta canónica -> archivo que la sirve bajo src/pages/en.
  const fileFor = (route: string) => {
    if (route === '/') return 'index.astro'
    const name = route.slice(1)
    return name.includes('.') ? `${name}.ts` : `${name}.astro`
  }

  it('cada ruta declarada tiene su archivo (si no, es un 404 anunciado)', () => {
    for (const route of TRANSLATED_ROUTES) {
      expect(existsSync(join(pagesEn, fileFor(route))), `falta src/pages/en/${fileFor(route)}`).toBe(true)
    }
  })

  it('cada archivo en src/pages/en está declarado (si no, es invisible)', () => {
    const declared = new Set(TRANSLATED_ROUTES.map(fileFor))
    for (const file of readdirSync(pagesEn)) {
      expect(declared.has(file), `src/pages/en/${file} no está en TRANSLATED_ROUTES`).toBe(true)
    }
  })
})
