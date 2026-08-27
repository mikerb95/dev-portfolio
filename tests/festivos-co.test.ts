import { describe, expect, it } from 'vitest'
import { claveFecha, diaInhabil, domingoDePascua, esFestivo, festivosDe, habilAnterior } from '../src/lib/festivos-co'

const f = (iso: string) => new Date(`${iso}T00:00:00`)

describe('domingoDePascua', () => {
  it('coincide con las fechas conocidas de Pascua', () => {
    expect(claveFecha(domingoDePascua(2026))).toBe('2026-04-05')
    expect(claveFecha(domingoDePascua(2027))).toBe('2027-03-28')
    expect(claveFecha(domingoDePascua(2024))).toBe('2024-03-31')
  })
})

describe('festivosDe', () => {
  it('Colombia tiene 18 festivos al año', () => {
    expect(festivosDe(2026).size).toBe(18)
    expect(festivosDe(2027).size).toBe(18)
  })

  it('corre al lunes los festivos de la Ley Emiliani', () => {
    // Reyes 2026 cae martes 6 de enero: se traslada al lunes 12.
    expect(esFestivo(f('2026-01-06'))).toBeNull()
    expect(esFestivo(f('2026-01-12'))).toBe('Reyes Magos')
    // Todos los Santos 2026 cae domingo 1 de noviembre: pasa al lunes 2.
    expect(esFestivo(f('2026-11-02'))).toBe('Todos los Santos')
  })

  it('no mueve los festivos de fecha fija', () => {
    expect(esFestivo(f('2026-12-08'))).toBe('Inmaculada Concepción')
    expect(esFestivo(f('2026-07-20'))).toBe('Grito de Independencia')
  })

  it('ubica los festivos móviles respecto a Pascua', () => {
    expect(esFestivo(f('2026-04-02'))).toBe('Jueves Santo')
    expect(esFestivo(f('2026-04-03'))).toBe('Viernes Santo')
    expect(esFestivo(f('2026-05-18'))).toBe('Ascensión del Señor')
    expect(esFestivo(f('2026-06-08'))).toBe('Corpus Christi')
  })
})

describe('diaInhabil', () => {
  it('marca festivo, sábado y domingo, y deja pasar los días hábiles', () => {
    expect(diaInhabil(f('2026-12-08'))?.tipo).toBe('festivo')
    expect(diaInhabil(f('2026-11-08'))?.tipo).toBe('domingo')
    expect(diaInhabil(f('2026-11-07'))?.tipo).toBe('sabado')
    expect(diaInhabil(f('2026-10-08'))).toBeNull()
  })
})

describe('habilAnterior', () => {
  it('retrocede hasta el último día hábil', () => {
    // Domingo 08-nov-2026 → viernes 06 (el 07 es sábado).
    expect(claveFecha(habilAnterior(f('2026-11-08')))).toBe('2026-11-06')
    // Martes 08-dic-2026 es festivo → lunes 07.
    expect(claveFecha(habilAnterior(f('2026-12-08')))).toBe('2026-12-07')
  })

  it('devuelve el mismo día si ya es hábil', () => {
    expect(claveFecha(habilAnterior(f('2026-10-08')))).toBe('2026-10-08')
  })
})
