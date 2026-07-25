import { describe, expect, it } from 'vitest'
import {
  alternateUrls,
  delocalizePath,
  getLocaleFromUrl,
  isLocalizedPrivateRequest,
  isPrivateCanonicalPath,
  localizePath,
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
