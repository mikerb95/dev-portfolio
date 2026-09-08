import { describe, it, expect } from 'vitest'
import { destinoCanonico, HOST_CANONICO } from '../src/lib/canonical-host'

const get = (host: string, pathname = '/', search = '') =>
  destinoCanonico({ host, method: 'GET', pathname, search })

describe('destinoCanonico', () => {
  it('manda el www al desnudo conservando ruta y query', () => {
    expect(get('www.codebymike.net', '/notes/slos', '?ref=x')).toBe(
      'https://codebymike.net/notes/slos?ref=x'
    )
  })

  // El .tech se suspendió el 7 sep 2026: su zona entera resuelve 127.0.0.1, así
  // que ningún request con ese Host llega a Vercel. Se saca de la lista para no
  // sostener la ilusión de que los enlaces viejos siguen vivos; si algún día
  // vuelve a delegarse al proyecto, esto falla y obliga a decidirlo otra vez.
  it('ya no redirige el dominio viejo, que dejó de resolver', () => {
    expect(get('codebymike.tech', '/notes/slos')).toBeNull()
    expect(get('www.codebymike.tech', '/status')).toBeNull()
  })

  it('deja quieto el host canónico', () => {
    expect(get(HOST_CANONICO, '/status')).toBeNull()
  })

  it('recoge el alias fijo del proyecto, que servía una copia indexable', () => {
    expect(get('mikerb95.vercel.app', '/notes')).toBe('https://codebymike.net/notes')
  })

  // Las URL por despliegue las sondea el rollback de ci.yml: redirigirlas sería
  // hacerle creer que la versión nueva responde cuando no la ha visto.
  it('no toca las URL por despliegue ni localhost', () => {
    expect(get('dev-portfolio-abc.vercel.app', '/status')).toBeNull()
    expect(get('localhost:4321', '/status')).toBeNull()
  })

  it('ignora mayúsculas y puerto en el Host', () => {
    expect(get('WWW.CodeByMike.net:443', '/')).toBe('https://codebymike.net/')
  })

  // La razón de ser del módulo: un 308 sobre /api rompe webhooks firmados
  // (POST) y crons con Authorization (la cabecera se cae al cambiar de host).
  it('nunca redirige /api ni los internos de Astro', () => {
    expect(get('www.codebymike.net', '/api/portal/health')).toBeNull()
    expect(get('www.codebymike.net', '/api/cron/uptime-check')).toBeNull()
    expect(get('www.codebymike.net', '/_astro/index.js')).toBeNull()
    expect(get('www.codebymike.net', '/_image', '?href=x')).toBeNull()
  })

  it('no redirige métodos con cuerpo aunque vengan a un host heredado', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(destinoCanonico({ host: 'www.codebymike.net', method, pathname: '/portal/login', search: '' })).toBeNull()
    }
  })

  it('sin Host no inventa destino', () => {
    expect(destinoCanonico({ host: null, method: 'GET', pathname: '/', search: '' })).toBeNull()
  })

  // `/apix` empieza por "/api" pero no es una API: el guard compara prefijo con
  // barra justamente para no tragarse rutas vecinas.
  it('no confunde una ruta que empieza igual que /api', () => {
    expect(get('www.codebymike.net', '/apitest')).toBe('https://codebymike.net/apitest')
  })
})
