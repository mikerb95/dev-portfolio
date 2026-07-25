// Cada guard de seguridad del repo compara contra rutas literales sin
// prefijo de idioma. Este test verifica que, tras pasar por `delocalizePath`
// (lo que hace src/middleware.ts antes de clasificar), CUALQUIER guard da el
// mismo veredicto para "/x" que para "/en/x" — es decir, que normalizar
// primero de verdad neutraliza el prefijo. Ver docs/plan-i18n-en.md §3.
import { describe, expect, it } from 'vitest'
import { delocalizePath, localizePath } from '../src/i18n/routing'
import { isAuthPath, isCobroLinkPath, isPortalAuthPath, isRateLimitablePath } from '../src/lib/security/paths'
import { isDemoBlockedPath } from '../src/lib/demo'
import { isPortalPath, isPortalPublicPath } from '../src/lib/portal/paths'

const GUARDS: Array<{ name: string; fn: (p: string) => boolean }> = [
  { name: 'isAuthPath', fn: isAuthPath },
  { name: 'isCobroLinkPath', fn: isCobroLinkPath },
  { name: 'isPortalAuthPath', fn: isPortalAuthPath },
  { name: 'isRateLimitablePath', fn: isRateLimitablePath },
  { name: 'isDemoBlockedPath', fn: isDemoBlockedPath },
  { name: 'isPortalPath', fn: isPortalPath },
  { name: 'isPortalPublicPath', fn: isPortalPublicPath },
]

const SAMPLE_PATHS = [
  '/login',
  '/entrar',
  '/api/auth/callback',
  '/api/portal/login',
  '/api/portal/reset',
  '/c/AB3K9F',
  '/api/c/AB3K9F/checkout',
  '/portal',
  '/portal/login',
  '/portal/facturas',
  '/api/portal/documentos',
  '/admin',
  '/admin/backup',
  '/api/admin/services/1/secrets',
  '/api/admin/projects/1/envvars',
  '/cobrar',
  '/api/admin/lab/chaos/experiment',
  '/contact',
  '/notes',
  '/_astro/chunk.js',
]

describe('paridad de guards de seguridad: /x vs /en/x tras normalizar', () => {
  for (const { name, fn } of GUARDS) {
    describe(name, () => {
      it.each(SAMPLE_PATHS)('%s da el mismo veredicto normalizado desde /en/...', (path) => {
        const localized = localizePath(path, 'en')
        expect(fn(delocalizePath(localized))).toBe(fn(path))
      })
    })
  }
})

describe('las rutas privadas nunca deben alcanzar un guard vía /en/ sin pasar antes por el 404', () => {
  // Documenta la garantía completa: el middleware corta ANTES de llegar a
  // estos guards cuando la ruta es privada, así que en producción nunca se
  // les pasa un pathname con prefijo. Este test fija esa expectativa: si
  // algún guard cambiara de comportamiento al recibir /en/admin sin
  // normalizar, sería la señal de que alguien quitó la normalización previa.
  it('isDemoBlockedPath sin normalizar SÍ sería ciego a /en/ (por eso el middleware normaliza primero)', () => {
    expect(isDemoBlockedPath('/en/admin/backup')).toBe(false)
    expect(isDemoBlockedPath(delocalizePath('/en/admin/backup'))).toBe(true)
  })
})
