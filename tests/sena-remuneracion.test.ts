import { describe, expect, it } from 'vitest'
import {
  calcularRemuneracion,
  nombreAuxilio,
  valoresDelAnio,
  type EntradaRemuneracion,
} from '../src/lib/sena-remuneracion'

// Caso de referencia: la ficha de /ep. Arranca el 9 de septiembre de 2026 con
// días lectivos remunerados en el mismo mes y termina el 8 de marzo de 2027,
// así que cruza el cambio de año hacia un año todavía sin decreto.
const base: EntradaRemuneracion = {
  inicioIso: '2026-09-09',
  formacion: 'tradicional',
  trabajo: 'presencial',
  lectivaMismoMes: true,
}

describe('valoresDelAnio', () => {
  it('usa los decretos cargados para 2025 y 2026', () => {
    expect(valoresDelAnio(2026)).toMatchObject({ smmlv: 1_750_905, auxilio: 249_095, provisional: false })
    expect(valoresDelAnio(2025)).toMatchObject({ smmlv: 1_423_500, auxilio: 200_000, provisional: false })
  })

  it('un año sin decreto reutiliza el último conocido y queda marcado como provisional', () => {
    expect(valoresDelAnio(2027)).toMatchObject({ smmlv: 1_750_905, anioFuente: 2026, provisional: true })
  })
})

describe('calcularRemuneracion - mes de arranque partido', () => {
  const r = calcularRemuneracion(base)
  const sep = r.mesArranque

  it('parte el mes en días lectivos y de práctica sobre mes comercial de 30', () => {
    expect(sep).toMatchObject({ anio: 2026, mes: 8, diasLectiva: 8, diasPractica: 22 })
    expect(sep.practica).toEqual([{ pct: 1, dias: 22 }])
  })

  it('paga la lectiva al 75 %, la práctica al 100 % y el auxilio solo por días de práctica', () => {
    // 1.750.905 / 30 = 58.363,5 por día
    expect(sep.apoyoLectiva).toBe(350_181) // 58.363,5 × 0,75 × 8
    expect(sep.apoyoPractica).toBe(1_283_997) // 58.363,5 × 22
    expect(sep.auxilio).toBe(182_670) // 249.095 / 30 × 22
  })

  it('cobra salud sobre todo el apoyo y pensión solo sobre los días de práctica', () => {
    expect(sep.salud).toBe(Math.round((350_181 + 1_283_997) * 0.04))
    expect(sep.pension).toBe(Math.round(1_283_997 * 0.04))
    expect(sep.neto).toBe(sep.bruto - sep.salud - sep.pension)
  })

  it('sin lectiva en el mes de arranque solo cuenta la práctica', () => {
    const sinLectiva = calcularRemuneracion({ ...base, lectivaMismoMes: false }).mesArranque
    expect(sinLectiva.diasLectiva).toBe(0)
    expect(sinLectiva.apoyo).toBe(1_283_997)
    expect(sinLectiva.salud).toBe(sinLectiva.pension)
  })
})

describe('calcularRemuneracion - etapa completa', () => {
  const r = calcularRemuneracion(base)

  it('termina el día antes de cumplir seis meses y suma 180 días de práctica', () => {
    expect(r.finIso).toBe('2027-03-08')
    expect(r.tramos).toHaveLength(7)
    expect(r.totales.diasPractica).toBe(180)
    expect(r.tramos.at(-1)).toMatchObject({ anio: 2027, mes: 2, diasPractica: 8 })
  })

  it('el mes típico es el primer mes completo: descuentos sin el auxilio en la base', () => {
    expect(r.mesTipico).toMatchObject({ anio: 2026, mes: 9, apoyo: 1_750_905, auxilio: 249_095 })
    expect(r.mesTipico!.salud).toBe(70_036)
    expect(r.mesTipico!.pension).toBe(70_036)
    expect(r.mesTipico!.neto).toBe(2_000_000 - 140_072)
  })

  it('los tramos de 2027 salen con valores provisionales y los de 2026 no', () => {
    expect(r.tramos.filter((t) => t.anio === 2026).every((t) => !t.valores.provisional)).toBe(true)
    expect(r.tramos.filter((t) => t.anio === 2027).every((t) => t.valores.provisional)).toBe(true)
    expect(r.anios.map((a) => [a.anio, a.provisional])).toEqual([
      [2026, false],
      [2027, true],
    ])
  })

  it('reparte la prima por semestre con su fecha legal o la liquidación', () => {
    // Sep (1.283.997 + 182.670) + oct-dic (3 × 2.000.000) = 7.466.667 → /12
    expect(r.prima).toEqual([
      { concepto: 'Prima de servicios', periodo: 'Segundo semestre 2026', monto: 622_222, fechaIso: '2026-12-20' },
      // Ene-feb (2 × 2.000.000) + 8 días de marzo (466.908 + 66.425) → /12
      { concepto: 'Prima de servicios', periodo: 'Primer semestre 2027', monto: 377_778, fechaIso: null },
    ])
  })

  it('consigna las cesantías del año cerrado y paga las del último año en la liquidación', () => {
    expect(r.cesantias.map((c) => [c.periodo, c.monto, c.fechaIso])).toEqual([
      ['2026', 622_222, '2027-02-14'],
      ['2027', 377_778, null],
    ])
    // Intereses proporcionales a los días trabajados en cada año (112 en 2026).
    expect(r.intereses[0]).toMatchObject({ monto: Math.round((622_222 * 0.12 * 112) / 360), fechaIso: '2027-01-31' })
    expect(r.intereses[1]).toMatchObject({ monto: Math.round((377_778 * 0.12 * 68) / 360), fechaIso: null })
  })

  it('las vacaciones van sobre el apoyo, sin auxilio', () => {
    const apoyoPractica = r.tramos.reduce((s, t) => s + t.apoyoPractica, 0)
    expect(r.vacaciones.monto).toBe(Math.round(apoyoPractica / 24))
  })

  it('el total de la etapa es el neto de todos los meses más las prestaciones', () => {
    const neto = r.tramos.reduce((s, t) => s + t.neto, 0)
    expect(r.totales.neto).toBe(neto)
    expect(r.totales.total).toBe(neto + r.totales.prestaciones)
  })
})

describe('calcularRemuneracion - modalidades', () => {
  it('universitario paga el 100 % también en los días lectivos', () => {
    const sep = calcularRemuneracion({ ...base, formacion: 'universitario' }).mesArranque
    expect(sep.apoyoLectiva).toBe(Math.round(58_363.5 * 8))
    expect(sep.pension).toBe(Math.round(sep.apoyoPractica * 0.04))
  })

  it('dual ignora la lectiva y pasa al 100 % en el aniversario del contrato, aunque caiga a mitad de mes', () => {
    const r = calcularRemuneracion({
      ...base,
      formacion: 'dual',
      contratoInicioIso: '2025-11-16',
    })
    expect(r.mesArranque.diasLectiva).toBe(0)
    expect(r.tramos.find((t) => t.mes === 9)!.practica).toEqual([{ pct: 0.75, dias: 30 }])
    // Noviembre: días 1-15 al 75 %, del 16 en adelante al 100 %.
    expect(r.tramos.find((t) => t.mes === 10)!.practica).toEqual([
      { pct: 0.75, dias: 15 },
      { pct: 1, dias: 15 },
    ])
  })

  it('dual sin fecha de contrato asume que empezó con la práctica', () => {
    const r = calcularRemuneracion({ ...base, formacion: 'dual' })
    expect(r.tramos.every((t) => t.practica.every((g) => g.pct === 0.75))).toBe(true)
  })

  it('rechaza un contrato dual que empieza después de la práctica', () => {
    expect(() => calcularRemuneracion({ ...base, formacion: 'dual', contratoInicioIso: '2026-10-01' })).toThrow()
  })

  it('nombra el auxilio según la modalidad de trabajo, con el mismo monto', () => {
    expect(nombreAuxilio('presencial')).toMatch(/transporte/)
    expect(nombreAuxilio('remoto')).toMatch(/conectividad/)
    const remoto = calcularRemuneracion({ ...base, trabajo: 'remoto' })
    expect(remoto.mesTipico!.auxilio).toBe(249_095)
  })
})

describe('calcularRemuneracion - bordes de calendario', () => {
  it('arrancar en 2025 y cruzar a 2026 aplica el valor vigente en cada tramo', () => {
    const r = calcularRemuneracion({ ...base, inicioIso: '2025-10-01', lectivaMismoMes: false })
    expect(r.tramos[0]).toMatchObject({ anio: 2025, apoyo: 1_423_500, auxilio: 200_000 })
    expect(r.tramos.at(-1)).toMatchObject({ anio: 2026, apoyo: 1_750_905, auxilio: 249_095 })
    expect(r.anios.every((a) => !a.provisional)).toBe(true)
  })

  it('terminar el último día de febrero cuenta como mes completo', () => {
    const r = calcularRemuneracion({ ...base, inicioIso: '2026-09-01', lectivaMismoMes: false })
    expect(r.finIso).toBe('2027-02-28')
    expect(r.tramos).toHaveLength(6)
    expect(r.tramos.every((t) => t.completo)).toBe(true)
    expect(r.totales.diasPractica).toBe(180)
  })

  it('rechaza fechas inexistentes', () => {
    expect(() => calcularRemuneracion({ ...base, inicioIso: '2026-02-30' })).toThrow()
    expect(() => calcularRemuneracion({ ...base, inicioIso: 'ayer' })).toThrow()
  })
})
