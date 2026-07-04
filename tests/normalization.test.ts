import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { normalizeInteractionInput } from '../src/lib/interactions'
import { normalizeServiceInput } from '../src/lib/services'
import { normalizeTarget } from '../src/lib/diagnostics'
import { isAllowedLogin } from '../src/lib/auth'
import { decryptJson } from '../src/lib/crypto'

describe('normalizeInteractionInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-03T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('forInsert rellena defaults: note, ahora, no hecho', () => {
    const v = normalizeInteractionInput({}, { forInsert: true })
    expect(v.type).toBe('note')
    expect(v.occurredAt).toEqual(new Date('2026-07-03T10:00:00Z'))
    expect(v.done).toBe(false)
    expect(v.doneAt).toBeNull()
  })

  it('update parcial no toca claves ausentes', () => {
    const v = normalizeInteractionInput({ title: '  Llamada  ' }, { forInsert: false })
    expect(v).toEqual({ title: 'Llamada' })
  })

  it('tipo inválido cae a note; ids vacíos quedan null', () => {
    const v = normalizeInteractionInput(
      { type: 'hackeo', clientId: '', projectId: '7' },
      { forInsert: false },
    )
    expect(v.type).toBe('note')
    expect(v.clientId).toBeNull()
    expect(v.projectId).toBe(7)
  })

  it('done=true asigna doneAt (dado o ahora); done=false lo limpia', () => {
    const con = normalizeInteractionInput(
      { done: true, doneAt: '2026-07-01T00:00:00Z' },
      { forInsert: false },
    )
    expect(con.doneAt).toEqual(new Date('2026-07-01T00:00:00Z'))

    const sin = normalizeInteractionInput({ done: true }, { forInsert: false })
    expect(sin.doneAt).toEqual(new Date('2026-07-03T10:00:00Z'))

    const off = normalizeInteractionInput({ done: false }, { forInsert: false })
    expect(off).toMatchObject({ done: false, doneAt: null })
  })

  it('occurredAt inválido cae a ahora; dueDate inválido queda null', () => {
    const v = normalizeInteractionInput(
      { occurredAt: 'no-fecha', dueDate: 'tampoco' },
      { forInsert: false },
    )
    expect(v.occurredAt).toEqual(new Date('2026-07-03T10:00:00Z'))
    expect(v.dueDate).toBeNull()
  })
})

describe('normalizeServiceInput', () => {
  beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', 'b'.repeat(64)))

  it('solo incluye claves presentes en el body', () => {
    expect(normalizeServiceInput({})).toEqual({})
    expect(normalizeServiceInput({ name: '  Vercel  ' })).toEqual({ name: 'Vercel' })
  })

  it('normaliza números, fechas y booleanos', () => {
    const v = normalizeServiceInput({
      cost: '20.5', billedToClient: '', renewalDate: '2027-01-01',
      autoRenew: 1, active: 0, projectId: '3',
    })
    expect(v.cost).toBe(20.5)
    expect(v.billedToClient).toBeNull()
    expect(v.renewalDate).toEqual(new Date('2027-01-01'))
    expect(v.autoRenew).toBe(true)
    expect(v.active).toBe(false)
    expect(v.projectId).toBe(3)
  })

  it('defaults de moneda/ciclo/pagador solo si la clave viene', () => {
    const v = normalizeServiceInput({ currency: '', billingCycle: null, payer: undefined })
    expect(v.currency).toBe('USD')
    expect(v.billingCycle).toBe('monthly')
    expect(v).not.toHaveProperty('payer')
  })

  it('cifra secrets con contenido y los descifra de vuelta', () => {
    const v = normalizeServiceInput({ secrets: { apiKey: 'sk-123', vacio: '' } })
    expect(typeof v.secrets).toBe('string')
    expect(v.secrets).not.toContain('sk-123')
    expect(decryptJson(v.secrets as string)).toEqual({ apiKey: 'sk-123', vacio: '' })
  })

  it('secrets vacíos o solo espacios se guardan como null', () => {
    expect(normalizeServiceInput({ secrets: { a: '', b: '   ' } }).secrets).toBeNull()
    expect(normalizeServiceInput({ secrets: null }).secrets).toBeNull()
  })
})

describe('normalizeTarget (diagnósticos)', () => {
  it('asume https cuando falta el esquema', () => {
    const t = normalizeTarget('codebymike.tech/ruta?x=1')
    expect(t?.origin).toBe('https://codebymike.tech')
    expect(t?.hostname).toBe('codebymike.tech')
    expect(t?.domain).toBe('codebymike.tech')
  })

  it('deriva el dominio registrable de subdominios', () => {
    expect(normalizeTarget('https://app.staging.example.com')?.domain).toBe('example.com')
  })

  it('rechaza esquemas no http(s), vacíos e inválidos', () => {
    expect(normalizeTarget('ftp://example.com')).toBeNull()
    expect(normalizeTarget('')).toBeNull()
    expect(normalizeTarget(null)).toBeNull()
    expect(normalizeTarget('   ')).toBeNull()
  })
})

describe('isAllowedLogin (allowlist del panel)', () => {
  it('acepta el login permitido sin distinguir mayúsculas', () => {
    expect(isAllowedLogin('mikerb95')).toBe(true)
    expect(isAllowedLogin('MikeRB95')).toBe(true)
  })

  it('rechaza logins ajenos, vacíos o nulos', () => {
    expect(isAllowedLogin('otro-usuario')).toBe(false)
    expect(isAllowedLogin('')).toBe(false)
    expect(isAllowedLogin(null)).toBe(false)
    expect(isAllowedLogin(undefined)).toBe(false)
  })
})
