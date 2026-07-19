import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql en archivo temporal (igual que cobros-db.test.ts): ejercita el
// flujo real de salas efímeras, join/revisitas y sweep sin tocar Turso. En
// memoria no sirve porque el cascade/returning abre otra conexión.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `fp-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { createRoom, getRoom, joinDevice, listDevices, recordBehavior, sweepFpRooms, ROOM_TTL_MS } from '../src/lib/fingerprint'

let client: { execute: (sql: string) => Promise<unknown> }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client

  await client.execute(`CREATE TABLE fp_rooms (
    id text PRIMARY KEY NOT NULL,
    created_at integer NOT NULL,
    expires_at integer NOT NULL
  )`)
  await client.execute(`CREATE TABLE fp_devices (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    room_id text NOT NULL REFERENCES fp_rooms(id) ON DELETE CASCADE,
    device_hash text NOT NULL,
    label integer NOT NULL,
    own_fp text,
    lib_fp_hash text,
    entropy_bits real,
    behavior_sig text,
    revisits integer NOT NULL DEFAULT 0,
    first_seen integer NOT NULL,
    last_seen integer NOT NULL
  )`)
})

beforeEach(async () => {
  // El cascade depende de que las FK estén activas en esta conexión.
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute('DELETE FROM fp_devices')
  await client.execute('DELETE FROM fp_rooms')
})

describe('createRoom / getRoom', () => {
  it('crea una sala con id corto y expiración a ~2h', async () => {
    const before = Date.now()
    const { id, expiresAt } = await createRoom()
    expect(id).toMatch(/^[0-9a-f]{8}$/)
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ROOM_TTL_MS - 1000)
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ROOM_TTL_MS + 1000)

    const room = await getRoom(id)
    expect(room?.id).toBe(id)
  })

  it('getRoom devuelve null para sala inexistente', async () => {
    expect(await getRoom('deadbeef')).toBeNull()
  })

  it('getRoom trata una sala vencida como inexistente (aún no purgada)', async () => {
    const { id } = await createRoom()
    // Forzamos expiración en el pasado sin borrar la fila.
    await client.execute(`UPDATE fp_rooms SET expires_at = ${Math.floor(Date.now() / 1000) - 10} WHERE id = '${id}'`)
    expect(await getRoom(id)).toBeNull()
  })
})

describe('joinDevice', () => {
  it('asigna labels incrementales a dispositivos distintos', async () => {
    const { id } = await createRoom()
    const a = await joinDevice({ roomId: id, deviceHash: 'hashA', ownFp: null, libFpHash: null, entropyBits: 10 })
    const b = await joinDevice({ roomId: id, deviceHash: 'hashB', ownFp: null, libFpHash: null, entropyBits: 12 })
    expect(a).toEqual({ label: 1, revisits: 0, isReturning: false })
    expect(b).toEqual({ label: 2, revisits: 0, isReturning: false })
  })

  it('reconoce un dispositivo que vuelve (mismo hash) y cuenta revisitas sin duplicar fila', async () => {
    const { id } = await createRoom()
    await joinDevice({ roomId: id, deviceHash: 'hashA', ownFp: null, libFpHash: null, entropyBits: 10 })
    const again = await joinDevice({ roomId: id, deviceHash: 'hashA', ownFp: null, libFpHash: null, entropyBits: 11 })
    expect(again).toEqual({ label: 1, revisits: 1, isReturning: true })

    const devices = await listDevices(id)
    expect(devices).toHaveLength(1)
    expect(devices[0]!.revisits).toBe(1)
    // La entropía se refresca con el último valor reportado.
    expect(devices[0]!.entropyBits).toBe(11)
  })

  it('reconoce la revisita por libFpHash aunque el hash propio cambie (incógnito)', async () => {
    const { id } = await createRoom()
    const first = await joinDevice({ roomId: id, deviceHash: 'hashNormal', ownFp: null, libFpHash: 'visitor-abc', entropyBits: 30 })
    expect(first).toEqual({ label: 1, revisits: 0, isReturning: false })

    // Segunda entrada en incógnito: canvas/audio bailan → hash propio distinto,
    // pero FingerprintJS devuelve el mismo visitorId. Debe verse como revisita.
    const second = await joinDevice({ roomId: id, deviceHash: 'hashIncognito', ownFp: null, libFpHash: 'visitor-abc', entropyBits: 28 })
    expect(second).toEqual({ label: 1, revisits: 1, isReturning: true })

    const devices = await listDevices(id)
    expect(devices).toHaveLength(1)
  })

  it('sin libFpHash cae al match por deviceHash (FingerprintJS no cargó)', async () => {
    const { id } = await createRoom()
    await joinDevice({ roomId: id, deviceHash: 'hashX', ownFp: null, libFpHash: null, entropyBits: 15 })
    const again = await joinDevice({ roomId: id, deviceHash: 'hashX', ownFp: null, libFpHash: null, entropyBits: 15 })
    expect(again.isReturning).toBe(true)
    expect(again.revisits).toBe(1)

    // Distinto hash y sin libFpHash → no hay forma de reconocerlo: dispositivo nuevo.
    const nuevo = await joinDevice({ roomId: id, deviceHash: 'hashY', ownFp: null, libFpHash: null, entropyBits: 15 })
    expect(nuevo).toEqual({ label: 2, revisits: 0, isReturning: false })
  })

  it('un libFpHash null en la 2a visita no impide reconocer por deviceHash', async () => {
    const { id } = await createRoom()
    await joinDevice({ roomId: id, deviceHash: 'hashSame', ownFp: null, libFpHash: 'visitor-z', entropyBits: 20 })
    // Mismo hash propio pero esta vez FingerprintJS falló (null): igual es revisita.
    const again = await joinDevice({ roomId: id, deviceHash: 'hashSame', ownFp: null, libFpHash: null, entropyBits: 20 })
    expect(again.isReturning).toBe(true)
    // El libFpHash previo no se pisa con null.
    const [d] = await listDevices(id)
    expect(d!.libFpHash).toBe('visitor-z')
  })

  it('el mismo hash en salas distintas es independiente', async () => {
    const r1 = await createRoom()
    const r2 = await createRoom()
    const a = await joinDevice({ roomId: r1.id, deviceHash: 'shared', ownFp: null, libFpHash: null, entropyBits: 8 })
    const b = await joinDevice({ roomId: r2.id, deviceHash: 'shared', ownFp: null, libFpHash: null, entropyBits: 8 })
    expect(a.isReturning).toBe(false)
    expect(b.isReturning).toBe(false)
    expect(a.label).toBe(1)
    expect(b.label).toBe(1)
  })

  it('persiste ownFp/libFpHash y los expone en listDevices', async () => {
    const { id } = await createRoom()
    await joinDevice({
      roomId: id,
      deviceHash: 'hashA',
      ownFp: [{ key: 'canvas', value: 'x' }],
      libFpHash: 'visitor123',
      entropyBits: 20,
    })
    const [d] = await listDevices(id)
    expect(d!.libFpHash).toBe('visitor123')
    expect(JSON.parse(d!.ownFp!)).toEqual([{ key: 'canvas', value: 'x' }])
  })
})

describe('recordBehavior', () => {
  it('guarda la firma de comportamiento del dispositivo', async () => {
    const { id } = await createRoom()
    await joinDevice({ roomId: id, deviceHash: 'hashA', ownFp: null, libFpHash: null, entropyBits: 10 })
    await recordBehavior({ roomId: id, deviceHash: 'hashA', behaviorSig: { avgMouseSpeed: 1.5 } })
    const [d] = await listDevices(id)
    expect(JSON.parse(d!.behaviorSig!)).toEqual({ avgMouseSpeed: 1.5 })
  })
})

describe('sweepFpRooms', () => {
  it('purga solo salas vencidas y borra sus dispositivos en cascada', async () => {
    const vigente = await createRoom()
    const vencida = await createRoom()
    await joinDevice({ roomId: vencida.id, deviceHash: 'h', ownFp: null, libFpHash: null, entropyBits: 5 })
    await client.execute(`UPDATE fp_rooms SET expires_at = ${Math.floor(Date.now() / 1000) - 10} WHERE id = '${vencida.id}'`)

    const purged = await sweepFpRooms()
    expect(purged).toBe(1)
    expect(await getRoom(vigente.id)).not.toBeNull()

    const rows = await client.execute(`SELECT count(*) as n FROM fp_devices WHERE room_id = '${vencida.id}'`)
    expect((rows as { rows: { n: number }[] }).rows[0]!.n).toBe(0)
  })
})
