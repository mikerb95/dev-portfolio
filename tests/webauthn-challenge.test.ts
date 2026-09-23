import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql local (archivo temporal), igual que cobros-db.test.ts: el "un solo
// uso" depende de un DELETE ... RETURNING real, que un mock no demostraría.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `webauthn-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// Efectos externos: ni push ni escritura en el micro-SIEM durante los tests.
vi.mock('../src/lib/notify', () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../src/lib/security/events', () => ({ recordSecurityEvent: vi.fn(async () => {}) }))

import { storeChallenge, consumeChallenge, notifyPasskeyChange, type ChallengeData } from '../src/lib/webauthn'
import { sendPush } from '../src/lib/notify'
import { recordSecurityEvent } from '../src/lib/security/events'

let client: { execute: (sql: string) => Promise<{ rows: unknown[] }> }

const T0 = new Date('2026-09-23T12:00:00Z')
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000)
const AUTH: ChallengeData = { challenge: 'reto-emitido', kind: 'auth', login: '' }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  // Mismo SQL que drizzle/0036_wet_rictor.sql.
  await client.execute(`CREATE TABLE webauthn_challenges (
    challenge text PRIMARY KEY NOT NULL,
    kind text NOT NULL,
    login text NOT NULL,
    expires_at integer NOT NULL
  )`)
})

beforeEach(async () => {
  await client.execute('DELETE FROM webauthn_challenges')
  vi.clearAllMocks()
})

describe('challenge de WebAuthn: solo vale si lo emitió el servidor, y una vez', () => {
  it('un challenge emitido se acepta una sola vez', async () => {
    await storeChallenge(AUTH, T0)
    expect(await consumeChallenge(AUTH, minutos(1))).toBe(true)
    // La repetición: misma aserción, mismo challenge, segunda vez.
    expect(await consumeChallenge(AUTH, minutos(1))).toBe(false)
  })

  it('un challenge que el servidor no emitió no vale', async () => {
    // El ataque que esto cierra: el challenge venía de una cookie que escribe
    // el cliente, así que quien tuviera una aserción capturada ponía en su
    // cookie el challenge de esa aserción y el servidor lo aceptaba.
    expect(await consumeChallenge({ ...AUTH, challenge: 'reto-de-una-asercion-capturada' }, T0)).toBe(false)
  })

  it('vence a los cinco minutos', async () => {
    await storeChallenge(AUTH, T0)
    expect(await consumeChallenge(AUTH, minutos(6))).toBe(false)
  })

  it('no sirve para otra ceremonia ni para otro login, y no se gasta al intentarlo', async () => {
    await storeChallenge({ challenge: 'reto-alta', kind: 'reg', login: 'mikerb95' }, T0)
    expect(await consumeChallenge({ challenge: 'reto-alta', kind: 'auth', login: '' }, minutos(1))).toBe(false)
    expect(await consumeChallenge({ challenge: 'reto-alta', kind: 'reg', login: 'otro' }, minutos(1))).toBe(false)
    expect(await consumeChallenge({ challenge: 'reto-alta', kind: 'reg', login: 'mikerb95' }, minutos(1))).toBe(true)
  })

  it('dos verificaciones simultáneas con el mismo challenge no ganan las dos', async () => {
    await storeChallenge(AUTH, T0)
    const resultados = await Promise.all([consumeChallenge(AUTH, minutos(1)), consumeChallenge(AUTH, minutos(1))])
    expect(resultados.filter(Boolean)).toHaveLength(1)
  })

  it('emitir uno nuevo barre los vencidos', async () => {
    // El endpoint de opciones del login es público: sin el barrido, cada
    // ceremonia abandonada dejaría una fila para siempre.
    await storeChallenge({ ...AUTH, challenge: 'viejo' }, T0)
    await storeChallenge({ ...AUTH, challenge: 'nuevo' }, minutos(10))
    const { rows } = await client.execute('SELECT challenge FROM webauthn_challenges')
    expect(rows.map((r) => (r as { challenge: string }).challenge)).toEqual(['nuevo'])
  })
})

describe('aviso de cambios en las llaves', () => {
  it('avisa al teléfono y deja rastro en el micro-SIEM', async () => {
    await notifyPasskeyChange('added', { login: 'mikerb95', nickname: 'YubiKey', ip: '203.0.113.7', userAgent: null })
    expect(sendPush).toHaveBeenCalledWith(
      'Llave de seguridad añadida',
      expect.stringContaining('«YubiKey»'),
      expect.objectContaining({ priority: 4 })
    )
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '203.0.113.7',
        classification: expect.objectContaining({ ruleId: 'passkey.registered' }),
      })
    )
  })

  it('distingue la baja del alta', async () => {
    await notifyPasskeyChange('removed', { login: 'mikerb95', ip: null, userAgent: null })
    expect(sendPush).toHaveBeenCalledWith('Llave de seguridad eliminada', expect.any(String), expect.any(Object))
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ classification: expect.objectContaining({ ruleId: 'passkey.removed' }) })
    )
  })

  it('un fallo del aviso no tumba el alta (fail-open)', async () => {
    vi.mocked(sendPush).mockRejectedValueOnce(new Error('ntfy caído'))
    await expect(
      notifyPasskeyChange('added', { login: 'mikerb95', ip: null, userAgent: null })
    ).resolves.toBeUndefined()
  })
})
