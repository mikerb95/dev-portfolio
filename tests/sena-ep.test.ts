import { describe, expect, it } from 'vitest'
import { computeHitos, hitosPorAvisar, mesesDePrograma } from '../src/lib/sena-ep'

describe('mesesDePrograma', () => {
  it('técnico son 6 meses y tecnólogo 9', () => {
    expect(mesesDePrograma('tecnico')).toBe(6)
    expect(mesesDePrograma('tecnologo')).toBe(9)
  })
})

describe('computeHitos', () => {
  it('genera inicio + concertación + una bitácora por mes + parcial + cierre, en orden', () => {
    const hitos = computeHitos('tecnico', '2026-09-09')
    // 2 (inicio + concertación) + 6 bitácoras + 1 parcial + 1 cierre
    expect(hitos).toHaveLength(10)
    expect(hitos.filter((h) => h.categoria === 'bitacora')).toHaveLength(6)
    for (let i = 1; i < hitos.length; i++) {
      expect(hitos[i].fecha.getTime()).toBeGreaterThanOrEqual(hitos[i - 1].fecha.getTime())
    }
  })

  it('la visita de concertación cae 15 días después del inicio', () => {
    const hitos = computeHitos('tecnico', '2026-09-09')
    const concertacion = hitos.find((h) => h.titulo === 'Visita de concertación')!
    expect(concertacion.fecha.toISOString().slice(0, 10)).toBe('2026-09-24')
  })

  it('tecnólogo agrega 9 bitácoras y mueve la visita parcial al mes 4', () => {
    const hitos = computeHitos('tecnologo', '2026-09-09')
    expect(hitos.filter((h) => h.categoria === 'bitacora')).toHaveLength(9)
    const parcial = hitos.find((h) => h.titulo === 'Visita parcial de seguimiento')!
    expect(parcial.fecha.toISOString().slice(0, 10)).toBe('2027-01-09')
  })

  it('el cierre cae 5 días después del fin nominal del programa', () => {
    const hitos = computeHitos('tecnico', '2026-09-09')
    const cierre = hitos[hitos.length - 1]
    expect(cierre.titulo).toBe('Visita final y cierre')
    expect(cierre.fecha.toISOString().slice(0, 10)).toBe('2027-03-14')
  })

  it('rechaza una fecha de inicio inválida', () => {
    expect(() => computeHitos('tecnico', 'no-es-fecha')).toThrow()
  })
})

describe('hitosPorAvisar', () => {
  it('incluye hoy y hasta N días adelante, excluye lo pasado y lo lejano', () => {
    const hoy = new Date('2026-09-09T00:00:00')
    const hitos = computeHitos('tecnico', '2026-09-01')
    const proximos = hitosPorAvisar(hitos, hoy, 3)
    for (const h of proximos) {
      const dias = Math.round((h.fecha.getTime() - hoy.getTime()) / 86400000)
      expect(dias).toBeGreaterThanOrEqual(0)
      expect(dias).toBeLessThanOrEqual(3)
    }
    // El inicio (01-sep) ya pasó y no debe aparecer.
    expect(proximos.some((h) => h.titulo === 'Inicio de etapa productiva')).toBe(false)
  })
})
