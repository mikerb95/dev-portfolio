import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql local (archivo temporal), igual que cobros-db.test.ts. Lo que se
// prueba es el contrato de costo de /security: dentro del plazo de la foto,
// ninguna visita vuelve a escanear security_events; y cuando recalcular falla,
// se sirve la foto vieja en vez de publicar ceros.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `vitrina-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import {
  VITRINA_CLAVE,
  VITRINA_TTL_MS,
  fotoVigente,
  leerVitrina,
  olvidarVitrinaEnMemoria,
  parsearFoto,
  tendenciaCompleta,
  type FotoVitrina,
} from '../src/lib/security/vitrina'

let client: { execute: (sql: string | { sql: string; args: unknown[] }) => Promise<{ rows: unknown[] }> }

const T0 = Date.UTC(2026, 8, 25, 12, 0, 0)
const HORA = 3_600_000

const crearEventos = async () => {
  await client.execute(`CREATE TABLE IF NOT EXISTS security_events (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    at integer NOT NULL,
    category text NOT NULL,
    country text,
    hits integer NOT NULL DEFAULT 1
  )`)
}
const evento = (at: number, category: string, country: string | null, hits = 1) =>
  client.execute({
    sql: 'insert into security_events (at, category, country, hits) values (?, ?, ?, ?)',
    args: [Math.floor(at / 1000), category, country, hits],
  })

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client
  await crearEventos()
  await client.execute(`CREATE TABLE blocked_ips (
    ip text PRIMARY KEY NOT NULL,
    created_at integer NOT NULL,
    source text NOT NULL DEFAULT 'auto'
  )`)
  await client.execute(`CREATE TABLE app_settings (
    key text PRIMARY KEY NOT NULL,
    value text,
    updated_at integer
  )`)
})

beforeEach(async () => {
  olvidarVitrinaEnMemoria()
  await crearEventos()
  await client.execute('delete from security_events')
  await client.execute('delete from blocked_ips')
  await client.execute('delete from app_settings')
  await evento(T0 - 2 * HORA, 'recon_cms', 'US', 3)
  await evento(T0 - 26 * HORA, 'honeypot', 'NL')
  await evento(T0 - 40 * 24 * HORA, 'injection', 'DE') // fuera de la ventana de 30 días
  // Rastro de auditoría: nunca cuenta como amenaza.
  await evento(T0 - HORA, 'admin_action', 'CO', 5)
  await client.execute({ sql: "insert into blocked_ips (ip, created_at, source) values ('198.51.100.1', ?, 'auto')", args: [Math.floor((T0 - HORA) / 1000)] })
  await client.execute({ sql: "insert into blocked_ips (ip, created_at, source) values ('198.51.100.2', ?, 'manual')", args: [Math.floor((T0 - HORA) / 1000)] })
})

const fotoGuardada = async () => {
  const r = await client.execute({ sql: 'select value from app_settings where key = ?', args: [VITRINA_CLAVE] })
  return parsearFoto((r.rows[0] as { value?: string } | undefined)?.value)
}

describe('foto de /security', () => {
  it('la primera lectura calcula, excluye la auditoría y lo que queda fuera de la ventana, y guarda la foto', async () => {
    const { foto, origen } = await leerVitrina(T0)
    expect(origen).toBe('calculada')
    expect(foto?.total).toBe(4)
    expect(foto?.porCategoria.map((c) => c.category).sort()).toEqual(['honeypot', 'recon_cms'])
    expect(foto?.porPais[0]).toEqual({ country: 'US', count: 3 })
    expect(foto?.bloqueosAuto).toBe(1)
    expect(foto?.tendencia).toHaveLength(14)
    expect(foto?.tendencia.at(-1)).toEqual({ day: '2026-09-25', count: 3 })
    expect(await fotoGuardada()).toEqual(foto)
  })

  it('dentro del plazo, ni la instancia caliente ni una fría vuelven a escanear los eventos', async () => {
    await leerVitrina(T0)
    await evento(T0 - HORA, 'bad_bot', 'SG', 50)

    const caliente = await leerVitrina(T0 + HORA)
    expect(caliente.origen).toBe('memoria')
    expect(caliente.foto?.total).toBe(4)

    olvidarVitrinaEnMemoria() // otra instancia, o la misma tras un arranque en frío
    const fria = await leerVitrina(T0 + 2 * HORA)
    expect(fria.origen).toBe('base')
    expect(fria.foto?.total).toBe(4)
  })

  it('pasado el plazo recalcula e incluye lo nuevo', async () => {
    await leerVitrina(T0)
    await evento(T0 + HORA, 'bad_bot', 'SG', 50)
    const { foto, origen } = await leerVitrina(T0 + VITRINA_TTL_MS + 1)
    expect(origen).toBe('calculada')
    expect(foto?.total).toBe(54)
    expect((await fotoGuardada())?.calculadaEn).toBe(T0 + VITRINA_TTL_MS + 1)
  })

  it('si recalcular falla, sirve la foto vieja en vez de publicar ceros', async () => {
    await leerVitrina(T0)
    olvidarVitrinaEnMemoria()
    await client.execute('drop table security_events')
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { foto, origen } = await leerVitrina(T0 + VITRINA_TTL_MS + 1)
    expect(origen).toBe('vieja')
    expect(foto?.total).toBe(4)
    expect(foto?.calculadaEn).toBe(T0)
    // La foto guardada sigue siendo la buena: el fallo no la pisó.
    expect((await fotoGuardada())?.total).toBe(4)
    errores.mockRestore()
  })

  it('sin foto y sin poder calcular, la página recibe null (y pinta sus vacíos)', async () => {
    await client.execute('drop table security_events')
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await leerVitrina(T0)).toEqual({ foto: null, origen: 'vacia' })
    errores.mockRestore()
  })
})

describe('piezas puras', () => {
  const base: FotoVitrina = {
    calculadaEn: T0,
    total: 1,
    porCategoria: [{ category: 'x', count: 1 }],
    porPais: [],
    bloqueosAuto: 0,
    tendencia: [{ day: '2026-09-25', count: 1 }],
  }

  it('parsearFoto rechaza cualquier cosa que no tenga la forma exacta', () => {
    expect(parsearFoto(JSON.stringify(base))).toEqual(base)
    expect(parsearFoto(null)).toBeNull()
    expect(parsearFoto('no es json')).toBeNull()
    expect(parsearFoto(JSON.stringify({ ...base, total: 'mucho' }))).toBeNull()
    expect(parsearFoto(JSON.stringify({ ...base, porCategoria: [{ category: 'x' }] }))).toBeNull()
  })

  it('una foto vence a las horas del plazo, y una "del futuro" no se da por buena', () => {
    expect(fotoVigente(base, T0 + VITRINA_TTL_MS - 1)).toBe(true)
    expect(fotoVigente(base, T0 + VITRINA_TTL_MS)).toBe(false)
    expect(fotoVigente({ ...base, calculadaEn: T0 + 10 * HORA }, T0)).toBe(false)
  })

  it('la tendencia rellena con ceros y termina en el día del cálculo', () => {
    const t = tendenciaCompleta([{ day: '2026-09-20', count: 7 }], T0)
    expect(t).toHaveLength(14)
    expect(t[0].day).toBe('2026-09-12')
    expect(t.at(-1)?.day).toBe('2026-09-25')
    expect(t.find((d) => d.day === '2026-09-20')?.count).toBe(7)
    expect(t.filter((d) => d.count === 0)).toHaveLength(13)
  })
})
