import { describe, it, expect, beforeEach, vi } from 'vitest'

// El módulo importa ../src/db (crea cliente Turso al cargar). Solo ejercemos la
// lógica pura y la capa en memoria, así que el stub inerte basta.
vi.mock('../src/db', () => ({ db: {} }))

import { planDurableConsult, memHit, _resetMem } from '../src/lib/security/ratelimit-durable'

beforeEach(() => _resetMem())

describe('planDurableConsult', () => {
  it('bloquea sin DB cuando el contador local ya supera el límite', () => {
    expect(planDurableConsult(11, 10, 0.8)).toBe('block')
  })
  it('permite barato mientras no se alcanza la compuerta', () => {
    // gate = floor(10 * 0.8) = 8 → count<=8 permite sin DB
    expect(planDurableConsult(1, 10, 0.8)).toBe('allow')
    expect(planDurableConsult(8, 10, 0.8)).toBe('allow')
  })
  it('consulta la capa durable en la zona de peligro', () => {
    expect(planDurableConsult(9, 10, 0.8)).toBe('consult')
    expect(planDurableConsult(10, 10, 0.8)).toBe('consult')
  })
  it('deferUntil=0 consulta siempre desde el primer hit', () => {
    expect(planDurableConsult(1, 5, 0)).toBe('consult')
  })
  it('deferUntil fuera de rango se acota (no NaN, no ≥1)', () => {
    expect(planDurableConsult(1, 10, Number.NaN)).toBe('consult') // NaN→0
    expect(planDurableConsult(10, 10, 5)).toBe('consult') // 5→0.99, gate=9
  })
})

describe('memHit · ventana fija', () => {
  it('incrementa dentro de la ventana', () => {
    const t = 1_000_000
    expect(memHit('k', 60_000, t).count).toBe(1)
    expect(memHit('k', 60_000, t + 100).count).toBe(2)
    expect(memHit('k', 60_000, t + 200).count).toBe(3)
  })
  it('reinicia al expirar la ventana', () => {
    const t = 1_000_000
    memHit('k', 1_000, t)
    memHit('k', 1_000, t + 500)
    expect(memHit('k', 1_000, t + 1_001).count).toBe(1)
  })
  it('claves distintas no interfieren', () => {
    const t = 2_000_000
    memHit('a', 60_000, t)
    expect(memHit('b', 60_000, t).count).toBe(1)
  })
})
