import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crearRastreador } from '../src/lib/fallback/rastreador'
import { proyectosInstantanea, capturadaEn, antiguedadEnDias } from '../src/lib/fallback/instantanea'
import { origenPublico, DESTINOS_RESPALDO } from '../src/data/respaldo-monitores'

describe('rastreador de degradación', () => {
  it('devuelve el dato vivo y no marca degradación cuando la consulta funciona', async () => {
    const r = crearRastreador()
    const v = await r.q(async () => ['vivo'], ['respaldo'], 'x')
    expect(v).toEqual(['vivo'])
    expect(r.degradado).toBe(false)
    expect(r.fallos).toEqual([])
  })

  it('devuelve el respaldo y marca degradación cuando la consulta lanza', async () => {
    const r = crearRastreador()
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    const v = await r.q(async () => { throw new Error('BLOCKED') }, ['respaldo'], 'proyectos')
    expect(v).toEqual(['respaldo'])
    expect(r.degradado).toBe(true)
    expect(r.fallos).toEqual(['proyectos'])
    // Degradar en la cara del visitante no es degradar en silencio para quien opera.
    expect(espia).toHaveBeenCalled()
    espia.mockRestore()
  })

  it('acumula las etiquetas de todas las consultas que fallaron', async () => {
    const r = crearRastreador()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await r.q(async () => { throw new Error('x') }, null, 'a')
    await r.q(async () => 1, null, 'b')
    await r.q(async () => { throw new Error('x') }, null, 'c')
    expect(r.fallos).toEqual(['a', 'c'])
    vi.restoreAllMocks()
  })

  // La razón de ser del rastreador: con Fluid Compute la misma instancia
  // serverless atiende requests concurrentes, así que un contador de módulo
  // marcaría como degradada la página de un visitante por el fallo de otro.
  it('dos rastreadores no comparten estado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = crearRastreador()
    const b = crearRastreador()
    await a.q(async () => { throw new Error('x') }, null, 'solo-a')
    await b.q(async () => 'ok', null, 'solo-b')
    expect(a.degradado).toBe(true)
    expect(b.degradado).toBe(false)
    vi.restoreAllMocks()
  })

  it('no traga el respaldo cuando el respaldo mismo es falsy', async () => {
    const r = crearRastreador()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await r.q(async () => { throw new Error('x') }, 0, 'cero')).toBe(0)
    expect(await r.q(async () => { throw new Error('x') }, '', 'vacio')).toBe('')
    vi.restoreAllMocks()
  })
})

describe('instantánea de datos reales', () => {
  it('trae proyectos con los campos que pinta la tarjeta', () => {
    expect(proyectosInstantanea.length).toBeGreaterThan(0)
    for (const p of proyectosInstantanea) {
      expect(typeof p.slug).toBe('string')
      expect(p.slug.length).toBeGreaterThan(0)
      expect(typeof p.title).toBe('string')
      expect(p.title.length).toBeGreaterThan(0)
      // Los opcionales pueden faltar, pero nunca ser `undefined`: la tarjeta
      // los pasa como props y `undefined` se renderiza distinto que `null`.
      expect(p.description === null || typeof p.description === 'string').toBe(true)
      expect(p.screenshotUrl === null || typeof p.screenshotUrl === 'string').toBe(true)
    }
  })

  it('no filtra campos privados al bundle público', () => {
    // La instantánea acaba embebida en el JS que se sirve al mundo. Un campo
    // interno aquí es una fuga, no un detalle.
    const prohibidos = ['internalNotes', 'internal_notes', 'cost', 'secrets', 'email', 'phone']
    for (const p of proyectosInstantanea as unknown as Record<string, unknown>[]) {
      for (const campo of prohibidos) expect(p[campo]).toBeUndefined()
    }
  })

  it('no tiene slugs repetidos', () => {
    const slugs = proyectosInstantanea.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('registra cuándo fue capturada', () => {
    const d = capturadaEn()
    expect(d).toBeInstanceOf(Date)
    expect(antiguedadEnDias(d!.getTime() + 3 * 86_400_000)).toBe(3)
  })
})

describe('destinos de respaldo', () => {
  const original = process.env.PUBLIC_SITE_URL

  afterEach(() => {
    if (original === undefined) delete process.env.PUBLIC_SITE_URL
    else process.env.PUBLIC_SITE_URL = original
  })

  it('normaliza el origen a una URL absoluta sin barra final', () => {
    process.env.PUBLIC_SITE_URL = 'ejemplo.test/'
    expect(origenPublico()).toBe('https://ejemplo.test')
    process.env.PUBLIC_SITE_URL = 'https://ejemplo.test/'
    expect(origenPublico()).toBe('https://ejemplo.test')
  })

  it('los destinos son rutas relativas, nunca URLs absolutas', () => {
    // Si una ruta trajera su propio host, el sondeo mediría otro sitio que el
    // del despliegue actual y la página de estado mentiría en los previews.
    for (const d of DESTINOS_RESPALDO) {
      expect(d.ruta.startsWith('/')).toBe(true)
      expect(d.ruta).not.toMatch(/^https?:/)
      expect(d.umbralMs).toBeGreaterThan(0)
    }
  })

  it('no repite ids entre destinos', () => {
    const ids = DESTINOS_RESPALDO.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('el monitor del portal conserva los parámetros con que se da de alta', () => {
    // Copiado de scripts/register-portal-monitor.mjs: si allí cambian, aquí se
    // estaría sondeando otra cosa que la que /status muestra en condiciones
    // normales, y la página diría dos verdades distintas según el día.
    const portal = DESTINOS_RESPALDO.find((d) => d.ruta === '/api/portal/health')
    expect(portal).toBeDefined()
    expect(portal!.textoEsperado).toBe('"ok":true')
    expect(portal!.umbralMs).toBe(2000)
  })

  it('los destinos marcados como dependientes de la base existen en la lista', () => {
    // Un id marcado que ya no se sondea dejaría la nota explicativa muerta.
    const ids = new Set(DESTINOS_RESPALDO.map((d) => d.id))
    for (const id of DEPENDEN_DE_LA_BASE) expect(ids.has(id)).toBe(true)
  })
})

describe('sondeo en vivo', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mide cada destino y devuelve su estado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const { sondearEnVivo } = await import('../src/lib/fallback/sondeo-vivo')
    const r = await sondearEnVivo()
    expect(r).toHaveLength(DESTINOS_RESPALDO.length)
    for (const m of r) {
      expect(m.lastStatus === 'up' || m.lastStatus === 'degraded').toBe(true)
      expect(typeof m.lastResponseMs).toBe('number')
      expect(m.lastCheckedAt).toBeInstanceOf(Date)
    }
  })

  it('reporta un destino que no responde como caído, sin lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const { sondearEnVivo } = await import('../src/lib/fallback/sondeo-vivo')
    const r = await sondearEnVivo()
    expect(r).toHaveLength(DESTINOS_RESPALDO.length)
    // Una página de estado que se cae porque el sitio está caído no sirve.
    expect(r.every((m) => m.lastStatus === 'down')).toBe(true)
  })

  it('un 500 cuenta como caída aunque la petición no falle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    const { sondearEnVivo } = await import('../src/lib/fallback/sondeo-vivo')
    const r = await sondearEnVivo()
    expect(r.every((m) => m.lastStatus === 'down')).toBe(true)
  })
})
