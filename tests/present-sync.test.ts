// Sincronía real: dos clientes suscritos al bus y un comando del control.
//
// Es la prueba que importa de toda la feature. Que la máquina de estados sea
// correcta y que el PIN no colisione no sirve de nada si el salto de slide no
// llega a los dispositivos del salón — y ese camino (comando → validación →
// persistencia → publicación → suscriptores) no lo cubre ningún test de módulo
// puro.
//
// Corre contra el backend en memoria, que implementa el mismo contrato que
// Upstash (get/set/publish/subscribe) y por tanto ejercita el mismo código de
// `session.ts`. Lo único que no reproduce es la red.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  channelFor,
  createSession,
  getSessionByPin,
  presenterSecretFor,
  runCommand,
  type PresentSession,
} from '../src/lib/present/session'
import { __setPresentStore, createMemoryStore, type PresentStore } from '../src/lib/present/store'
import { isReservedSegment } from '../src/lib/present/reserved'

const DECK = { id: 1, title: 'Sustentación', slideCount: 5 }

let store: PresentStore

/** Un espectador: se suscribe al canal y acumula lo que ve. */
function connectClient(session: PresentSession) {
  const received: { state: string; currentSlide: number; version: number }[] = []
  const off = store.subscribe!(channelFor(session.id), (raw) => {
    received.push(JSON.parse(raw))
  })
  return {
    received,
    off,
    /** Último slide que este cliente pintaría. */
    slide: () => received.at(-1)?.currentSlide,
    state: () => received.at(-1)?.state,
  }
}

beforeEach(() => {
  store = createMemoryStore()
  __setPresentStore(store)
})

describe('dos clientes siguen el mismo slide', () => {
  it('un salto del control llega a ambos con el mismo valor', async () => {
    const session = await createSession(DECK)
    const a = connectClient(session)
    const b = connectClient(session)

    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 3 })

    expect(a.slide()).toBe(3)
    expect(b.slide()).toBe(3)
    expect(a.received.at(-1)).toEqual(b.received.at(-1))
  })

  it('una secuencia de comandos llega completa y en orden', async () => {
    const session = await createSession(DECK)
    const a = connectClient(session)
    const b = connectClient(session)

    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'start' })
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'next' })
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'next' })
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'prev' })

    expect(a.received.map((r) => r.currentSlide)).toEqual([0, 1, 2, 1])
    expect(b.received.map((r) => r.currentSlide)).toEqual([0, 1, 2, 1])
    // La versión es monotónica: es lo que deja al cliente descartar un mensaje
    // que llegue tarde sin hacer retroceder la presentación.
    const versions = a.received.map((r) => r.version)
    expect(versions).toEqual([...versions].sort((x, y) => x - y))
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('un cliente que llega tarde entra directo al slide en curso', async () => {
    const session = await createSession(DECK)
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 4 })

    // El rezagado no recibió nada por el bus: su estado sale del snapshot.
    const late = await getSessionByPin(session.pin)
    expect(late?.currentSlide).toBe(4)
    expect(late?.state).toBe('live')
  })

  it('no se publica nada cuando el comando no cambia nada', async () => {
    // Tocar dos veces el mismo slide del selector no debe gastar una escritura
    // ni despertar a toda la sala.
    const session = await createSession(DECK)
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 2 })
    const client = connectClient(session)
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 2 })
    expect(client.received).toHaveLength(0)
  })
})

describe('solo el control mueve la presentación', () => {
  it('sin el secreto correcto, el comando se rechaza y nadie se entera', async () => {
    const session = await createSession(DECK)
    const client = connectClient(session)

    const r = await runCommand(session.id, 'secreto-inventado', { type: 'goto', slide: 3 })

    expect(r).toMatchObject({ ok: false, status: 403 })
    expect(client.received).toHaveLength(0)
    expect((await getSessionByPin(session.pin))?.currentSlide).toBe(0)
  })

  it('una sesión inexistente devuelve 404, no un 403 que confirme el id', async () => {
    const r = await runCommand('0'.repeat(32), 'x', { type: 'next' })
    expect(r).toMatchObject({ ok: false, status: 404 })
  })

  it('un salto fuera de rango no mueve nada', async () => {
    const session = await createSession(DECK)
    const client = connectClient(session)

    const r = await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 99 })

    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(client.received).toHaveLength(0)
  })
})

describe('resiliencia', () => {
  it('reconectar devuelve el slide real, no el que tuviera el cliente', async () => {
    const session = await createSession(DECK)
    const a = connectClient(session)
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 2 })

    // Se cae la red de este cliente y se pierde el siguiente cambio.
    a.off()
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 4 })
    expect(a.slide()).toBe(2)

    // Al reconectar, el snapshot manda.
    const fresh = await getSessionByPin(session.pin)
    expect(fresh?.currentSlide).toBe(4)
  })

  it('si publicar falla, el estado persistido sigue siendo correcto', async () => {
    // El bus es acelerador, no fuente de verdad: un fallo suyo no puede dejar
    // el servidor y los clientes contando cosas distintas.
    const session = await createSession(DECK)
    vi.spyOn(store, 'publish').mockRejectedValueOnce(new Error('bus caído'))

    const r = await runCommand(session.id, await presenterSecretFor(session.id), { type: 'goto', slide: 3 })

    expect(r.ok).toBe(true)
    expect((await getSessionByPin(session.pin))?.currentSlide).toBe(3)
  })
})

describe('ciclo de vida del PIN', () => {
  it('el PIN resuelve a su sesión mientras vive', async () => {
    const session = await createSession(DECK)
    expect(isReservedSegment(session.pin)).toBe(false)
    expect((await getSessionByPin(session.pin))?.id).toBe(session.id)
    expect((await getSessionByPin(session.pin.toUpperCase()))?.id).toBe(session.id)
  })

  it('al terminar, el PIN queda libre para otra sesión', async () => {
    const session = await createSession(DECK)
    await runCommand(session.id, await presenterSecretFor(session.id), { type: 'end' })

    expect(await getSessionByPin(session.pin)).toBeNull()
    // Y ya no lo reclama nadie: una sesión nueva puede tomarlo.
    expect(await store.exists(`present:pin:${session.pin}`)).toBe(false)
  })

  it('varias sesiones a la vez, cada una con su PIN', async () => {
    const a = await createSession(DECK)
    const b = await createSession({ ...DECK, id: 2, title: 'Otra' })
    const c = await createSession({ ...DECK, id: 3, title: 'Tercera' })

    expect(new Set([a.pin, b.pin, c.pin]).size).toBe(3)

    await runCommand(a.id, await presenterSecretFor(a.id), { type: 'goto', slide: 1 })
    await runCommand(b.id, await presenterSecretFor(b.id), { type: 'goto', slide: 4 })

    // Mover una no toca a las otras.
    expect((await getSessionByPin(a.pin))?.currentSlide).toBe(1)
    expect((await getSessionByPin(b.pin))?.currentSlide).toBe(4)
    expect((await getSessionByPin(c.pin))?.currentSlide).toBe(0)
  })

  it('un deck sin slides no llega a abrir sesión', async () => {
    await expect(createSession({ ...DECK, slideCount: 0 })).rejects.toThrow()
  })
})
