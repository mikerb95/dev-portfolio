import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// La parte con base de la puerta del PIN (RF-220), contra libSQL en archivo
// temporal: los contadores son UPSERTs atómicos y lo que importa es que sumen,
// venzan y cierren como dice acceso.ts.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `cotiza-pin-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import {
  accesoCotizaVigente,
  borrarPin,
  cerrarPuerta,
  estadoPuerta,
  guardarPin,
  leerFrenos,
  leerPin,
  limpiarFallosIp,
  olvidarCachePin,
  pinCorrecto,
  reabrirPuerta,
  registrarFallo,
} from '../src/lib/cotiza/pin-db'
import { CIERRE_MS, FALLOS_GLOBALES, VENTANA_IP_MS, firmarAccesoCotiza } from '../src/lib/cotiza/acceso'

const SECRETO = 'un-secreto-de-prueba-suficientemente-largo'

let client: { execute: (sql: string) => Promise<unknown> }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  await client.execute(`CREATE TABLE app_settings (key text PRIMARY KEY NOT NULL, value text, updated_at integer)`)
  await client.execute(
    `CREATE TABLE rate_limit_buckets (key text PRIMARY KEY NOT NULL, count integer DEFAULT 0 NOT NULL, reset_at integer NOT NULL)`
  )
})

beforeEach(async () => {
  await client.execute('DELETE FROM app_settings')
  await client.execute('DELETE FROM rate_limit_buckets')
  olvidarCachePin()
})

describe('PIN guardado', () => {
  it('guarda solo el hash, nunca el PIN', async () => {
    await guardarPin('4827')
    const pin = await leerPin()
    expect(pin).not.toBeNull()
    expect(pin!.hash).not.toContain('4827')
    expect(pin!.hash.startsWith('scrypt$')).toBe(true)
    expect(await pinCorrecto('4827', pin!)).toBe(true)
    expect(await pinCorrecto('4828', pin!)).toBe(false)
  })

  it('sin PIN guardado ninguna cookie abre', async () => {
    const t = firmarAccesoCotiza(SECRETO, 'cualquier-version')
    expect(await accesoCotizaVigente(t, SECRETO)).toBe(false)
  })

  it('la cookie emitida con el PIN vigente abre; cambiarlo o quitarlo la invalida', async () => {
    await guardarPin('4827')
    const t = firmarAccesoCotiza(SECRETO, (await leerPin())!.version)
    expect(await accesoCotizaVigente(t, SECRETO)).toBe(true)

    await guardarPin('7391')
    expect(await accesoCotizaVigente(t, SECRETO)).toBe(false)

    const t2 = firmarAccesoCotiza(SECRETO, (await leerPin())!.version)
    expect(await accesoCotizaVigente(t2, SECRETO)).toBe(true)
    await borrarPin()
    expect(await accesoCotizaVigente(t2, SECRETO)).toBe(false)
  })

  it('volver a fijar el mismo PIN también invalida: la sal es nueva', async () => {
    await guardarPin('4827')
    const t = firmarAccesoCotiza(SECRETO, (await leerPin())!.version)
    await guardarPin('4827')
    expect(await accesoCotizaVigente(t, SECRETO)).toBe(false)
  })
})

describe('frenos', () => {
  it('cuenta los fallos por IP y en total', async () => {
    expect(await registrarFallo('1.1.1.1')).toBe(1)
    expect(await registrarFallo('1.1.1.1')).toBe(2)
    expect(await registrarFallo('2.2.2.2')).toBe(3)
    expect((await leerFrenos('1.1.1.1')).fallosIp).toBe(2)
    expect((await leerFrenos('2.2.2.2')).fallosIp).toBe(1)
    expect((await leerFrenos('3.3.3.3')).fallosIp).toBe(0)
  })

  it('los fallos de una IP vencen a los 15 minutos', async () => {
    const t0 = Date.now()
    await registrarFallo('1.1.1.1', t0)
    expect((await leerFrenos('1.1.1.1', t0 + VENTANA_IP_MS - 1000)).fallosIp).toBe(1)
    expect((await leerFrenos('1.1.1.1', t0 + VENTANA_IP_MS + 1000)).fallosIp).toBe(0)
  })

  it('un acierto limpia la IP pero no el total', async () => {
    await registrarFallo('1.1.1.1')
    await registrarFallo('1.1.1.1')
    await limpiarFallosIp('1.1.1.1')
    expect((await leerFrenos('1.1.1.1')).fallosIp).toBe(0)
    expect(await registrarFallo('9.9.9.9')).toBe(3)
  })

  it('diez fallos repartidos entre IP distintas llegan al cierre', async () => {
    let total = 0
    for (let i = 0; i < FALLOS_GLOBALES; i++) total = await registrarFallo(`10.0.0.${i}`)
    expect(total).toBe(FALLOS_GLOBALES)
  })

  it('el cierre lo ve cualquier IP y se puede reabrir a mano', async () => {
    const t0 = Date.now()
    await cerrarPuerta(t0)
    const f = await leerFrenos('5.5.5.5', t0)
    expect(f.cerradaHastaMs).not.toBeNull()
    expect(f.cerradaHastaMs! - t0).toBeGreaterThan(CIERRE_MS - 2000)
    expect((await estadoPuerta(t0)).cerradaHasta).not.toBeNull()

    await reabrirPuerta()
    expect((await leerFrenos('5.5.5.5', t0)).cerradaHastaMs).toBeNull()
  })

  it('estadoPuerta nunca devuelve el hash', async () => {
    await guardarPin('4827')
    const e = await estadoPuerta()
    expect(e.configurado).toBe(true)
    expect(JSON.stringify(e)).not.toContain('scrypt')
  })
})

describe('falla cerrada', () => {
  it('si la base no responde, la cookie no abre', async () => {
    await guardarPin('4827')
    const t = firmarAccesoCotiza(SECRETO, (await leerPin())!.version)
    olvidarCachePin()
    await client.execute('ALTER TABLE app_settings RENAME TO app_settings_caida')
    try {
      expect(await accesoCotizaVigente(t, SECRETO)).toBe(false)
      await expect(leerFrenos('1.1.1.1')).resolves.toBeDefined()
      await expect(leerPin()).rejects.toThrow()
    } finally {
      await client.execute('ALTER TABLE app_settings_caida RENAME TO app_settings')
    }
  })
})
