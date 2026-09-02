import { describe, it, expect } from 'vitest'
import {
  formatFechaCorta,
  formatFechaLarga,
  parseFechaCalendario,
  TZ_COLOMBIA,
} from '../src/lib/fecha-co'
import { formatDate, formatDateTime } from '../src/lib/portal/format'

// En Vercel el proceso corre en UTC. Los dos errores posibles son OPUESTOS y
// arreglar uno solo produce el otro, así que este archivo prueba las dos
// mitades juntas: el formateo (instantes) y el parseo (fechas de calendario).
//
// El caso que lo destapó en uso real: una cuenta de cobro emitida el 1 de
// septiembre a las 19:30 de Bogotá salía fechada el 2 de septiembre.

// 1 sep, 19:30 en Bogotá (UTC-5) = 2 sep, 00:30 UTC.
const NOCHE_DEL_1_SEP = new Date('2026-09-02T00:30:00Z')

describe('parseFechaCalendario', () => {
  it('ancla una fecha de calendario a medianoche colombiana, no a UTC', () => {
    // 00:00 en Bogotá son las 05:00 UTC del MISMO día.
    expect(parseFechaCalendario('2026-08-01')!.toISOString()).toBe('2026-08-01T05:00:00.000Z')
  })

  it('deja intacto lo que ya viene con zona: es un instante, no un día', () => {
    expect(parseFechaCalendario('2026-09-02T00:30:00Z')!.toISOString()).toBe('2026-09-02T00:30:00.000Z')
  })

  it('devuelve null en vez de un Invalid Date que llegue a la base', () => {
    // Un Invalid Date se guarda en silencio y revienta al leerlo, lejos de aquí.
    for (const v of ['', '   ', 'ayer', '2026-13-45', null, undefined, 42, {}]) {
      expect(parseFechaCalendario(v), String(v)).toBeNull()
    }
  })

  it('rechaza un día que no existe en vez de desbordarlo al mes siguiente', () => {
    // JS no lanza con estos: '2026-02-30' se convierte en el 2 de marzo, y
    // quedaría guardada una fecha que nadie escribió.
    expect(parseFechaCalendario('2026-02-30')).toBeNull()
    expect(parseFechaCalendario('2026-04-31')).toBeNull()
    // El 29 de febrero sí existe en año bisiesto y tiene que pasar.
    expect(parseFechaCalendario('2028-02-29')).not.toBeNull()
    expect(parseFechaCalendario('2026-02-28')).not.toBeNull()
  })
})

describe('formateo en zona de Colombia', () => {
  it('un instante nocturno NO salta al día siguiente', () => {
    expect(formatFechaLarga(NOCHE_DEL_1_SEP)).toBe('01 de septiembre de 2026')
  })

  it('una fecha de calendario NO retrocede al día anterior', () => {
    // El error inverso, el que aparece si solo se arregla el formateo.
    expect(formatFechaLarga(parseFechaCalendario('2026-08-01'))).toBe('01 de agosto de 2026')
    expect(formatFechaLarga(parseFechaCalendario('2026-08-31'))).toBe('31 de agosto de 2026')
  })

  it('los cambios de mes y de año se mantienen en su sitio', () => {
    expect(formatFechaLarga(parseFechaCalendario('2026-01-01'))).toBe('01 de enero de 2026')
    expect(formatFechaLarga(parseFechaCalendario('2026-12-31'))).toBe('31 de diciembre de 2026')
  })

  it('sin fecha no imprime "Invalid Date"', () => {
    expect(formatFechaLarga(null)).toBe('')
    expect(formatFechaCorta(null)).toBe('-')
  })

  it('la zona es la de Colombia, no la del proceso', () => {
    expect(TZ_COLOMBIA).toBe('America/Bogota')
  })
})

// El portal comparte la corrección: `formatDate` es lo que ve el cliente en sus
// facturas, y arrastraba el mismo fallo.
describe('formato del portal', () => {
  it('formatDate fecha el instante en Colombia', () => {
    // Aserción sobre la cadena completa y no `toContain('01')`: el año "2026"
    // contiene "02" como subcadena y haría pasar el test estando roto.
    expect(formatDate(NOCHE_DEL_1_SEP)).toBe('01 de sept de 2026')
  })

  it('formatDateTime también', () => {
    // 00:30 UTC son las 19:30 del día anterior en Bogotá.
    const salida = formatDateTime(NOCHE_DEL_1_SEP)
    expect(salida).toContain('01')
    expect(salida).toMatch(/7:30|19:30/)
  })

  it('un vencimiento tecleado como fecha se muestra ese mismo día', () => {
    // La pareja completa: se parsea con parseFechaCalendario al guardar y se
    // pinta con formatDate al leer. Si una de las dos mitades falta, este test
    // cae y señala cuál.
    expect(formatDate(parseFechaCalendario('2026-08-01'))).toContain('01')
    expect(formatDate(parseFechaCalendario('2026-08-01'))).toContain('ago')
  })

  it('null sigue siendo un guion, no una fecha inventada', () => {
    expect(formatDate(null)).toBe('-')
    expect(formatDateTime(undefined)).toBe('-')
  })
})
