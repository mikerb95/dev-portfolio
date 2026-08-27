import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore, __setPresentStore, type PresentStore } from '../src/lib/present/store'
import {
  channelFor,
  crearSesion,
  getSesionPorPin,
  publicarBeat,
  secretoDeSesion,
  sesionActual,
} from '../src/lib/sustentacion/bus'
import { crearPublicador } from '../src/lib/sustentacion/publicar'
import { isPinShape } from '../src/lib/present/pin'

// Backend en memoria: el bus de verdad es Upstash, pero lo que se prueba aquí
// es la capa de sesión y el fail-open, no el transporte.
beforeEach(() => {
  __setPresentStore(createMemoryStore())
})
afterEach(() => {
  __setPresentStore(null)
  vi.restoreAllMocks()
})

describe('sesión de sustentación', () => {
  it('emite un PIN con la misma forma que los de present', async () => {
    const s = await crearSesion()
    expect(isPinShape(s.pin)).toBe(true)
  })

  it('se recupera por PIN y por puntero de sesión actual', async () => {
    const s = await crearSesion('Sustentación de grado')
    expect((await getSesionPorPin(s.pin))?.id).toBe(s.id)
    expect((await getSesionPorPin(s.pin.toUpperCase()))?.id).toBe(s.id)
    expect((await sesionActual())?.id).toBe(s.id)
  })

  it('no reemite un PIN que ya está vivo en lib/present', async () => {
    // El espacio de PIN es compartido: si esta guarda se rompiera, el público
    // de una presentación acabaría en la otra.
    const store = createMemoryStore()
    __setPresentStore(store)
    const ocupados: string[] = []
    for (let i = 0; i < 40; i++) {
      const s = await crearSesion()
      expect(ocupados).not.toContain(s.pin)
      ocupados.push(s.pin)
      // Se ocupa el mismo PIN en la familia de present para el siguiente giro.
      await store.set(`present:pin:${s.pin}`, 'otra-sesion', 3600)
    }
  })
})

describe('publicarBeat (servidor)', () => {
  it('publica el snapshot plano en el canal de la sesión', async () => {
    const s = await crearSesion()
    const secreto = await secretoDeSesion(s.id)
    const recibidos: string[] = []
    const store = __setPresentStore(null) ?? null
    void store
    // El backend en memoria sí permite suscribirse, a diferencia de Upstash.
    const mem = createMemoryStore()
    __setPresentStore(mem)
    const s2 = await crearSesion()
    const secreto2 = await secretoDeSesion(s2.id)
    mem.subscribe?.(channelFor(s2.id), (m) => recibidos.push(m))

    const r = await publicarBeat(s2.id, secreto2, { beat: 3, titulo: 'Punto de quiebre', dato: '100 req/s' })
    expect(r.ok).toBe(true)
    expect(recibidos).toHaveLength(1)

    const msg = JSON.parse(recibidos[0])
    expect(msg).toEqual({
      sessionId: s2.id,
      pin: s2.pin,
      beat: 3,
      titulo: 'Punto de quiebre',
      dato: '100 req/s',
      version: 2,
    })
    // Nada de estructura de slides: el contrato es plano a propósito.
    expect(Object.keys(msg).sort()).toEqual(['beat', 'dato', 'pin', 'sessionId', 'titulo', 'version'])
    void secreto
  })

  it('rechaza un secreto que no es el de la sesión', async () => {
    const s = await crearSesion()
    const r = await publicarBeat(s.id, 'f'.repeat(64), { beat: 1, titulo: 'x' })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it('rechaza una sesión que no existe', async () => {
    const r = await publicarBeat('no-existe', 'f'.repeat(64), { beat: 1, titulo: 'x' })
    expect(r).toMatchObject({ ok: false, status: 404 })
  })

  it('rechaza un beat que no es un entero no negativo', async () => {
    const s = await crearSesion()
    const secreto = await secretoDeSesion(s.id)
    expect(await publicarBeat(s.id, secreto, { beat: -1, titulo: 'x' })).toMatchObject({ status: 400 })
    expect(await publicarBeat(s.id, secreto, { beat: 1.5, titulo: 'x' })).toMatchObject({ status: 400 })
  })

  it('con el bus caído, persiste el beat y NO lanza', async () => {
    // Es el caso que decide si la sustentación sigue o se cae: Upstash no
    // responde. El estado debe quedar correcto para el siguiente snapshot.
    const roto: PresentStore = {
      ...createMemoryStore(),
      publish: async () => {
        throw new Error('Redis respondió 500')
      },
    }
    __setPresentStore(roto)

    const s = await crearSesion()
    const secreto = await secretoDeSesion(s.id)

    const r = await publicarBeat(s.id, secreto, { beat: 7, titulo: 'Cobertura', dato: '68,32%' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.snapshot.beat).toBe(7)
    expect((await sesionActual())?.beat).toBe(7)
  })
})

describe('crearPublicador (navegador) · fail-open', () => {
  const opts = { sessionId: 'abc', secreto: 'def' }

  it('devuelve void de forma síncrona, no una promesa', () => {
    const publicar = crearPublicador({ ...opts, fetchImpl: (async () => new Response('{}')) as typeof fetch })
    expect(publicar(0, 'uno')).toBeUndefined()
  })

  it('no lanza cuando la red falla', async () => {
    const publicar = crearPublicador({
      ...opts,
      fetchImpl: (() => Promise.reject(new Error('Failed to fetch'))) as typeof fetch,
    })
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    expect(() => publicar(1, 'dos')).not.toThrow()
    await new Promise((r) => setTimeout(r, 5))
    expect(debug).toHaveBeenCalled()
  })

  it('no lanza cuando fetch revienta de forma síncrona', () => {
    const publicar = crearPublicador({
      ...opts,
      fetchImpl: (() => {
        throw new Error('fetch no disponible')
      }) as unknown as typeof fetch,
    })
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    expect(() => publicar(2, 'tres')).not.toThrow()
  })

  it('NO espera a la respuesta: retorna aunque el envío nunca termine', () => {
    // Upstash caído se comporta como una petición que no vuelve. Si esta
    // llamada esperase, la flecha del presentador se congelaría delante del
    // jurado. El umbral es generoso a propósito: lo que se afirma es que no
    // hay await, no un presupuesto de milisegundos.
    const publicar = crearPublicador({
      ...opts,
      fetchImpl: (() => new Promise<Response>(() => {})) as typeof fetch,
    })
    const t0 = performance.now()
    publicar(3, 'cuatro')
    const transcurrido = performance.now() - t0
    expect(transcurrido).toBeLessThan(20)
  })

  it('aborta el envío al vencer el timeout', async () => {
    let señal: AbortSignal | undefined
    const publicar = crearPublicador({
      ...opts,
      timeoutMs: 10,
      fetchImpl: ((_u: string, init: RequestInit) => {
        señal = init.signal as AbortSignal
        return new Promise<Response>(() => {})
      }) as unknown as typeof fetch,
    })
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    publicar(4, 'cinco')
    expect(señal?.aborted).toBe(false)
    await new Promise((r) => setTimeout(r, 40))
    expect(señal?.aborted).toBe(true)
  })

  it('sin credenciales de sesión es un no-op silencioso', () => {
    const fetchImpl = vi.fn()
    const publicar = crearPublicador({
      sessionId: '',
      secreto: '',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(() => publicar(0, 'x')).not.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('envía el contrato plano que espera el endpoint', () => {
    let cuerpo: unknown
    const publicar = crearPublicador({
      ...opts,
      fetchImpl: ((_u: string, init: RequestInit) => {
        cuerpo = JSON.parse(String(init.body))
        return Promise.resolve(new Response('{}'))
      }) as unknown as typeof fetch,
    })
    publicar(5, 'Escalera del quiebre', '11,3% de error')
    expect(cuerpo).toEqual({
      sessionId: 'abc',
      secreto: 'def',
      beat: 5,
      titulo: 'Escalera del quiebre',
      dato: '11,3% de error',
    })
  })
})
