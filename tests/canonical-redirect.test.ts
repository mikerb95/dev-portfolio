import { describe, it, expect } from 'vitest'
// @ts-expect-error - integración en .mjs sin tipos
import { inyectaRedirects } from '../integrations/canonical-redirect.mjs'
import { HOST_CANONICO } from '../src/lib/canonical-host'

type Ruta = Record<string, unknown>
const configBase = (): { routes: Ruta[] } => ({
  routes: [
    { src: '^/algo$', headers: { 'X-Test': '1' }, continue: true },
    { handle: 'filesystem' },
    { src: '/.*', dest: '/_render' },
  ],
})

// Una regla del borde solo sirve si el propio borde la aplicaría igual. Se
// evalúa el `src` tal cual, que es lo que Vercel compila.
const aplica = (ruta: Ruta, pathname: string) => new RegExp(ruta.src as string).test(pathname)

describe('inyectaRedirects (redirect del dominio viejo en el CDN)', () => {
  it('mete las rutas ANTES de handle:filesystem, que es donde el borde sirve el archivo estático', () => {
    const config = configBase()
    const n = inyectaRedirects(config)
    const iFs = config.routes.findIndex((r) => r.handle === 'filesystem')
    const redirects = config.routes.filter((r) => r.status === 308)

    expect(n).toBe(3)
    expect(redirects).toHaveLength(3)
    for (const r of redirects) expect(config.routes.indexOf(r)).toBeLessThan(iFs)
  })

  it('cada host heredado apunta al canónico conservando la ruta', () => {
    const config = configBase()
    inyectaRedirects(config)
    const hosts = config.routes.filter((r) => r.status === 308).map((r) => (r.has as { value: string }[])[0].value)

    expect(hosts.sort()).toEqual(
      ['codebymike\\.tech', 'www\\.codebymike\\.net', 'www\\.codebymike\\.tech'].sort()
    )
    for (const r of config.routes.filter((x) => x.status === 308)) {
      expect((r.headers as { Location: string }).Location).toBe(`https://${HOST_CANONICO}$1`)
    }
  })

  // El agujero que motivó esta integración: /docs y compañía son archivos que
  // sirve el CDN sin invocar jamás la función, así que el middleware no los ve.
  it('alcanza las páginas prerenderizadas y deja fuera /api y los internos', () => {
    const config = configBase()
    inyectaRedirects(config)
    const ruta = config.routes.find((r) => r.status === 308)!

    for (const p of ['/', '/docs', '/notes/slos', '/pay', '/cv/descargar']) {
      expect(aplica(ruta, p), `debería redirigir ${p}`).toBe(true)
    }
    for (const p of ['/api/payments/webhook', '/api/cron/uptime-check', '/_astro/index.js', '/_image']) {
      expect(aplica(ruta, p), `NO debería redirigir ${p}`).toBe(false)
    }
  })

  it('rompe el build si el adaptador deja de emitir handle:filesystem', () => {
    expect(() => inyectaRedirects({ routes: [{ src: '/.*', dest: '/_render' }] })).toThrow(/filesystem/)
    expect(() => inyectaRedirects({})).toThrow(/filesystem/)
  })
})
