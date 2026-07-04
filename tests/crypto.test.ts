import { describe, it, expect, beforeEach, vi } from 'vitest'
import { encrypt, decrypt, isEncrypted, encryptJson, decryptJson } from '../src/lib/crypto'

const KEY = 'a'.repeat(64) // 32 bytes hex

describe('crypto (AES-256-GCM)', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', KEY)
  })

  it('roundtrip: encrypt → decrypt devuelve el texto original', () => {
    const secret = 'contraseña súper secreta 🤫 con acentos'
    expect(decrypt(encrypt(secret))).toBe(secret)
  })

  it('el mismo texto produce ciphertexts distintos (IV aleatorio)', () => {
    expect(encrypt('hola')).not.toBe(encrypt('hola'))
  })

  it('isEncrypted reconoce el formato iv:tag:datos', () => {
    expect(isEncrypted(encrypt('x'))).toBe(true)
    expect(isEncrypted('texto plano')).toBe(false)
  })

  it('decrypt deja pasar valores legacy sin cifrar', () => {
    expect(decrypt('valor-legacy-plano')).toBe('valor-legacy-plano')
  })

  it('un ciphertext manipulado no descifra (integridad GCM)', () => {
    const stored = encrypt('dato íntegro')
    const [iv, tag, data] = stored.split(':')
    const flipped = data.slice(0, -1) + (data.endsWith('0') ? '1' : '0')
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow()
  })

  it('falla claro si ENCRYPTION_KEY es inválida', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'corta')
    expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY/)
  })

  it('encryptJson/decryptJson roundtrip de objetos', () => {
    const obj = { user: 'mike', nested: { n: 1 } }
    expect(decryptJson(encryptJson(obj))).toEqual(obj)
  })

  it('decryptJson devuelve {} para vacío, null o corrupto', () => {
    expect(decryptJson(null)).toEqual({})
    expect(decryptJson(undefined)).toEqual({})
    expect(decryptJson('no es json ni cifrado')).toEqual({})
  })
})
