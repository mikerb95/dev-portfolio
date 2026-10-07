import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// BD libsql en archivo temporal (no :memory:, ver CLAUDE.md) con el schema real.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `asesor-propuesta-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

const { sendPush } = vi.hoisted(() => ({ sendPush: vi.fn(async () => ({ skipped: true })) }))
vi.mock('../src/lib/notify', () => ({ sendPush }))

import { db } from '../src/db'
import { appSettings, asesorConversaciones, asesorMensajes, propuestas } from '../src/db/schema'
import { claveMarca, conversacionParaPlano, enviarAPlano, tituloDesde } from '../src/lib/asesor/propuesta'
import { porId, mensajesDesde } from '../src/lib/asesor/vivo-db'

const CHARLA = [
  { autor: 'visitante' as const, texto: 'Quiero una tienda en línea para vender ropa de mi marca, mi correo es ana@marca.co' },
  { autor: 'asesor' as const, texto: 'Mike te construye una tienda con pagos. El estimado está entre $5.100.000 y $7.700.000 COP.' },
  { autor: 'visitante' as const, texto: 'Listo, mi WhatsApp es 300 123 4567' },
]

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db as never, { migrationsFolder: 'drizzle' })
})

async function conversacion(locale = 'es') {
  const ahora = new Date()
  const [c] = await db
    .insert(asesorConversaciones)
    .values({ tokenHash: `h-${Math.random()}`, creada: ahora, actualizada: ahora, locale, motivo: 'whatsapp' })
    .returning()
  await db.insert(asesorMensajes).values(CHARLA.map((m) => ({ conversacionId: c!.id, autor: m.autor, texto: m.texto, creado: ahora })))
  return (await porId(c!.id))!
}

beforeEach(async () => {
  sendPush.mockClear()
  for (const t of [propuestas, asesorMensajes, asesorConversaciones, appSettings]) await db.delete(t)
})

describe('del asesor a Plano', () => {
  it('la conversación y el título salen sin correo ni teléfono', () => {
    const texto = conversacionParaPlano(CHARLA)
    expect(texto).toContain('Cliente: Quiero una tienda en línea')
    expect(texto).toContain('Asesor del sitio: Mike te construye')
    expect(texto).not.toMatch(/ana@marca\.co|300 123 4567/)
    expect(tituloDesde(CHARLA)).toMatch(/^Del asesor: Quiero una tienda/)
    expect(tituloDesde(CHARLA)).not.toContain('@')
  })

  it('crea un borrador con la conversación de la base, avisa por ntfy y no corre la IA', async () => {
    const conv = await conversacion()
    const r = await enviarAPlano(conv, await mensajesDesde(conv.id, 0))
    expect(r).toMatchObject({ nueva: true })
    const [p] = await db.select().from(propuestas)
    expect(p).toMatchObject({ id: r!.propuestaId, estado: 'borrador', moneda: 'COP', iaUsd: 0 })
    expect(p!.conversacion).toContain('Cliente: Quiero una tienda')
    expect(p!.conversacion).not.toMatch(/ana@marca\.co|300 123 4567/)
    expect(sendPush).toHaveBeenCalledOnce()
    expect(JSON.stringify(sendPush.mock.calls[0])).toContain(`/admin/plano/${p!.id}`)
  })

  it('una sola propuesta por conversación, aunque toquen el botón varias veces a la vez', async () => {
    const conv = await conversacion()
    const mensajes = await mensajesDesde(conv.id, 0)
    const rs = await Promise.all([enviarAPlano(conv, mensajes), enviarAPlano(conv, mensajes), enviarAPlano(conv, mensajes)])
    expect(await db.select().from(propuestas)).toHaveLength(1)
    expect(rs.filter((r) => r?.nueva)).toHaveLength(1)
    const otra = await enviarAPlano(conv, mensajes)
    expect(otra).toMatchObject({ nueva: false, propuestaId: rs.find((r) => r?.nueva)!.propuestaId })
    expect(sendPush).toHaveBeenCalledOnce()
  })

  it('el asesor en inglés deja la propuesta en dólares', async () => {
    const conv = await conversacion('en')
    await enviarAPlano(conv, await mensajesDesde(conv.id, 0))
    const [p] = await db.select().from(propuestas)
    expect(p!.moneda).toBe('USD')
  })

  it('si falla al crear, suelta la marca para que el siguiente clic lo reintente', async () => {
    const conv = await conversacion()
    const plano = await import('../src/lib/plano/db')
    const espia = vi.spyOn(plano, 'guardarConversacion').mockRejectedValueOnce(new Error('base caída'))
    await expect(enviarAPlano(conv, await mensajesDesde(conv.id, 0))).rejects.toThrow('base caída')
    espia.mockRestore()
    const marcas = await db.select().from(appSettings)
    expect(marcas.find((m) => m.key === claveMarca(conv.id))).toBeUndefined()
  })
})
