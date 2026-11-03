import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// La llave sola no debe bastar para entrar al panel: el login con llave no pasa
// por GitHub ni por contraseña, así que sin verificación de usuario (PIN o
// huella) quien tome la YubiKey entra. Se prueba en las dos ceremonias, en lo
// que se le pide al navegador y en lo que el servidor exige al verificar.

vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `webauthn-uv-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }) }
})

vi.mock('../src/lib/notify', () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../src/lib/security/events', () => ({ recordSecurityEvent: vi.fn(async () => {}) }))

// La criptografía real necesitaría una llave de verdad. Las funciones de
// verificación se sustituyen por espías para leer con qué opciones se llaman;
// las que generan opciones siguen siendo las reales.
vi.mock('@simplewebauthn/server', async (original) => {
  const real = await original<typeof import('@simplewebauthn/server')>()
  return {
    ...real,
    verifyAuthenticationResponse: vi.fn(async () => ({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    })),
    verifyRegistrationResponse: vi.fn(async () => ({
      verified: true,
      registrationInfo: {
        credential: { id: 'llave-nueva', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['usb'] },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    })),
  }
})

import { migrate } from 'drizzle-orm/libsql/migrator'
import { verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { db } from '../src/db'
import { webauthnChallenges, webauthnCredentials } from '../src/db/schema'
import {
  buildPrimaryAuthenticationOptions,
  buildRegistrationOptions,
  finishPrimaryAuthentication,
  finishRegistration,
} from '../src/lib/webauthn'

const URL_LOGIN = 'https://codebymike.net/api/auth/webauthn/options'

/** Tarro de cookies mínimo: lo que una ceremonia deja, la siguiente lo lee. */
function tarro() {
  const valores = new Map<string, string>()
  return {
    set: (nombre: string, valor: string) => void valores.set(nombre, valor),
    get: (nombre: string) => (valores.has(nombre) ? { value: valores.get(nombre)! } : undefined),
    delete: (nombre: string) => void valores.delete(nombre),
  } as unknown as Parameters<typeof buildPrimaryAuthenticationOptions>[0]
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete(webauthnChallenges)
  await db.delete(webauthnCredentials)
})

describe('login con llave', () => {
  it('le pide al navegador verificación de usuario obligatoria', async () => {
    const opciones = await buildPrimaryAuthenticationOptions(tarro(), URL_LOGIN)
    expect(opciones.userVerification).toBe('required')
  })

  it('el servidor exige la verificación al comprobar la aserción', async () => {
    await db.insert(webauthnCredentials).values({
      id: 'llave-1',
      login: 'mikerb95',
      publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
      counter: 0,
      createdAt: new Date(),
    })
    const cookies = tarro()
    await buildPrimaryAuthenticationOptions(cookies, URL_LOGIN)

    const resultado = await finishPrimaryAuthentication(
      { id: 'llave-1' } as Parameters<typeof finishPrimaryAuthentication>[0],
      cookies,
      URL_LOGIN
    )

    expect(resultado).toEqual({ ok: true, login: 'mikerb95' })
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ requireUserVerification: true })
    )
  })
})

describe('alta de una llave', () => {
  it('pide una credencial discoverable con verificación obligatoria', async () => {
    const opciones = await buildRegistrationOptions('mikerb95', tarro(), URL_LOGIN)
    expect(opciones.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    })
  })

  it('el servidor exige la verificación al registrar', async () => {
    const cookies = tarro()
    await buildRegistrationOptions('mikerb95', cookies, URL_LOGIN)

    const resultado = await finishRegistration(
      'mikerb95',
      {} as Parameters<typeof finishRegistration>[1],
      'YubiKey 1',
      cookies,
      URL_LOGIN
    )

    expect(resultado).toEqual({ ok: true })
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ requireUserVerification: true })
    )
  })
})
