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
  buscarTelefono,
  debePedirNumero,
  filaNumero,
  leerDesde,
  PIDE_NUMERO,
  taparTelefonos,
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
  const archivos = readdirSync('drizzle')
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && readFileSync(join('drizzle', f), 'utf8').includes('`asesor_conversaciones`'))
    .sort()
  await client.execute('CREATE TABLE IF NOT EXISTS messages (id integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL, email text NOT NULL, subject text, body text NOT NULL, read integer DEFAULT 0, client_id integer, created_at integer)')
  for (const archivo of archivos) {
    for (const sql of readFileSync(join('drizzle', archivo), 'utf8').split('--> statement-breakpoint')) {
      if (sql.trim()) await client.execute(sql)
    }
  }
})

beforeEach(async () => {
  await client.execute('DELETE FROM asesor_mensajes')
  await client.execute('DELETE FROM asesor_conversaciones')
  await client.execute('DELETE FROM messages')
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

describe('número de WhatsApp en la conversación', () => {
  it('reconoce un móvil escrito de cualquier forma', () => {
    for (const t of ['3104641228', 'es el 310 464 1228 gracias', '+57 310 464 1228', '(310) 464-1228', 'mi wsp: 310-464-1228.', '+1 415 555 0134']) {
      expect(buscarTelefono(t), t).not.toBeNull()
    }
    expect(buscarTelefono('es el 310 464 1228')).toBe('+573104641228')
  })

  it('no confunde un precio, un año ni una cantidad con un teléfono', () => {
    for (const t of [
      'tengo 1.500.000 de presupuesto',
      'serían $3.500.000.000 en total',
      '3.500.000.000 COP',
      '3500000000 pesos',
      'para 2026',
      'somos 30 personas',
      'el plan de 4.500.000',
      '31045',
      '310464122899',
    ]) {
      expect(buscarTelefono(t), t).toBeNull()
    }
  })

  it('tapa todos los números para el modelo, con la nota que corresponde', () => {
    const tapado = taparTelefonos('el 310 464 1228 o el 315 000 1111', true)
    expect(tapado).not.toMatch(/\d{3}/)
    expect(tapado.match(/Mike ya lo tiene/g)).toHaveLength(2)
    expect(taparTelefonos('llámame al 3104641228', false)).toBe('llámame al [Número de teléfono omitido por el sistema.]')
    expect(taparTelefonos('cuesta $1.500.000', true)).toBe('cuesta $1.500.000')
  })

  it('no lo pide si el formulario ya está a la vista o ya se llenó', () => {
    expect(debePedirNumero('precio', false)).toBe(true)
    expect(debePedirNumero('whatsapp', false)).toBe(true)
    expect(debePedirNumero('contacto', false)).toBe(false)
    expect(debePedirNumero('precio', true)).toBe(false)
  })

  it('la fila del buzón guarda la pregunta exacta como constancia y no repite el número en las preguntas', () => {
    const f = filaNumero(
      { id: 7, telefono: '+573104641228', locale: 'es', pagina: 'paginas-web', preguntas: ['¿Cuánto cuesta?', '3104641228'] },
      new Date('2026-10-02T20:00:00Z')
    )
    expect(f.subject).toBe('Asistente IA: WhatsApp +57 310 464 1228')
    expect(f.body).toContain(PIDE_NUMERO.es)
    expect(f.body).toContain('/admin/asesor/7')
    expect(f.body).toContain('- ¿Cuánto cuesta?')
    expect(f.body.match(/310 464 1228|3104641228/g)).toHaveLength(1)
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
  it('el número que pidió el asesor le llega a Mike y nunca al modelo', async () => {
    responderFalso.mockResolvedValue(respuesta({ texto: 'Desde $1.500.000', cifras: ['$1.500.000'] }))
    const primera = await (await pedir(cuerpoBase())).json()
    pushFalso.mockClear()
    responderFalso.mockResolvedValue(respuesta({ texto: 'Gracias, Mike te escribe pronto.' }))
    const historial = [
      { rol: 'usuario', texto: '¿Cuánto cuesta una página para un restaurante?' },
      { rol: 'asesor', texto: primera.texto },
      { rol: 'usuario', texto: 'Claro, es el 310 464 1228' },
    ]
    await pedir(cuerpoBase({ conversacion: primera.conversacion, mensajes: historial }))

    // Al modelo le llega la nota, no el número.
    const alModelo = JSON.stringify(responderFalso.mock.calls.at(-1)![0])
    expect(alModelo).not.toContain('464')
    expect(alModelo).toContain('Mike ya lo tiene')

    const [conv] = await listarVigentes()
    expect(conv.telefono).toBe('+573104641228')
    const buzon = (await client.execute('SELECT subject, body FROM messages')) as { rows: { subject: string; body: string }[] }
    expect(buzon.rows).toHaveLength(1)
    expect(buzon.rows[0].subject).toBe('Asistente IA: WhatsApp +57 310 464 1228')
    expect(pushFalso).toHaveBeenCalledTimes(1)
    const [titulo, , opts] = pushFalso.mock.calls[0] as [string, string, { actions: string }]
    expect(titulo).toBe('Te dejó su WhatsApp: +57 310 464 1228')
    expect(opts.actions).toContain('https://wa.me/573104641228?text=')

    // El navegador reenvía el número en cada pregunta: ni se vuelve a avisar ni llega al modelo.
    await pedir(
      cuerpoBase({
        conversacion: primera.conversacion,
        mensajes: [...historial, { rol: 'asesor', texto: 'Gracias, Mike te escribe pronto.' }, { rol: 'usuario', texto: 'Mi otro número es 315 000 1111' }],
      })
    )
    expect(JSON.stringify(responderFalso.mock.calls.at(-1)![0])).not.toMatch(/464|0001111|000 1111/)
    expect(pushFalso).toHaveBeenCalledTimes(1)
    expect((await listarVigentes())[0].telefono).toBe('+573104641228')
  })

  it('sin la pregunta del asesor, un número escrito se tapa pero no se guarda', async () => {
    responderFalso.mockResolvedValue(respuesta())
    await pedir(cuerpoBase({ mensajes: [{ rol: 'usuario', texto: 'llámame al 3104641228' }] }))
    expect(JSON.stringify(responderFalso.mock.calls[0][0])).not.toContain('3104641228')
    expect(await listarVigentes()).toEqual([])
    const buzon = (await client.execute('SELECT count(*) AS n FROM messages')) as { rows: { n: number }[] }
    expect(Number(buzon.rows[0].n)).toBe(0)
  })

  it('si el asesor ofreció el formulario, no pide además el número', async () => {
    responderFalso.mockResolvedValue(respuesta({ texto: 'Te dejo el formulario', contacto: true }))
    const d = await (await pedir(cuerpoBase())).json()
    expect(d.texto).toBe('Te dejo el formulario')
    expect((await listarVigentes())[0].pidioNumero).toBe(false)
  })

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
    // La respuesta trae la pregunta fija por el WhatsApp, también en lo guardado.
    expect(d.texto).toBe(`Desde $1.500.000\n\n${PIDE_NUMERO.es}`)
    const [conv] = await listarVigentes()
    expect(conv.motivo).toBe('precio')
    expect(conv.pidioNumero).toBe(true)
    expect((await mensajesDesde(conv.id, 0)).at(-1)!.texto).toContain(PIDE_NUMERO.es)
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
