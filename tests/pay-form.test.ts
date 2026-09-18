import { describe, expect, it } from 'vitest'
import { formatCop, parseCop, parsePayForm } from '../src/lib/pay-form'

const base = { kind: 'servicio', payerName: 'Ana Gómez', payerEmail: 'ana@example.com', concept: 'Anticipo tienda' }

describe('parsePayForm', () => {
  it('arma la descripción del servicio con el concepto', () => {
    const r = parsePayForm(base)
    expect(r.ok && r.data.description).toBe('Servicio: Anticipo tienda')
  })

  it('el apoyo no exige concepto', () => {
    const r = parsePayForm({ ...base, kind: 'apoyo', concept: '' })
    expect(r.ok && r.data.description).toBe('Apoyo')
  })

  it('señala el campo que falla', () => {
    expect(parsePayForm({ ...base, kind: 'otro' })).toMatchObject({ ok: false, field: 'kind' })
    expect(parsePayForm({ ...base, payerName: ' a ' })).toMatchObject({ ok: false, field: 'name' })
    expect(parsePayForm({ ...base, payerEmail: 'ana@' })).toMatchObject({ ok: false, field: 'email' })
    expect(parsePayForm({ ...base, concept: '   ' })).toMatchObject({ ok: false, field: 'concept' })
  })

  it('limpia saltos de línea del nombre pero los conserva en el mensaje', () => {
    const r = parsePayForm({ ...base, payerName: 'Ana\r\nBcc: x', message: ' hola\nmundo\x07 ' })
    expect(r.ok && r.data.name).toBe('Ana Bcc: x')
    expect(r.ok && r.data.message).toBe('hola\nmundo')
  })

  it('un mensaje vacío se guarda como null', () => {
    const r = parsePayForm({ ...base, message: '   ' })
    expect(r.ok && r.data.message).toBeNull()
  })
})

describe('parseCop / formatCop', () => {
  it('lee el monto con separadores y símbolo', () => {
    expect(parseCop('$ 1.250.000')).toBe(1_250_000)
    expect(parseCop('25000')).toBe(25_000)
    expect(parseCop('abc')).toBeNull()
  })

  it('formatea con puntos de miles', () => {
    expect(formatCop(1_250_000)).toBe('1.250.000')
  })
})
