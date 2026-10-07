import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// BD libsql en archivo temporal (no :memory:, ver CLAUDE.md). Las tablas se
// crean con la migración real de drizzle, no con un CREATE copiado a mano:
// así el test también vigila que el SQL generado sirva.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `marketing-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import {
  cancelarCampana,
  confirmarSuscripcion,
  darDeBaja,
  dispararCampana,
  guardarCampana,
  listarCampanas,
  preferenciaPortal,
  procesarCola,
  suscribirPublico,
  suscritoPorEmail,
} from '../src/lib/marketing/db'
import { tokenBaja } from '../src/lib/marketing/tokens'

type Exec = { execute: (q: string | { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> }
let client: Exec

// Martes 13 oct 2026, 10:00 en Colombia: franja legal abierta.
const ABIERTO = new Date('2026-10-13T15:00:00Z')
// Domingo 11 oct 2026: cerrado.
const DOMINGO = new Date('2026-10-11T17:00:00Z')

// Resend falso: guarda cada lote y responde un id por correo.
type Lote = { llave: string; correos: { to: string[]; headers: Record<string, string>; html: string; subject: string }[] }
let lotes: Lote[] = []
let sueltos: { to: string[]; subject: string; html: string }[] = []
let fallarBatch: number | null = null

beforeAll(async () => {
  client = ((await import('../src/db')) as unknown as { __client: Exec }).__client
  const archivo = readdirSync('drizzle').find((f) => f.startsWith('0047_'))!
  const sqlMigracion = readFileSync(join('drizzle', archivo), 'utf8')
  for (const sentencia of sqlMigracion.split('--> statement-breakpoint')) {
    if (sentencia.trim()) await client.execute(sentencia)
  }
})

beforeEach(async () => {
  await client.execute('DELETE FROM marketing_envios')
  await client.execute('DELETE FROM marketing_campanas')
  await client.execute('DELETE FROM marketing_suscriptores')
  lotes = []
  sueltos = []
  fallarBatch = null
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('MARKETING_SECRET', 'secreto-de-prueba')
  vi.stubEnv('ALERT_EMAIL_TO', 'mike@ejemplo.co')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      if (url.endsWith('/emails/batch')) {
        if (fallarBatch) return new Response('caído', { status: fallarBatch })
        lotes.push({ llave: (init.headers as Record<string, string>)['Idempotency-Key'], correos: body })
        return Response.json({ data: body.map((_: unknown, i: number) => ({ id: `re_${lotes.length}_${i}` })) })
      }
      sueltos.push(body)
      return Response.json({ id: 're_suelto' })
    })
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** Suscriptor activo directo en la base (atajo del arrange). */
async function activo(email: string): Promise<number> {
  const r = await client.execute({
    sql: `INSERT INTO marketing_suscriptores (email, origen, estado, texto_consentimiento, creado, confirmado)
          VALUES (?, 'formulario', 'activo', 'ok', 1, 1) RETURNING id`,
    args: [email],
  })
  return Number(r.rows[0].id)
}

async function campana(asunto = 'Promo'): Promise<number> {
  const r = await guardarCampana(null, { asunto, titulo: 'Título', cuerpo: 'Hola **mundo**' }, ABIERTO)
  if (!r.ok) throw new Error(r.errores.join())
  return r.id
}

const tokenDeConfirmacion = () => {
  const html = sueltos.at(-1)!.html
  return decodeURIComponent(html.match(/confirmar\?t=([A-Za-z0-9_-]+)/)![1])
}

describe('suscripción pública (doble opt-in)', () => {
  it('queda pendiente hasta confirmar, y el token sirve una sola vez', async () => {
    const r = await suscribirPublico({ email: 'ana@ejemplo.co', origen: 'formulario', ahora: ABIERTO })
    expect(r.enviado).toBe(true)
    expect(await suscritoPorEmail('ana@ejemplo.co')).toBe(false)

    const token = tokenDeConfirmacion()
    expect(await confirmarSuscripcion(token)).toBe(true)
    expect(await suscritoPorEmail('ana@ejemplo.co')).toBe(true)
    expect(await confirmarSuscripcion(token)).toBe(false)
  })

  it('no le llena el buzón a nadie: una confirmación cada 10 minutos', async () => {
    await suscribirPublico({ email: 'ana@ejemplo.co', origen: 'formulario', ahora: ABIERTO })
    const otra = await suscribirPublico({ email: 'ana@ejemplo.co', origen: 'formulario', ahora: new Date(ABIERTO.getTime() + 60_000) })
    expect(otra).toEqual({ enviado: false, motivo: 'espera' })
    expect(sueltos).toHaveLength(1)
  })

  it('a quien ya está activo no le manda nada', async () => {
    await activo('ana@ejemplo.co')
    expect(await suscribirPublico({ email: 'ana@ejemplo.co', origen: 'contacto', ahora: ABIERTO })).toEqual({ enviado: false, motivo: 'ya_activo' })
    expect(sueltos).toHaveLength(0)
  })
})

describe('portal', () => {
  it('entra activo sin doble opt-in y desmarcar es una baja', async () => {
    await preferenciaPortal({ clientUserId: 3, email: 'Cliente@Empresa.co', activo: true, ahora: ABIERTO })
    expect(await suscritoPorEmail('cliente@empresa.co')).toBe(true)
    await preferenciaPortal({ clientUserId: 3, email: 'cliente@empresa.co', activo: false, ahora: ABIERTO })
    expect(await suscritoPorEmail('cliente@empresa.co')).toBe(false)
  })
})

describe('disparo y cola', () => {
  it('disparar dos veces no duplica a nadie', async () => {
    await activo('a@x.co')
    await activo('b@x.co')
    const id = await campana()
    expect(await dispararCampana(id, ABIERTO)).toEqual({ ok: true, encolados: 2 })
    expect(await dispararCampana(id, ABIERTO)).toMatchObject({ ok: false })
  })

  it('sin MARKETING_SECRET no se dispara: no habría enlace de baja', async () => {
    vi.stubEnv('MARKETING_SECRET', '')
    await activo('a@x.co')
    const r = await dispararCampana(await campana(), ABIERTO)
    expect(r.ok).toBe(false)
  })

  it('envía en lote, con enlace de baja propio por persona, y cierra la campaña', async () => {
    const idA = await activo('a@x.co')
    await activo('b@x.co')
    const id = await campana()
    await dispararCampana(id, ABIERTO)

    const r = await procesarCola({ ahora: ABIERTO })
    expect(r).toMatchObject({ ok: true, enviados: 2, pendientes: 0 })
    expect(lotes).toHaveLength(1)
    const [paraA] = lotes[0].correos.filter((c) => c.to[0] === 'a@x.co')
    expect(paraA.headers['List-Unsubscribe']).toContain(`s=${idA}&t=${tokenBaja(idA, 'secreto-de-prueba')}&c=${id}`)
    expect(paraA.html).toContain('<strong>mundo</strong>')

    const [c] = await listarCampanas()
    expect(c.estado).toBe('enviada')
    expect(c.envios.enviado).toBe(2)
  })

  it('el domingo no envía nada, pero deja todo en cola', async () => {
    await activo('a@x.co')
    await dispararCampana(await campana(), ABIERTO)
    const r = await procesarCola({ ahora: DOMINGO })
    expect(r.motivo).toMatch(/Domingo/)
    expect(r.pendientes).toBe(1)
    expect(lotes).toHaveLength(0)
  })

  it('respeta el cupo diario y sigue al día siguiente', async () => {
    for (const e of ['a', 'b', 'c']) await activo(`${e}@x.co`)
    await dispararCampana(await campana(), ABIERTO)
    expect(await procesarCola({ ahora: ABIERTO, tope: 2 })).toMatchObject({ enviados: 2, pendientes: 1 })
    expect(await procesarCola({ ahora: ABIERTO, tope: 2 })).toMatchObject({ enviados: 0, pendientes: 1 })
    const manana = new Date(ABIERTO.getTime() + 86_400_000)
    expect(await procesarCola({ ahora: manana, tope: 2 })).toMatchObject({ enviados: 1, pendientes: 0 })
  })

  it('nadie recibe dos promociones en la misma semana', async () => {
    await activo('a@x.co')
    const uno = await campana('Uno')
    const dos = await campana('Dos')
    await dispararCampana(uno, ABIERTO)
    await dispararCampana(dos, ABIERTO)

    expect(await procesarCola({ ahora: ABIERTO })).toMatchObject({ enviados: 1, pendientes: 1 })
    expect(lotes[0].correos[0].subject).toBe('Uno')
    // Seis días después, todavía no.
    expect(await procesarCola({ ahora: new Date(ABIERTO.getTime() + 6 * 86_400_000) })).toMatchObject({ enviados: 0 })
    // Siete días después (martes de nuevo), sí.
    expect(await procesarCola({ ahora: new Date(ABIERTO.getTime() + 7 * 86_400_000) })).toMatchObject({ enviados: 1 })
    expect(lotes[1].correos[0].subject).toBe('Dos')
  })

  it('quien se da de baja después del disparo no recibe nada', async () => {
    const idA = await activo('a@x.co')
    await activo('b@x.co')
    const id = await campana()
    await dispararCampana(id, ABIERTO)
    await darDeBaja(idA, id, ABIERTO)

    await procesarCola({ ahora: ABIERTO })
    expect(lotes[0].correos.map((c) => c.to[0])).toEqual(['b@x.co'])
    const [c] = await listarCampanas()
    expect(c.envios).toMatchObject({ enviado: 1, omitido: 1, bajas: 1 })
  })

  it('si Resend se cae, el lote se reintenta con la misma llave de idempotencia', async () => {
    await activo('a@x.co')
    await dispararCampana(await campana(), ABIERTO)

    fallarBatch = 503
    expect(await procesarCola({ ahora: ABIERTO })).toMatchObject({ enviados: 0, fallidos: 0, pendientes: 1 })

    // Al rato vuelve Resend; pasados 10 min el lote huérfano se reintenta.
    fallarBatch = null
    const despues = new Date(ABIERTO.getTime() + 11 * 60_000)
    const r = await procesarCola({ ahora: despues })
    expect(r).toMatchObject({ reintentados: 1, pendientes: 0 })
    expect(lotes).toHaveLength(1)
    expect(lotes[0].llave).toMatch(/^marketing-/)
  })

  it('un 4xx de Resend no se reintenta: marca fallido', async () => {
    await activo('a@x.co')
    await dispararCampana(await campana(), ABIERTO)
    fallarBatch = 422
    expect(await procesarCola({ ahora: ABIERTO })).toMatchObject({ fallidos: 1, pendientes: 0 })
    const [c] = await listarCampanas()
    expect(c.ultimoError).toMatch(/422/)
  })

  it('cancelar deja lo enviado y omite lo pendiente', async () => {
    for (const e of ['a', 'b']) await activo(`${e}@x.co`)
    const id = await campana()
    await dispararCampana(id, ABIERTO)
    await procesarCola({ ahora: ABIERTO, tope: 1 })
    expect(await cancelarCampana(id, ABIERTO)).toBe(true)
    const [c] = await listarCampanas()
    expect(c.estado).toBe('cancelada')
    expect(c.envios).toMatchObject({ enviado: 1, omitido: 1, pendiente: 0 })
  })

  it('una campaña ya disparada no se edita', async () => {
    await activo('a@x.co')
    const id = await campana()
    await dispararCampana(id, ABIERTO)
    const r = await guardarCampana(id, { asunto: 'Otro', titulo: 'T', cuerpo: 'C' })
    expect(r.ok).toBe(false)
  })
})
