import { describe, expect, it } from 'vitest'
import { asuntoCorreo } from '../src/lib/sena-correos'

const base = { cc: '1101688000', ficha: '2658787', nombre: 'Sergio Torres' }

describe('asuntoCorreo', () => {
  // Los dos ejemplos literales del lineamiento del instructor.
  it('reproduce el ejemplo de bitácora', () => {
    expect(asuntoCorreo({ ...base, tipo: 'bitacora', numero: 4 })).toEqual({
      ok: true,
      asunto: 'Bitácora 4, CC 1101688000, Ficha 2658787, Sergio Torres',
    })
  })

  it('reproduce el ejemplo de formato de visita', () => {
    expect(asuntoCorreo({ ...base, tipo: 'visita', numero: 2 })).toEqual({
      ok: true,
      asunto: 'Formato Visita 2, CC 1101688000, Ficha 2658787, Sergio Torres',
    })
  })

  it('quita separadores de CC y ficha y normaliza espacios del nombre', () => {
    const r = asuntoCorreo({ tipo: 'bitacora', numero: 1, cc: '1.101.688.000', ficha: ' 2658787 ', nombre: '  Sergio   Torres ' })
    expect(r).toEqual({ ok: true, asunto: 'Bitácora 1, CC 1101688000, Ficha 2658787, Sergio Torres' })
  })

  it('rechaza números fuera de rango por tipo', () => {
    expect(asuntoCorreo({ ...base, tipo: 'bitacora', numero: 7 })).toEqual({ ok: false, faltan: ['número'] })
    expect(asuntoCorreo({ ...base, tipo: 'visita', numero: 4 })).toEqual({ ok: false, faltan: ['número'] })
    expect(asuntoCorreo({ ...base, tipo: 'visita', numero: 0 })).toEqual({ ok: false, faltan: ['número'] })
  })

  it('lista todos los campos vacíos', () => {
    expect(asuntoCorreo({ tipo: 'bitacora', numero: 1, cc: '..', ficha: '', nombre: ' ' })).toEqual({
      ok: false,
      faltan: ['CC', 'ficha', 'nombre y apellido'],
    })
  })
})
