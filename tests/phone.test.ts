import { describe, it, expect } from 'vitest'
import { normalizePhone, isE164, formatPhone, maskPhone, waDigits, waLink } from '../src/lib/phone'

// El teléfono es la llave del histórico de /mis-pagos: si dos formas de
// escribir el mismo número no colapsan en una sola cadena, el histórico del
// cliente sale partido. Estos tests fijan esa forma canónica.

describe('normalizePhone', () => {
  it('normaliza las formas en que se escribe un móvil colombiano', () => {
    const esperado = '+573104641228'
    for (const raw of [
      '3104641228',
      '310 464 1228',
      '310-464-1228',
      '(310) 464 1228',
      '+573104641228',
      '+57 310 464 1228',
      '573104641228',
      '00573104641228',
      '  310.464.1228  ',
    ]) {
      expect(normalizePhone(raw), raw).toBe(esperado)
    }
  })

  it('acepta números extranjeros solo con + explícito', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671')
    expect(normalizePhone('+34600123456')).toBe('+34600123456')
    // Sin '+' no se adivina el país: un número de 10 dígitos que no es móvil
    // colombiano se rechaza en vez de convertirse en un +57 inventado.
    expect(normalizePhone('4155552671')).toBeNull()
  })

  it('rechaza lo que no es un teléfono', () => {
    for (const raw of ['', '   ', '1234', 'abc', '310464122', '+', '+0123456789', '31046412280000000']) {
      expect(normalizePhone(raw), raw).toBeNull()
    }
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone(3104641228 as unknown as string)).toBeNull()
  })

  it('rechaza un + en medio del número', () => {
    expect(normalizePhone('310+4641228')).toBeNull()
  })

  it('rechaza fijos locales de 7 dígitos (no sirven para WhatsApp)', () => {
    expect(normalizePhone('6014567')).toBeNull()
  })

  it('es idempotente: normalizar lo ya normalizado no lo cambia', () => {
    const once = normalizePhone('310 464 1228')!
    expect(normalizePhone(once)).toBe(once)
  })
})

describe('isE164', () => {
  it('distingue el formato canónico', () => {
    expect(isE164('+573104641228')).toBe(true)
    expect(isE164('3104641228')).toBe(false)
    expect(isE164('+57 310 464 1228')).toBe(false)
    expect(isE164(null)).toBe(false)
    expect(isE164(123)).toBe(false)
  })
})

describe('formatPhone', () => {
  it('agrupa los colombianos 3-3-4', () => {
    expect(formatPhone('+573104641228')).toBe('+57 310 464 1228')
  })

  it('deja intactos los extranjeros y lo que no es E.164', () => {
    expect(formatPhone('+14155552671')).toBe('+14155552671')
    expect(formatPhone('basura')).toBe('basura')
    expect(formatPhone(null)).toBe('')
  })
})

describe('maskPhone', () => {
  it('deja solo prefijo y dos últimos dígitos', () => {
    const masked = maskPhone('+573104641228')
    expect(masked).toBe('+57 310 ••• ••28')
    // Lo importante: el cuerpo del número no aparece.
    expect(masked).not.toContain('4641')
  })

  it('enmascara también los extranjeros', () => {
    expect(maskPhone('+14155552671')).toBe('+141••••71')
  })

  it('no revela nada si el valor es inválido', () => {
    expect(maskPhone(null)).toBe('•••')
    expect(maskPhone('basura')).toBe('•••')
  })
})

describe('waLink', () => {
  it('quita el + para wa.me y codifica el mensaje', () => {
    expect(waDigits('+573104641228')).toBe('573104641228')
    const link = waLink('+573104641228', 'Hola, son $50.000')
    expect(link).toContain('https://wa.me/573104641228?text=')
    expect(link).toContain('Hola%2C%20son%20%2450.000')
  })

  it('codifica saltos de línea y acentos del mensaje', () => {
    const link = waLink('+573104641228', 'Línea 1\nLínea 2')
    expect(link).toContain('L%C3%ADnea%201%0AL%C3%ADnea%202')
  })
})
