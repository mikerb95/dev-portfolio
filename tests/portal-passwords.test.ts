import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, needsRehash, passwordProblem } from '../src/lib/portal/passwords'

describe('portal · passwords', () => {
  describe('passwordProblem', () => {
    it('exige al menos 10 caracteres', () => {
      expect(passwordProblem('abc123')).toMatch(/10 caracteres/)
    })

    it('exige letras y números', () => {
      expect(passwordProblem('solopalabras')).toMatch(/letras y números/)
      expect(passwordProblem('1234567890')).toMatch(/letras y números/)
    })

    it('rechaza contraseñas absurdamente largas', () => {
      // Sin tope, una contraseña de 1 MB serían minutos de scrypt: un DoS
      // gratuito contra el servidor con un solo POST.
      expect(passwordProblem('a1'.repeat(200))).toMatch(/demasiado larga/)
    })

    it('acepta una contraseña razonable', () => {
      expect(passwordProblem('contrasena123')).toBeNull()
    })

    it('no acepta valores que no son string', () => {
      expect(passwordProblem(undefined as unknown as string)).not.toBeNull()
      expect(passwordProblem(12345678901 as unknown as string)).not.toBeNull()
    })
  })

  describe('hash y verificación', () => {
    it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
      const hash = await hashPassword('contrasena123')
      expect(await verifyPassword('contrasena123', hash)).toBe(true)
      expect(await verifyPassword('contrasena124', hash)).toBe(false)
    })

    it('produce hashes distintos para la misma contraseña (sal aleatoria)', async () => {
      // Sin sal por usuario, dos clientes con la misma contraseña compartirían
      // hash y una rainbow table los rompería a los dos de una vez.
      const a = await hashPassword('contrasena123')
      const b = await hashPassword('contrasena123')
      expect(a).not.toBe(b)
      expect(await verifyPassword('contrasena123', a)).toBe(true)
      expect(await verifyPassword('contrasena123', b)).toBe(true)
    })

    it('guarda sus parámetros en el propio hash', async () => {
      const hash = await hashPassword('contrasena123')
      expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/)
    })

    it('normaliza unicode: la misma contraseña tecleada distinto entra igual', async () => {
      // "café" con é precompuesta (NFC) vs. e + acento combinante (NFD): mismo
      // texto para el usuario, bytes distintos. Sin normalizar, un macOS y un
      // Windows podrían discrepar sobre si la contraseña es correcta.
      // Las formas se construyen con normalize() en vez de escribirlas
      // literales para que el test no dependa de bytes invisibles en este
      // archivo: un formateador que los unificara lo dejaría en verde sin
      // probar nada.
      const nfc = 'café'.normalize('NFC') + 'seguro1'
      const nfd = 'café'.normalize('NFD') + 'seguro1'
      expect(nfd).not.toBe(nfc)

      const hash = await hashPassword(nfc)
      expect(await verifyPassword(nfd, hash)).toBe(true)
    })

    it('no lanza ante hashes corruptos o desconocidos', async () => {
      // Un throw aquí sería un 500 distinguible de un 401: un oráculo sobre el
      // estado interno de la cuenta.
      expect(await verifyPassword('x', null)).toBe(false)
      expect(await verifyPassword('x', '')).toBe(false)
      expect(await verifyPassword('x', 'basura')).toBe(false)
      expect(await verifyPassword('x', 'bcrypt$2a$10$abc')).toBe(false)
      expect(await verifyPassword('x', 'scrypt$32768$8$1$sinhash')).toBe(false)
    })

    it('rechaza parámetros fuera de rango en vez de derivarlos', async () => {
      // N=2^30 en una fila manipulada intentaría reservar gigabytes. Se rechaza
      // antes de llamar a scrypt.
      const bomba = `scrypt$1073741824$8$1$${Buffer.from('sal').toString('base64url')}$${Buffer.from('hash').toString('base64url')}`
      expect(await verifyPassword('x', bomba)).toBe(false)
    })
  })

  describe('needsRehash', () => {
    it('no pide rehash con los parámetros actuales', async () => {
      expect(needsRehash(await hashPassword('contrasena123'))).toBe(false)
    })

    it('pide rehash si el hash usa parámetros más débiles', () => {
      expect(needsRehash('scrypt$16384$8$1$sal$hash')).toBe(true)
    })

    it('pide rehash si el esquema es otro', () => {
      expect(needsRehash('bcrypt$2a$10$abc')).toBe(true)
    })
  })
})
