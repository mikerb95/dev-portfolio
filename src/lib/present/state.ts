// Máquina de estados de una sesión de presentación y validación de comandos.
// Módulo PURO, mismo criterio que `payments-state.ts`: sin Redis, sin base y
// sin `node:crypto`, para que lo puedan importar tanto los endpoints como el
// código que corre en el navegador (el control remoto valida el salto antes de
// enviarlo, para no pintar un slide que el servidor va a rechazar).
//
// El servidor es la fuente de verdad. Todo lo que decide esta máquina se
// vuelve a decidir aquí mismo en el endpoint aunque el cliente ya lo haya
// comprobado: la validación del navegador es cortesía, no autorización.

export type SessionState = 'lobby' | 'live' | 'ended'

export const SESSION_STATES: readonly SessionState[] = ['lobby', 'live', 'ended']

/** Transiciones legales. `ended` es terminal: una sesión no revive. */
const ALLOWED: Record<SessionState, ReadonlySet<SessionState>> = {
  lobby: new Set<SessionState>(['live', 'ended']),
  live: new Set<SessionState>(['ended']),
  ended: new Set<SessionState>(),
}

export const isTerminalState = (s: SessionState): boolean => s === 'ended'

export function canTransition(from: SessionState, to: SessionState): boolean {
  return from !== to && ALLOWED[from].has(to)
}

export type Command =
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; slide: number }

export type SessionShape = {
  state: SessionState
  currentSlide: number
  totalSlides: number
}

export type CommandResult =
  | { ok: true; state: SessionState; currentSlide: number; changed: boolean }
  | { ok: false; error: string }

/**
 * Interpreta un comando del control remoto sobre el estado actual y devuelve el
 * estado resultante. No escribe nada: quien llama persiste el resultado y lo
 * publica al bus.
 *
 * El caso que más importa es `next` en el último slide: por diseño no es un
 * no-op ni un error, sino el final de la presentación. Pasar del último slide
 * es exactamente lo que uno hace al terminar de hablar, y obligar a buscar el
 * botón "Finalizar" en ese momento es pedirle al presentador que mire el
 * celular delante del público.
 */
export function applyCommand(session: SessionShape, cmd: Command): CommandResult {
  const { state, currentSlide, totalSlides } = session

  if (state === 'ended') {
    return { ok: false, error: 'la sesión ya terminó' }
  }

  switch (cmd.type) {
    case 'start': {
      if (!canTransition(state, 'live')) return { ok: false, error: 'la sesión ya está en curso' }
      return { ok: true, state: 'live', currentSlide, changed: true }
    }

    case 'end': {
      return { ok: true, state: 'ended', currentSlide, changed: true }
    }

    case 'prev': {
      // Retroceder desde el lobby no tiene sentido, pero tampoco es un error
      // que merezca un mensaje: el control aún no ha empezado.
      if (state === 'lobby') return { ok: true, state, currentSlide, changed: false }
      const target = Math.max(0, currentSlide - 1)
      return { ok: true, state, currentSlide: target, changed: target !== currentSlide }
    }

    case 'next': {
      // Desde el lobby, "siguiente" arranca la presentación: es el gesto
      // natural cuando el QR ya lleva un rato en pantalla.
      if (state === 'lobby') return { ok: true, state: 'live', currentSlide, changed: true }
      if (currentSlide >= totalSlides - 1) {
        return { ok: true, state: 'ended', currentSlide, changed: true }
      }
      return { ok: true, state, currentSlide: currentSlide + 1, changed: true }
    }

    case 'goto': {
      if (!Number.isInteger(cmd.slide)) return { ok: false, error: 'slide inválido' }
      if (cmd.slide < 0 || cmd.slide > totalSlides - 1) {
        return { ok: false, error: `slide fuera de rango (0-${totalSlides - 1})` }
      }
      // Saltar desde el lobby también arranca: el presentador que elige un
      // slide concreto ya decidió empezar.
      const nextState: SessionState = state === 'lobby' ? 'live' : state
      return {
        ok: true,
        state: nextState,
        currentSlide: cmd.slide,
        changed: cmd.slide !== currentSlide || nextState !== state,
      }
    }

    default:
      return { ok: false, error: 'comando desconocido' }
  }
}

/** Parseo defensivo del cuerpo que llega del control remoto. */
export function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null
  const { type, slide } = raw as { type?: unknown; slide?: unknown }
  switch (type) {
    case 'start':
    case 'end':
    case 'next':
    case 'prev':
      return { type }
    case 'goto': {
      const n = typeof slide === 'number' ? slide : Number(slide)
      if (!Number.isInteger(n)) return null
      return { type: 'goto', slide: n }
    }
    default:
      return null
  }
}
