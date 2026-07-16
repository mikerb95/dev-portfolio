import { describe, it, expect } from 'vitest'
import {
  newShortCode,
  isValidShortCode,
  historyToken,
  verifyHistoryToken,
  phoneRef,
  expiryDate,
  isExpired,
  isValidExpiry,
  timeLeft,
  fmtCOP,
  maskAmount,
  buildWhatsAppMessage,
} from '../src/lib/cobros'

const SECRET = 'secreto-de-prueba-no-usar-en-prod'
const PHONE = '+573104641228'

describe('newShortCode', () => {
  it('genera códigos de 6 chars del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = newShortCode()
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
      // Los caracteres que se confunden al dictar por teléfono no aparecen.
      expect(code).not.toMatch(/[01OIL]/)
    }
  })

  it('no repite en un volumen razonable (entropía real, no Math.random)', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => newShortCode()))
    // 32^6 ≈ 1e9: 2000 muestras casi nunca colisionan. Un generador roto (p. ej.
    // sembrado igual) fallaría aquí de inmediato.
    expect(codes.size).toBeGreaterThan(1990)
  })
})

describe('isValidShortCode', () => {
  it('filtra sondeos antes de tocar la BD', () => {
    expect(isValidShortCode('AB3K9F')).toBe(true)
    expect(isValidShortCode('ab3k9f')).toBe(false) // minúsculas no
    expect(isValidShortCode('AB3K9')).toBe(false) // corto
    expect(isValidShortCode('AB3K9FF')).toBe(false) // largo
    expect(isValidShortCode('AB0K9F')).toBe(false) // char excluido
    expect(isValidShortCode("' OR 1=1--")).toBe(false)
    expect(isValidShortCode(null)).toBe(false)
    expect(isValidShortCode(123456)).toBe(false)
  })
})

describe('historyToken / verifyHistoryToken', () => {
  it('es determinista para el mismo teléfono y secreto', () => {
    expect(historyToken(PHONE, SECRET)).toBe(historyToken(PHONE, SECRET))
    expect(historyToken(PHONE, SECRET)).toMatch(/^[0-9a-f]{32}$/)
  })

  it('cambia con el teléfono y con el secreto', () => {
    expect(historyToken(PHONE, SECRET)).not.toBe(historyToken('+573104641229', SECRET))
    expect(historyToken(PHONE, SECRET)).not.toBe(historyToken(PHONE, 'otro-secreto'))
  })

  it('verifica el token correcto y rechaza todo lo demás', () => {
    const token = historyToken(PHONE, SECRET)
    expect(verifyHistoryToken(PHONE, token, SECRET)).toBe(true)
    // El token de OTRO teléfono no abre este historial: es el ataque que importa.
    expect(verifyHistoryToken('+573104641229', token, SECRET)).toBe(false)
    expect(verifyHistoryToken(PHONE, token.slice(0, -1) + '0', SECRET)).toBe(false)
    expect(verifyHistoryToken(PHONE, token, 'secreto-equivocado')).toBe(false)
    expect(verifyHistoryToken(PHONE, '', SECRET)).toBe(false)
    expect(verifyHistoryToken(PHONE, null, SECRET)).toBe(false)
    expect(verifyHistoryToken(PHONE, undefined, SECRET)).toBe(false)
    expect(verifyHistoryToken(PHONE, 12345, SECRET)).toBe(false)
  })

  it('un token de longitud distinta no revienta la comparación', () => {
    // timingSafeEqual lanza si los buffers difieren en longitud: el guard de
    // longitud debe atraparlo antes.
    expect(() => verifyHistoryToken(PHONE, 'corto', SECRET)).not.toThrow()
    expect(verifyHistoryToken(PHONE, 'corto', SECRET)).toBe(false)
  })
})

describe('phoneRef', () => {
  it('es opaco: no contiene el teléfono', () => {
    const ref = phoneRef(PHONE, SECRET)
    expect(ref).toMatch(/^[0-9a-f]{16}$/)
    expect(ref).not.toContain('310')
    expect(ref).not.toContain('4641228')
  })

  it('es determinista y distinto del token del historial', () => {
    expect(phoneRef(PHONE, SECRET)).toBe(phoneRef(PHONE, SECRET))
    // Dominios separados: el ref viaja en la URL, el token es la credencial.
    // Si fueran iguales, publicar el ref regalaría el acceso.
    expect(phoneRef(PHONE, SECRET)).not.toBe(historyToken(PHONE, SECRET).slice(0, 16))
  })
})

describe('expiryDate / isValidExpiry', () => {
  it('calcula el vencimiento desde una fecha base', () => {
    const base = new Date('2026-07-15T10:00:00Z')
    expect(expiryDate('24h', base)?.toISOString()).toBe('2026-07-16T10:00:00.000Z')
    expect(expiryDate('72h', base)?.toISOString()).toBe('2026-07-18T10:00:00.000Z')
    expect(expiryDate('7d', base)?.toISOString()).toBe('2026-07-22T10:00:00.000Z')
    expect(expiryDate('never', base)).toBeNull()
  })

  it('valida la opción antes de usarla', () => {
    expect(isValidExpiry('72h')).toBe(true)
    expect(isValidExpiry('99h')).toBe(false)
    expect(isValidExpiry(null)).toBe(false)
  })
})

describe('isExpired', () => {
  const now = new Date('2026-07-15T12:00:00Z')
  const antes = new Date('2026-07-15T11:00:00Z')
  const despues = new Date('2026-07-15T13:00:00Z')

  it('vence solo lo pendiente y pasado de fecha', () => {
    expect(isExpired({ expiresAt: antes, status: 'created' }, now)).toBe(true)
    expect(isExpired({ expiresAt: antes, status: 'pending' }, now)).toBe(true)
    expect(isExpired({ expiresAt: despues, status: 'created' }, now)).toBe(false)
    expect(isExpired({ expiresAt: null, status: 'created' }, now)).toBe(false)
  })

  it('un pago aprobado NUNCA se marca vencido aunque pase la fecha', () => {
    // El dinero ya entró: mostrar "vencido" sobre un pago cobrado sería mentir
    // al cliente y hacerle pagar dos veces.
    expect(isExpired({ expiresAt: antes, status: 'approved' }, now)).toBe(false)
    expect(isExpired({ expiresAt: antes, status: 'voided' }, now)).toBe(false)
    expect(isExpired({ expiresAt: antes, status: 'declined' }, now)).toBe(false)
  })

  it('el vencimiento exacto ya no permite pagar', () => {
    expect(isExpired({ expiresAt: now, status: 'created' }, now)).toBe(true)
  })
})

describe('timeLeft', () => {
  const now = new Date('2026-07-15T12:00:00Z')
  it('describe el tiempo restante en unidades legibles', () => {
    expect(timeLeft(null, now)).toBe('sin vencimiento')
    expect(timeLeft(new Date('2026-07-15T11:00:00Z'), now)).toBe('vencido')
    expect(timeLeft(new Date('2026-07-15T12:30:00Z'), now)).toBe('vence en 30 min')
    expect(timeLeft(new Date('2026-07-15T15:00:00Z'), now)).toBe('vence en 3 h')
    expect(timeLeft(new Date('2026-07-18T12:00:00Z'), now)).toBe('vence en 3 días')
  })
})

describe('fmtCOP', () => {
  it('formatea en pesos colombianos', () => {
    expect(fmtCOP(15_000_000)).toBe('$150.000')
    expect(fmtCOP(100_000)).toBe('$1.000')
    expect(fmtCOP(500_000_000)).toBe('$5.000.000')
    expect(fmtCOP(0)).toBe('$0')
  })

  it('muestra decimales solo cuando existen, con dos cifras', () => {
    expect(fmtCOP(150_050)).toBe('$1.500,50')
  })
})

describe('maskAmount', () => {
  it('deja ver solo los últimos 3 dígitos', () => {
    expect(maskAmount(15_000_000)).toBe('$ •••.000')
    expect(maskAmount(12_345_600)).toBe('$ •••.456')
    // Montos chicos se ocultan del todo: '$ •••.50' revelaría casi todo.
    expect(maskAmount(50_000)).toBe('$ •••')
  })
})

describe('buildWhatsAppMessage', () => {
  const base = {
    amountCents: 15_000_000,
    payUrl: 'https://codebymike.tech/c/AB3K9F',
    historyUrl: 'https://codebymike.tech/mis-pagos?r=abc&t=def',
    expiresAt: new Date('2026-07-18T15:00:00Z'),
  }

  it('incluye monto, link de pago e historial', () => {
    const msg = buildWhatsAppMessage(base)
    expect(msg).toContain('$150.000')
    expect(msg).toContain('https://codebymike.tech/c/AB3K9F')
    expect(msg).toContain('https://codebymike.tech/mis-pagos?r=abc&t=def')
    expect(msg).toContain('CodeByMike')
  })

  it('saluda por nombre cuando el cliente está en el CRM', () => {
    expect(buildWhatsAppMessage({ ...base, clientName: 'Juan' })).toContain('Hola Juan,')
    expect(buildWhatsAppMessage(base)).toContain('Hola,')
  })

  it('incluye el concepto cuando se da', () => {
    expect(buildWhatsAppMessage({ ...base, concept: 'mantenimiento del portátil' })).toContain(
      'por mantenimiento del portátil',
    )
    expect(buildWhatsAppMessage({ ...base, concept: null })).not.toContain('por null')
  })

  it('menciona el vencimiento solo si existe', () => {
    expect(buildWhatsAppMessage(base)).toContain('vence')
    expect(buildWhatsAppMessage({ ...base, expiresAt: null })).not.toContain('vence')
  })
})
