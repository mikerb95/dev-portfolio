import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const ENCRYPTED_RE = /^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/

function getKey(): Buffer {
  const hex = import.meta.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY debe ser un string hex de 32 bytes (64 caracteres)')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(stored: string): string {
  if (!ENCRYPTED_RE.test(stored)) return stored // valor legacy sin cifrar
  const key = getKey()
  const [ivHex, tagHex, encHex] = stored.split(':')
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8')
}

export const isEncrypted = (v: string) => ENCRYPTED_RE.test(v)

/** Cifra un objeto a un blob (JSON → AES-256-GCM). */
export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj ?? {}))
}

/** Descifra un blob a objeto. Devuelve {} si está vacío o es inválido. */
export function decryptJson<T = Record<string, unknown>>(stored: string | null | undefined): T {
  if (!stored) return {} as T
  try {
    return JSON.parse(decrypt(stored)) as T
  } catch {
    return {} as T
  }
}
