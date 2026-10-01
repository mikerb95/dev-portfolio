import { describe, expect, it } from 'vitest'
import { debeAvisar, enFranja, horaBogota, mensajeRacha } from '../src/lib/racha-aviso'

describe('aviso de racha en riesgo', () => {
  it('la franja es de 20:00 a 23:00 en Bogotá', () => {
    expect(horaBogota(new Date('2026-10-02T01:00:00Z'))).toBe(20)
    expect(enFranja(new Date('2026-10-02T01:00:00Z'))).toBe(true) // 20:00
    expect(enFranja(new Date('2026-10-02T03:59:00Z'))).toBe(true) // 22:59
    expect(enFranja(new Date('2026-10-02T04:00:00Z'))).toBe(false) // 23:00
    expect(enFranja(new Date('2026-10-01T23:00:00Z'))).toBe(false) // 18:00
  })

  it('avisa solo con la racha en riesgo y una vez por día', () => {
    expect(debeAvisar(true, '2026-10-01', null)).toBe(true)
    expect(debeAvisar(true, '2026-10-01', '2026-09-30')).toBe(true)
    expect(debeAvisar(true, '2026-10-01', '2026-10-01')).toBe(false)
    expect(debeAvisar(false, '2026-10-01', null)).toBe(false)
  })

  it('el mensaje dice cuántos días y de qué', () => {
    expect(mensajeRacha('.NET', 1).titulo).toBe('Racha de 1 día en riesgo')
    expect(mensajeRacha('.NET', 12)).toMatchObject({ titulo: 'Racha de 12 días en riesgo' })
    expect(mensajeRacha('.NET', 12).cuerpo).toContain('.NET')
  })
})
