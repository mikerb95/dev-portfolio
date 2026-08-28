// El pase del escenario: la llave alternativa al OAuth para proyectar.
//
// Lo que se prueba aquí es lo que no se puede comprobar mirando la pantalla: no
// hay diferencia visible entre un pase válido y uno falsificado hasta que
// alguien mueve la presentación desde fuera.

import { describe, expect, it } from 'vitest'
import {
  PASE_TTL_SEG,
  firmarPase,
  verificarPase,
} from '../src/lib/sustentacion/pase'

const SECRETO = 'un-secreto-de-prueba-suficientemente-largo'
const OTRO_SECRETO = 'otro-secreto-igual-de-largo-pero-distinto'
const SESION = 'sust-2026-08-28-abcdef'
const AHORA = 1_790_000_000_000

describe('pase del escenario', () => {
  it('acepta un pase recién emitido para su sesión', () => {
    const pase = firmarPase(SECRETO, SESION, AHORA)
    expect(verificarPase(pase, SECRETO, SESION, AHORA + 1000)).toBe(true)
  })

  it('caduca con el mismo TTL que la sesión', () => {
    const pase = firmarPase(SECRETO, SESION, AHORA)
    const justoAntes = AHORA + PASE_TTL_SEG * 1000 - 1000
    const justoDespues = AHORA + PASE_TTL_SEG * 1000 + 1000
    expect(verificarPase(pase, SECRETO, SESION, justoAntes)).toBe(true)
    expect(verificarPase(pase, SECRETO, SESION, justoDespues)).toBe(false)
  })

  it('el pase de OTRA sesión no vale', () => {
    // "Emitir PINes nuevos" existe para dejar fuera a quien tenía el anterior.
    // Si el pase solo llevara la hora, ese corte no llegaría hasta aquí y el
    // portátil de ayer seguiría pudiendo proyectar la sustentación de hoy.
    const pase = firmarPase(SECRETO, SESION, AHORA)
    expect(verificarPase(pase, SECRETO, 'sust-otra-sesion', AHORA + 1000)).toBe(false)
  })

  it('no vale firmado con otra clave', () => {
    const pase = firmarPase(OTRO_SECRETO, SESION, AHORA)
    expect(verificarPase(pase, SECRETO, SESION, AHORA + 1000)).toBe(false)
  })

  it('la fecha de caducidad no se puede estirar a mano', () => {
    // El caso obvio de manipulación: alargar el `exp` del token. La firma cubre
    // esa cifra, así que el pase deja de verificar.
    const pase = firmarPase(SECRETO, SESION, AHORA)
    const [, sig] = pase.split('.')
    const estirado = `${AHORA + PASE_TTL_SEG * 1000 * 10}.${sig}`
    expect(verificarPase(estirado, SECRETO, SESION, AHORA + 1000)).toBe(false)
  })

  it('rechaza basura sin lanzar', () => {
    for (const t of ['', '.', 'sinpunto', 'abc.def', `${AHORA}.`, `.firma`, 'x.y.z']) {
      expect(() => verificarPase(t, SECRETO, SESION, AHORA), t).not.toThrow()
      expect(verificarPase(t, SECRETO, SESION, AHORA), t).toBe(false)
    }
    expect(verificarPase(null, SECRETO, SESION, AHORA)).toBe(false)
    expect(verificarPase(undefined, SECRETO, SESION, AHORA)).toBe(false)
  })

  it('SIN SECRETO nunca valida, aunque el token tenga buena pinta', () => {
    // La página que usa esto va a estar proyectada. Un despliegue sin
    // AUTH_SECRET que validara cualquier pase sería una puerta abierta y
    // además invisible: se vería exactamente igual que una correcta.
    const pase = firmarPase(SECRETO, SESION, AHORA)
    expect(verificarPase(pase, '', SESION, AHORA + 1000)).toBe(false)
    expect(verificarPase(pase, null, SESION, AHORA + 1000)).toBe(false)
    expect(verificarPase(pase, undefined, SESION, AHORA + 1000)).toBe(false)
  })

  it('sin sessionId tampoco valida', () => {
    const pase = firmarPase(SECRETO, SESION, AHORA)
    expect(verificarPase(pase, SECRETO, '', AHORA + 1000)).toBe(false)
  })

  it('dos sesiones distintas dan pases distintos', () => {
    const a = firmarPase(SECRETO, 'sesion-a', AHORA)
    const b = firmarPase(SECRETO, 'sesion-b', AHORA)
    expect(a).not.toBe(b)
  })
})
