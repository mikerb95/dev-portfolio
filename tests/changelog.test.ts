import { describe, expect, it } from 'vitest'
import { agruparPorSemana, esSensible, leerCommit, lunesDe } from '../src/lib/changelog'

const c = (mensaje: string, fecha = '2026-09-30T15:00:00Z', sha = 'abc1234') => ({ sha, mensaje, fecha })

describe('leerCommit', () => {
  it('lee feat, fix y perf con o sin alcance', () => {
    expect(leerCommit(c('feat: add contact form'))).toMatchObject({ tipo: 'feat', alcance: null, titulo: 'Add contact form' })
    expect(leerCommit(c('fix(status): wrong uptime color'))).toMatchObject({ tipo: 'fix', alcance: 'status', titulo: 'Wrong uptime color' })
    expect(leerCommit(c('perf!: cache the home page'))).toMatchObject({ tipo: 'perf' })
  })

  it('usa solo la primera línea', () => {
    expect(leerCommit(c('feat: one\n\nbody with details'))?.titulo).toBe('One')
  })

  it('deja fuera lo que no es un cambio del sitio', () => {
    for (const m of ['chore: bump deps', 'ci: cache npm', 'refactor: split module', 'test: more cases', 'docs: plan', 'Merge branch main', 'wip', 'feat:   ']) {
      expect(leerCommit(c(m))).toBeNull()
    }
  })

  it('descarta entero un mensaje sensible', () => {
    for (const m of [
      'feat: read CRON_SECRET from env',
      'fix: rotate the api key',
      'feat: new honeypot route',
      'fix: block 203.0.113.7',
      'feat: hide .env from scanners',
      'fix: password reset email',
    ]) {
      expect(esSensible(m)).toBe(true)
      expect(leerCommit(c(m))).toBeNull()
    }
  })

  it('no confunde palabras normales con secretos', () => {
    expect(esSensible('feat: add keyboard shortcuts to the deck')).toBe(false)
    expect(esSensible('feat: improve SEO metadata')).toBe(false)
  })
})

describe('lunesDe', () => {
  it('usa la hora de Bogotá, no la de Londres', () => {
    // Lunes 28 sep 2026 a las 02:00 UTC es todavía domingo 27 en Bogotá.
    expect(lunesDe('2026-09-28T02:00:00Z')).toBe('2026-09-21')
    expect(lunesDe('2026-09-28T06:00:00Z')).toBe('2026-09-28')
    expect(lunesDe('2026-10-04T23:00:00Z')).toBe('2026-09-28')
  })
})

describe('agruparPorSemana', () => {
  it('agrupa, ordena de lo nuevo a lo viejo, quita repetidos y cuenta', () => {
    const semanas = agruparPorSemana([
      c('feat: a', '2026-09-22T15:00:00Z', '1'),
      c('fix: b', '2026-09-30T15:00:00Z', '2'),
      c('feat: c', '2026-10-01T15:00:00Z', '3'),
      c('feat: c', '2026-10-01T14:00:00Z', '4'),
      c('chore: d', '2026-10-01T16:00:00Z', '5'),
    ])
    expect(semanas.map((s) => s.inicio)).toEqual(['2026-09-28', '2026-09-21'])
    expect(semanas[0]!.cambios.map((x) => x.sha)).toEqual(['3', '2'])
    expect(semanas[0]!.conteo).toEqual({ feat: 1, fix: 1, perf: 0 })
  })

  it('respeta el máximo de semanas', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => c(`feat: n${i}`, new Date(Date.UTC(2026, 6, 1 + i * 7, 15)).toISOString(), String(i)))
    expect(agruparPorSemana(muchos, 8)).toHaveLength(8)
  })
})
