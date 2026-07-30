import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  TRANSLATED_PREFIXES,
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
    expect(hasTranslation('/status', 'en')).toBe(true)
    expect(hasTranslation('/paginas-web', 'en')).toBe(true)
  })

  it('las páginas sin traducir no existen en inglés', () => {
    expect(hasTranslation('/notes', 'en')).toBe(false)
    expect(hasTranslation('/lab', 'en')).toBe(false)
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

  // Ruta canónica -> archivo(s) que podrían servirla bajo src/pages/en. Astro
  // acepta las dos formas: `notes.astro` y `notes/index.astro`.
  const filesFor = (route: string): string[] => {
    if (route === '/') return ['index.astro']
    const name = route.slice(1)
    if (name.includes('.')) return [`${name}.ts`]
    return [`${name}.astro`, join(name, 'index.astro')]
  }

  it('cada ruta declarada tiene su archivo (si no, es un 404 anunciado)', () => {
    for (const route of TRANSLATED_ROUTES) {
      const candidates = filesFor(route)
      const found = candidates.some((f) => existsSync(join(pagesEn, f)))
      expect(found, `falta src/pages/en/${candidates.join(' o ')}`).toBe(true)
    }
  })

  // Los prefijos dinámicos son directorios con una ruta [param] dentro, no
  // archivos: /projects -> src/pages/en/projects/[slug].astro.
  it('cada prefijo dinámico declarado tiene su directorio con una ruta [param]', () => {
    for (const prefix of TRANSLATED_PREFIXES) {
      const dir = join(pagesEn, prefix.slice(1))
      expect(existsSync(dir), `falta el directorio src/pages/en${prefix}`).toBe(true)
      const hasParamRoute = readdirSync(dir).some((f) => f.startsWith('[') && f.endsWith('.astro'))
      expect(hasParamRoute, `src/pages/en${prefix} no tiene una ruta [param].astro`).toBe(true)
    }
  })

  it('cada archivo en src/pages/en está declarado (si no, es invisible)', () => {
    const declared = new Set(TRANSLATED_ROUTES.flatMap(filesFor))
    const declaredDirs = new Set([
      ...TRANSLATED_PREFIXES.map((p) => p.slice(1)),
      // Una ruta declarada como `/notes` puede vivir en `notes/index.astro`:
      // el directorio también cuenta como declarado.
      ...TRANSLATED_ROUTES.filter((r) => r !== '/' && !r.includes('.')).map((r) => r.slice(1)),
    ])
    for (const file of readdirSync(pagesEn)) {
      const ok = declared.has(file) || declaredDirs.has(file)
      expect(ok, `src/pages/en/${file} no está en TRANSLATED_ROUTES ni TRANSLATED_PREFIXES`).toBe(true)
    }
  })
})

describe('hasTranslation con prefijos dinámicos', () => {
  it('cualquier proyecto tiene plantilla en inglés', () => {
    expect(hasTranslation('/projects/dobleyo', 'en')).toBe(true)
    expect(hasTranslation('/en/projects/dobleyo', 'en')).toBe(true)
  })

  it('el prefijo desnudo no cuenta: /projects sin slug no es una página', () => {
    expect(hasTranslation('/projects', 'en')).toBe(false)
    expect(hasTranslation('/projects/', 'en')).toBe(false)
  })

  it('un prefijo parecido no matchea', () => {
    expect(hasTranslation('/projectsss/x', 'en')).toBe(false)
  })
})
