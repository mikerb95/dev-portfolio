import { describe, it, expect } from 'vitest'
import { isLocalDbUrl } from '../src/lib/db-target'

// El guardarraíl que impide que una prueba de carga lea de la Turso real. Lo
// importante de estos casos no es el camino feliz: es que cualquier cosa rara
// caiga del lado "remoto", porque el error en ese sentido solo aborta una
// prueba, y en el contrario quema la cuota de producción.
describe('isLocalDbUrl', () => {
  it('acepta la sqld local de compose.yaml', () => {
    expect(isLocalDbUrl('http://127.0.0.1:8080')).toBe(true)
    expect(isLocalDbUrl('http://localhost:8081')).toBe(true)
    expect(isLocalDbUrl('ws://127.0.0.1:8080')).toBe(true)
  })

  it('acepta bases de archivo y en memoria', () => {
    expect(isLocalDbUrl('file:/tmp/test.db')).toBe(true)
    expect(isLocalDbUrl(':memory:')).toBe(true)
    expect(isLocalDbUrl('/var/data/local.db')).toBe(true)
  })

  it('rechaza Turso', () => {
    expect(isLocalDbUrl('libsql://dev-portfolio-mikerb95.aws-us-east-1.turso.io')).toBe(false)
    expect(isLocalDbUrl('libsql://portfolio-demo-mikerb95.aws-us-east-1.turso.io')).toBe(false)
  })

  it('ante la duda dice remota', () => {
    expect(isLocalDbUrl(undefined)).toBe(false)
    expect(isLocalDbUrl(null)).toBe(false)
    expect(isLocalDbUrl('')).toBe(false)
    expect(isLocalDbUrl('no es una url')).toBe(false)
  })

  it('no se deja engañar por un host que solo CONTIENE localhost', () => {
    expect(isLocalDbUrl('libsql://localhost.atacante.io')).toBe(false)
    expect(isLocalDbUrl('libsql://127.0.0.1.turso.io')).toBe(false)
  })
})
