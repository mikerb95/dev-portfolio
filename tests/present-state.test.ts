import { describe, expect, it } from 'vitest'
import { applyCommand, canTransition, isTerminalState, parseCommand } from '../src/lib/present/state'

const session = (over: Partial<{ state: 'lobby' | 'live' | 'ended'; currentSlide: number; totalSlides: number }> = {}) => ({
  state: 'live' as const,
  currentSlide: 0,
  totalSlides: 5,
  ...over,
})

describe('transiciones', () => {
  it('lobby → live → ended, y nada más', () => {
    expect(canTransition('lobby', 'live')).toBe(true)
    expect(canTransition('lobby', 'ended')).toBe(true)
    expect(canTransition('live', 'ended')).toBe(true)

    expect(canTransition('live', 'lobby')).toBe(false)
    expect(canTransition('ended', 'live')).toBe(false)
    expect(canTransition('ended', 'lobby')).toBe(false)
    expect(canTransition('live', 'live')).toBe(false)
  })

  it('ended es terminal: una sesión cerrada no revive', () => {
    expect(isTerminalState('ended')).toBe(true)
    for (const type of ['start', 'next', 'prev', 'end'] as const) {
      const r = applyCommand(session({ state: 'ended' }), { type })
      expect(r.ok).toBe(false)
    }
    expect(applyCommand(session({ state: 'ended' }), { type: 'goto', slide: 2 }).ok).toBe(false)
  })
})

describe('navegación', () => {
  it('next avanza un slide', () => {
    const r = applyCommand(session({ currentSlide: 1 }), { type: 'next' })
    expect(r).toMatchObject({ ok: true, currentSlide: 2, state: 'live', changed: true })
  })

  it('prev retrocede y se planta en el primero', () => {
    expect(applyCommand(session({ currentSlide: 3 }), { type: 'prev' })).toMatchObject({ currentSlide: 2 })

    const atStart = applyCommand(session({ currentSlide: 0 }), { type: 'prev' })
    expect(atStart).toMatchObject({ ok: true, currentSlide: 0, changed: false })
  })

  it('pasar del ÚLTIMO slide termina la presentación', () => {
    // Es el gesto natural al acabar de hablar: no debe exigir buscar el botón
    // de "Finalizar" delante del público.
    const r = applyCommand(session({ currentSlide: 4, totalSlides: 5 }), { type: 'next' })
    expect(r).toMatchObject({ ok: true, state: 'ended', changed: true })
  })

  it('desde el lobby, next y goto arrancan la presentación', () => {
    expect(applyCommand(session({ state: 'lobby' }), { type: 'next' })).toMatchObject({
      ok: true,
      state: 'live',
      currentSlide: 0,
    })
    expect(applyCommand(session({ state: 'lobby' }), { type: 'goto', slide: 3 })).toMatchObject({
      ok: true,
      state: 'live',
      currentSlide: 3,
    })
  })

  it('prev en el lobby no hace nada y no es un error', () => {
    expect(applyCommand(session({ state: 'lobby' }), { type: 'prev' })).toMatchObject({
      ok: true,
      state: 'lobby',
      changed: false,
    })
  })

  it('start solo tiene sentido una vez', () => {
    expect(applyCommand(session({ state: 'lobby' }), { type: 'start' })).toMatchObject({ ok: true, state: 'live' })
    expect(applyCommand(session({ state: 'live' }), { type: 'start' })).toMatchObject({ ok: false })
  })

  it('end funciona desde lobby y desde live', () => {
    expect(applyCommand(session({ state: 'lobby' }), { type: 'end' })).toMatchObject({ ok: true, state: 'ended' })
    expect(applyCommand(session({ state: 'live' }), { type: 'end' })).toMatchObject({ ok: true, state: 'ended' })
  })
})

describe('validación de rango en goto', () => {
  it('acepta el rango completo', () => {
    for (let i = 0; i < 5; i++) {
      expect(applyCommand(session(), { type: 'goto', slide: i }).ok).toBe(true)
    }
  })

  it('rechaza fuera de rango en ambos extremos', () => {
    expect(applyCommand(session(), { type: 'goto', slide: -1 })).toMatchObject({ ok: false })
    expect(applyCommand(session(), { type: 'goto', slide: 5 })).toMatchObject({ ok: false })
    expect(applyCommand(session(), { type: 'goto', slide: 999 })).toMatchObject({ ok: false })
  })

  it('rechaza índices que no son enteros', () => {
    expect(applyCommand(session(), { type: 'goto', slide: 1.5 })).toMatchObject({ ok: false })
    expect(applyCommand(session(), { type: 'goto', slide: NaN })).toMatchObject({ ok: false })
  })

  it('ir al slide en el que ya estamos no cuenta como cambio', () => {
    // Importa: `changed: false` evita publicar al bus y gastar una escritura
    // por cada toque repetido del mismo botón.
    expect(applyCommand(session({ currentSlide: 2 }), { type: 'goto', slide: 2 })).toMatchObject({
      ok: true,
      changed: false,
    })
  })
})

describe('parseo del comando que llega por HTTP', () => {
  it('acepta los comandos válidos', () => {
    expect(parseCommand({ type: 'next' })).toEqual({ type: 'next' })
    expect(parseCommand({ type: 'goto', slide: 3 })).toEqual({ type: 'goto', slide: 3 })
    expect(parseCommand({ type: 'goto', slide: '3' })).toEqual({ type: 'goto', slide: 3 })
  })

  it('rechaza cualquier otra cosa', () => {
    expect(parseCommand(null)).toBeNull()
    expect(parseCommand('next')).toBeNull()
    expect(parseCommand({ type: 'drop-table' })).toBeNull()
    expect(parseCommand({ type: 'goto' })).toBeNull()
    expect(parseCommand({ type: 'goto', slide: 'abc' })).toBeNull()
  })
})
