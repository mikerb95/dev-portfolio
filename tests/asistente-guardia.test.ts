import { describe, expect, it } from 'vitest'
import { extraerCifras, verificarCifras } from '../src/lib/asistente/guardia'
import { limpiarDatosPersonales } from '../src/lib/asistente/limpieza'

const valores = (t: string) => extraerCifras(t).map((c) => c.valor)

describe('guardia de cifras', () => {
  it('lee montos en pesos con separador de miles', () => {
    expect(valores('El total es $1.500.000 COP y el anticipo $750.000.')).toEqual([1_500_000, 750_000])
  })

  it('lee montos en dólares con la convención inglesa', () => {
    expect(valores('Total: US$1,500 or $450 USD')).toEqual([1_500, 450])
  })

  it('lee millones abreviados', () => {
    expect(valores('entre 4,8 millones y $7.4M')).toEqual([4_800_000, 7_400_000])
  })

  it('no confunde con dinero lo que no lo es', () => {
    expect(valores('Son 20 personas, 8 horas, 50 % de anticipo y 15 días de validez. Desde 2026, 3 sedes.')).toEqual([])
  })

  it('aprueba un borrador cuyas cifras salen todas del cálculo', () => {
    const r = verificarCifras('El valor es $1.200.000 COP; para empezar, $600.000.', [600_000, 1_200_000])
    expect(r.ok).toBe(true)
  })

  it('rechaza una cifra inventada y dice cuál', () => {
    const r = verificarCifras('Te lo dejo en $900.000 COP.', [1_200_000])
    expect(r.ok).toBe(false)
    expect(r.inventadas.map((c) => c.texto)).toEqual(['$900.000 COP'])
  })

  it('la abreviatura admite su precisión, pero no un redondeo engañoso', () => {
    expect(verificarCifras('unos 4,8 millones', [4_830_000]).ok).toBe(true)
    expect(verificarCifras('unos 5 millones', [4_550_000]).ok).toBe(false)
  })
})

describe('limpieza de datos personales', () => {
  it('oculta correo, celular y cédula', () => {
    const r = limpiarDatosPersonales('Soy Ana, ana.perez@empresa.co, cel 310 464 1228, cédula 1.023.456.789.')
    expect(r.texto).toBe('Soy Ana, [correo oculto], cel [teléfono oculto], cédula [documento oculto].')
    expect(r.ocultos).toEqual({ correos: 1, telefonos: 1, documentos: 1 })
  })

  it('reconoce +57, fijos y NIT con dígito de verificación', () => {
    const r = limpiarDatosPersonales('Llamar al +57 3104641228 o al 601 555 1234. NIT: 900.123.456-7')
    expect(r.texto).toBe('Llamar al [teléfono oculto] o al [teléfono oculto]. NIT: [documento oculto]')
  })

  it('no se come los montos ni las cantidades', () => {
    const t = 'Tenemos un presupuesto de $3.500.000 y 2.000.000 más en enero, para 40 portátiles.'
    expect(limpiarDatosPersonales(t).texto).toBe(t)
  })
})
