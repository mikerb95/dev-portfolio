import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Asesor en vivo (src/lib/asesor/vivo.ts): la lógica pura, la persistencia
// contra SQLite real en archivo temporal (como asesor-presupuesto.test.ts) y
// los tres endpoints con el modelo y ntfy falsos.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `asesor-vivo-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

const responderFalso = vi.fn()
vi.mock('../src/lib/asesor/motor', () => ({
  AsesorNoDisponible: class extends Error {},
  disponible: async () => true,
  responder: (...a: unknown[]) => responderFalso(...a),
}))
const pushFalso = vi.fn(async (..._a: unknown[]) => ({ channel: 'push', ok: true }))
vi.mock('../src/lib/notify', () => ({ sendPush: (...a: unknown[]) => pushFalso(...a) }))
// El límite durable escribe en su propia tabla; aquí no es lo que se prueba.
vi.mock('../src/lib/security/ratelimit-durable', () => ({ enforceLimit: async () => ({ allowed: true }) }))
vi.mock('../src/lib/security/events', () => ({ recordAdminEvent: async () => {} }))

import { validarEntrada } from '../src/lib/asesor/bucle'
import {
  avisoVivo,
  leerDesde,
  MAX_MENSAJES,
  motivoAviso,
  RETENCION_MS,
  validarMensajeMike,
  validarMensajeVisitante,
  visitantePresente,
} from '../src/lib/asesor/vivo'
import { abrirConversacion, anexar, listarVigentes, mensajesDesde, porId, porToken, purgar } from '../src/lib/asesor/vivo-db'
import { POST as preguntarAsesor } from '../src/pages/api/asesor'
import { GET as sondeoVisitante, POST as escribeVisitante } from '../src/pages/api/asesor/conversacion'
import { GET as sondeoMike, POST as escribeMike } from '../src/pages/api/admin/asesor/[id]'

type Cliente = { execute: (sql: string) => Promise<unknown> }
let client: Cliente

beforeAll(async () => {
  client = ((await import('../src/db')) as unknown as { __client: Cliente }).__client
  // Las tablas salen de la migración real: si el schema cambia sin migración,
  // este test lo nota.
  const archivo = readdirSync('drizzle').find(
    (f) => /^\d{4}_.*\.sql$/.test(f) && readFileSync(join('drizzle', f), 'utf8').includes('CREATE TABLE `asesor_conversaciones`')
  )!
  for (const sql of readFileSync(join('drizzle', archivo), 'utf8').split('--> statement-breakpoint')) {
    if (sql.trim()) await client.execute(sql)
  }
})

beforeEach(async () => {
  await client.execute('DELETE FROM asesor_mensajes')
  await client.execute('DELETE FROM asesor_conversaciones')
  responderFalso.mockReset()
  pushFalso.mockClear()
})

const respuesta = (o: Partial<{ texto: string; cifras: string[]; whatsapp: string | null; contacto: boolean }> = {}) => ({
  texto: 'Respuesta del asesor',
  whatsapp: null,
  contacto: false,
  calculos: [],
  uso: { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 },
  cifras: [],
  respaldo: null,
  ...o,
})

const pedir = (cuerpo: unknown) =>
  preguntarAsesor({
    request: new Request('https://x.test/api/asesor', { method: 'POST', body: JSON.stringify(cuerpo) }),
  } as never) as Promise<Response>

const cuerpoBase = (extra: Record<string, unknown> = {}) => ({
  locale: 'es',
  pagina: 'paginas-web',
  mensajes: [{ rol: 'usuario', texto: '¿Cuánto cuesta una página para un restaurante?' }],
  ...extra,
})

describe('lógica pura', () => {
  it('avisa solo con señales de interés, la más fuerte primero', () => {
    expect(motivoAviso({ cifras: [], whatsapp: null, contacto: false })).toBeNull()
    expect(motivoAviso({ cifras: ['$1.500.000'], whatsapp: null, contacto: false })).toBe('precio')
    expect(motivoAviso({ cifras: ['$1.500.000'], whatsapp: 'hola', contacto: false })).toBe('whatsapp')
    expect(motivoAviso({ cifras: ['$1.500.000'], whatsapp: 'hola', contacto: true })).toBe('contacto')
  })

  it('valida los mensajes de cada lado', () => {
    const t = 'a'.repeat(43)
    expect(validarMensajeVisitante({ t, texto: ' hola ' })).toEqual({ t, texto: 'hola' })
    expect(validarMensajeVisitante({ t: 'corto', texto: 'hola' })).toBeNull()
    expect(validarMensajeVisitante({ t, texto: '   ' })).toBeNull()
    expect(validarMensajeVisitante({ t, texto: 'x'.repeat(501) })).toBeNull()
    expect(validarMensajeVisitante({ t, texto: 'hola', extra: 1 })).toBeNull()
    expect(validarMensajeMike({ texto: 'Hola, soy Mike' })).toBe('Hola, soy Mike')
    expect(validarMensajeMike({ texto: '' })).toBeNull()
    expect(validarMensajeMike({ texto: 'x'.repeat(2_001) })).toBeNull()
  })

  it('lee el cursor de los sondeos sin aceptar basura', () => {
    expect(leerDesde('12')).toBe(12)
    expect(leerDesde(null)).toBe(0)
    expect(leerDesde('-3')).toBe(0)
    expect(leerDesde('1e400')).toBe(0)
    expect(leerDesde('abc')).toBe(0)
  })

  it('el aviso dice por qué y cuál fue la última pregunta, recortada', () => {
    const a = avisoVivo({ motivo: 'precio', locale: 'en', pagina: 'paginas-web', preguntas: ['uno', 'x'.repeat(300)] })
    expect(a.texto).toContain('le dio un precio (/paginas-web, en inglés)')
    expect(a.texto).toContain(`${'x'.repeat(160)}...`)
  })

  it('el visitante cuenta como presente 45 s después de su último sondeo', () => {
    const ahora = new Date('2026-10-02T15:00:00Z')
    expect(visitantePresente(null, ahora)).toBe(false)
    expect(visitantePresente(new Date(ahora.getTime() - 30_000), ahora)).toBe(true)
    expect(visitantePresente(new Date(ahora.getTime() - 60_000), ahora)).toBe(false)
  })

  it('el asesor acepta un token bien formado y rechaza uno inventado', () => {
    expect(validarEntrada(cuerpoBase({ conversacion: 'a'.repeat(43) }))).toMatchObject({ conversacion: 'a'.repeat(43) })
    expect(validarEntrada(cuerpoBase({ conversacion: '../../etc' }))).toEqual({ error: 'formato' })
  })
})

describe('persistencia', () => {
  it('el token abre su conversación y nada más; en la base solo queda su hash', async () => {
    const { id, token } = await abrirConversacion({
      locale: 'es',
      motivo: 'precio',
      mensajes: [{ autor: 'visitante', texto: 'hola' }],
    })
    expect((await porToken(token))?.id).toBe(id)
    expect(await porToken('b'.repeat(43))).toBeNull()
    expect((await porId(id))?.tokenHash).not.toContain(token)
  })

  it('un token de hace más de 48 h ya no abre nada, y la purga lo borra', async () => {
    const vieja = new Date(Date.now() - RETENCION_MS - 60_000)
    const { id, token } = await abrirConversacion({ locale: 'es', motivo: 'precio', mensajes: [{ autor: 'visitante', texto: 'hola' }], ahora: vieja })
    const nueva = await abrirConversacion({ locale: 'es', motivo: 'precio', mensajes: [{ autor: 'visitante', texto: 'hola' }] })
    expect(await porToken(token)).toBeNull()
    await purgar()
    expect(await porId(id)).toBeNull()
    expect(await mensajesDesde(id, 0)).toEqual([])
    expect(await porId(nueva.id)).not.toBeNull()
    expect((await listarVigentes()).map((c) => c.id)).toEqual([nueva.id])
  })

  it('no pasa del tope de mensajes por conversación', async () => {
    const { id } = await abrirConversacion({
      locale: 'es',
      motivo: 'precio',
      mensajes: Array.from({ length: MAX_MENSAJES - 1 }, (_, i) => ({ autor: 'visitante' as const, texto: `m${i}` })),
    })
    expect(await anexar(id, [{ autor: 'mike', texto: 'uno más' }])).toBe(true)
    expect(await anexar(id, [{ autor: 'mike', texto: 'sobra' }])).toBe(false)
  })
})

describe('endpoints', () => {
  it('una charla sin interés no guarda nada ni avisa', async () => {
    responderFalso.mockResolvedValue(respuesta())
    const d = await (await pedir(cuerpoBase())).json()
    expect(d.conversacion).toBeUndefined()
    expect(pushFalso).not.toHaveBeenCalled()
    expect(await listarVigentes()).toEqual([])
  })

  it('al dar un precio guarda toda la conversación, avisa con enlace al panel y devuelve el token', async () => {
    responderFalso.mockResolvedValue(respuesta({ texto: 'Desde $1.500.000', cifras: ['$1.500.000'] }))
    const d = await (await pedir(cuerpoBase())).json()
    expect(d.conversacion).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [conv] = await listarVigentes()
    expect(conv.motivo).toBe('precio')
    expect((await mensajesDesde(conv.id, 0)).map((m) => m.autor)).toEqual(['visitante', 'asesor'])
    expect(pushFalso).toHaveBeenCalledTimes(1)
    const opts = pushFalso.mock.calls[0][2] as { click: string }
    // El enlace lleva el id numérico, nunca el token del visitante.
    expect(opts.click).toBe(`https://codebymike.net/admin/asesor/${conv.id}`)
    expect(opts.click).not.toContain(d.conversacion)
  })

  it('con conversación abierta anexa cada vuelta sin volver a avisar', async () => {
    responderFalso.mockResolvedValue(respuesta({ cifras: ['$1.500.000'] }))
    const { conversacion } = await (await pedir(cuerpoBase())).json()
    responderFalso.mockResolvedValue(respuesta({ texto: 'Sí, incluye dominio', cifras: ['$1.500.000'] }))
    await pedir(
      cuerpoBase({
        conversacion,
        mensajes: [
          { rol: 'usuario', texto: '¿Cuánto cuesta?' },
          { rol: 'asesor', texto: 'Desde $1.500.000' },
          { rol: 'usuario', texto: '¿Incluye dominio?' },
        ],
      })
    )
    const [conv] = await listarVigentes()
    expect((await mensajesDesde(conv.id, 0)).map((m) => m.texto).slice(-2)).toEqual(['¿Incluye dominio?', 'Sí, incluye dominio'])
    expect(pushFalso).toHaveBeenCalledTimes(1)
  })

  it('si la base falla, la respuesta llega igual', async () => {
    responderFalso.mockResolvedValue(respuesta({ cifras: ['$1.500.000'] }))
    await client.execute('ALTER TABLE asesor_mensajes RENAME TO asesor_mensajes_x')
    try {
      const r = await pedir(cuerpoBase())
      expect(r.status).toBe(200)
      expect((await r.json()).texto).toBe('Respuesta del asesor')
    } finally {
      await client.execute('ALTER TABLE asesor_mensajes_x RENAME TO asesor_mensajes')
    }
  })

  it('Mike entra: el asesor se calla, el visitante lo ve en el sondeo y le contesta a él', async () => {
    responderFalso.mockResolvedValue(respuesta({ cifras: ['$1.500.000'] }))
    const { conversacion } = await (await pedir(cuerpoBase())).json()
    const [conv] = await listarVigentes()
    const params = { id: String(conv.id) }
    const sondear = async (desde = 0) =>
      (
        await sondeoVisitante({
          request: new Request(`https://x.test/api/asesor/conversacion?desde=${desde}`, { headers: { 'X-Asesor-Token': conversacion } }),
          url: new URL(`https://x.test/api/asesor/conversacion?desde=${desde}`),
        } as never)
      ).json()

    // Antes de que Mike escriba, el visitante no puede saltarse al asesor.
    const antes = await escribeVisitante({
      request: new Request('https://x.test', { method: 'POST', body: JSON.stringify({ t: conversacion, texto: 'hola' }) }),
    } as never)
    expect(antes.status).toBe(409)
    expect(await sondear()).toEqual({ mike: false, mensajes: [] })

    const r = await escribeMike({
      params,
      request: new Request('https://x.test', { method: 'POST', body: JSON.stringify({ texto: 'Hola, soy Mike' }) }),
    } as never)
    expect(r.status).toBe(201)
    const s = await sondear()
    expect(s.mike).toBe(true)
    expect(s.mensajes.map((m: { texto: string }) => m.texto)).toEqual(['Hola, soy Mike'])
    expect(await sondear(s.mensajes[0].id)).toEqual({ mike: true, mensajes: [] })

    // Una pregunta que salió hacia el asesor justo después ya no llega al modelo.
    responderFalso.mockClear()
    const tarde = await (await pedir(cuerpoBase({ conversacion, mensajes: [{ rol: 'usuario', texto: '¿Sigues ahí?' }] }))).json()
    expect(tarde).toEqual({ mike: true })
    expect(responderFalso).not.toHaveBeenCalled()

    const visitante = await escribeVisitante({
      request: new Request('https://x.test', { method: 'POST', body: JSON.stringify({ t: conversacion, texto: 'Perfecto, gracias' }) }),
    } as never)
    expect(visitante.status).toBe(201)

    const panel = await (await sondeoMike({ params, url: new URL('https://x.test/?desde=0') } as never)).json()
    expect(panel.estado).toBe('mike')
    expect(panel.presente).toBe(true)
    expect(panel.mensajes.map((m: { autor: string }) => m.autor)).toEqual(['visitante', 'asesor', 'mike', 'visitante', 'visitante'])
  })

  it('el sondeo con un token ajeno no revela nada', async () => {
    const r = await sondeoVisitante({
      request: new Request('https://x.test', { headers: { 'X-Asesor-Token': 'c'.repeat(43) } }),
      url: new URL('https://x.test'),
    } as never)
    expect(r.status).toBe(404)
  })
})
