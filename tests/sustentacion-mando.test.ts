// El lado del teléfono. Lo que se prueba aquí es lo que no se puede ver en la
// pantalla del celular: que el contador no se reinicie, que el reintento no
// avance dos beats, y que un 4xx no se martillee.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  almacenSeguro,
  crearMando,
  guardarPin,
  identidadDelMando,
  leerPin,
  olvidarPin,
  reservarSeq,
  type Almacen,
} from '../src/lib/sustentacion/mando'

const PIN = 'ab3kd9mn2p'

/** `localStorage` de mentira, con un interruptor para simular el iOS privado. */
function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial))
  let rompeAlEscribir = false
  const base: Almacen & { datos: Map<string, string>; romper(): void } = {
    datos,
    romper() {
      rompeAlEscribir = true
    },
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => {
      if (rompeAlEscribir) throw new Error('QuotaExceededError')
      datos.set(k, v)
    },
    removeItem: (k) => void datos.delete(k),
  }
  return base
}

/** La firma real de `fetch`, para que las llamadas espiadas queden tipadas. */
type FetchFalso = (url: RequestInfo | URL, opts?: RequestInit) => Promise<Response>

const cuerpoDe = (llamada: [RequestInfo | URL, (RequestInit | undefined)?]) =>
  JSON.parse(String(llamada[1]?.body ?? '{}'))

const respuesta = (status: number, cuerpo: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  }) as unknown as Response

const estadoOk = (over: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  beat: 4,
  titulo: 'Plan de pruebas',
  dato: '1258 pruebas en total',
  version: 7,
  actualizadoEn: 1000,
  beatIniciadoEn: 1000,
  ahora: 1200,
  primerBeat: 1,
  ultimoBeat: 12,
  aplicado: true,
  motivo: null,
  ...over,
})

describe('identidad y contador', () => {
  it('reusa el clienteId guardado entre recargas', () => {
    const store = almacenFalso()
    const primero = identidadDelMando(store)
    expect(identidadDelMando(store)).toBe(primero)
  })

  it('genera un clienteId con la forma que exige el servidor', () => {
    // Misma regex que `parseComando`: un id que no la cumpla sería un 400 en
    // el primer toque de la sustentación y sin pista visible de por qué.
    expect(identidadDelMando(almacenFalso())).toMatch(/^[a-z0-9-]{4,64}$/)
  })

  it('descarta un clienteId guardado con forma inválida', () => {
    const store = almacenFalso({ 'rc.cliente': 'con:dos:puntos' })
    expect(identidadDelMando(store)).toMatch(/^[a-z0-9-]{4,64}$/)
    expect(identidadDelMando(store)).not.toContain(':')
  })

  it('el seq sube y sobrevive a una recarga', () => {
    const store = almacenFalso()
    expect(reservarSeq(store)).toBe(1)
    expect(reservarSeq(store)).toBe(2)
    // "Recargar" es leer el mismo almacén desde cero: si el contador volviera a
    // 1, el primer toque después de la recarga chocaría con un reclamo ya hecho
    // y el servidor lo descartaría como duplicado sin mover nada.
    expect(reservarSeq(almacenSeguro(store))).toBe(3)
  })

  it('sigue funcionando cuando localStorage lanza al escribir', () => {
    const base = almacenFalso()
    base.romper()
    const store = almacenSeguro(base)
    expect(() => identidadDelMando(store)).not.toThrow()
    expect(reservarSeq(store)).toBe(1)
    expect(reservarSeq(store)).toBe(2)
  })
})

describe('PIN', () => {
  it('solo guarda un PIN con forma válida, y lo normaliza', () => {
    const store = almacenFalso()
    expect(guardarPin(store, 'AB3KD-9MN2P')).toBe(PIN)
    expect(leerPin(store)).toBe(PIN)
    expect(guardarPin(store, 'corto')).toBeNull()
    olvidarPin(store)
    expect(leerPin(store)).toBeNull()
  })
})

describe('enviar', () => {
  let store: ReturnType<typeof almacenFalso>

  beforeEach(() => {
    store = almacenFalso()
    guardarPin(store, PIN)
  })

  it('manda pin, accion, clienteId y seq, y devuelve la posición absoluta', async () => {
    const fetchImpl = vi.fn<FetchFalso>(async () => respuesta(200, estadoOk()))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })

    const r = await mando.enviar('siguiente')

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estado.beat).toBe(4)
    expect(r.aplicado).toBe(true)

    const cuerpo = cuerpoDe(fetchImpl.mock.calls[0])
    expect(cuerpo).toMatchObject({ pin: PIN, accion: 'siguiente', seq: 1 })
    expect(cuerpo.clienteId).toMatch(/^[a-z0-9-]{4,64}$/)
    // "siguiente" no lleva beat: el destino lo decide el servidor.
    expect(cuerpo).not.toHaveProperty('beat')
  })

  it('"ir" lleva el beat destino', async () => {
    const fetchImpl = vi.fn<FetchFalso>(async () => respuesta(200, estadoOk({ beat: 9 })))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })
    await mando.enviar('ir', 9)
    const cuerpo = cuerpoDe(fetchImpl.mock.calls[0])
    expect(cuerpo.beat).toBe(9)
  })

  it('el reintento reusa el MISMO seq', async () => {
    // Este es el test que sostiene toda la idempotencia. Si el reintento
    // reservara un seq nuevo y el primer comando SÍ había llegado (solo se
    // perdió la respuesta), la presentación saltaría dos beats.
    const fetchImpl = vi
      .fn<FetchFalso>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(respuesta(200, estadoOk({ aplicado: false, motivo: 'duplicado' })))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })

    const r = await mando.enviar('siguiente')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const seqs = fetchImpl.mock.calls.map((c) => cuerpoDe(c).seq)
    expect(seqs).toEqual([1, 1])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.aplicado).toBe(false)
  })

  it('un toque nuevo después de un envío gasta un seq nuevo', async () => {
    const fetchImpl = vi.fn<FetchFalso>(async () => respuesta(200, estadoOk()))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })
    await mando.enviar('siguiente')
    await mando.enviar('siguiente')
    const seqs = fetchImpl.mock.calls.map((c) => cuerpoDe(c).seq)
    expect(seqs).toEqual([1, 2])
  })

  it('no reintenta un 403 y avisa de que el PIN no controla', async () => {
    const fetchImpl = vi.fn<FetchFalso>(async () => respuesta(403, { error: 'PIN sin permiso de control' }))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })

    const r = await mando.enviar('siguiente')

    // Insistir con un PIN malo solo quema el cupo antifuerza bruta de mi IP.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ ok: false, fallo: 'pin-rechazado' })
  })

  it('no reintenta un 429', async () => {
    const fetchImpl = vi.fn<FetchFalso>(async () => respuesta(429, { error: 'demasiados comandos' }))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await mando.enviar('siguiente')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ ok: false, fallo: 'limite' })
  })

  it('SÍ reintenta un 503 (Redis con un pico)', async () => {
    const fetchImpl = vi
      .fn<FetchFalso>()
      .mockResolvedValueOnce(respuesta(503, { error: 'no se pudo hablar con Redis' }))
      .mockResolvedValueOnce(respuesta(200, estadoOk()))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })

    const r = await mando.enviar('siguiente')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(r.ok).toBe(true)
  })

  it('distingue "no hay sesión" de "no hubo enlace"', async () => {
    const fetchImpl = vi.fn<FetchFalso>(async () => respuesta(404, { error: 'no hay sesión' }))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(await mando.enviar('siguiente')).toEqual({ ok: false, fallo: 'sin-sesion' })
  })

  it('se rinde tras agotar los intentos, sin lanzar', async () => {
    const fetchImpl = vi.fn<FetchFalso>().mockRejectedValue(new Error('sin red'))
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await mando.enviar('siguiente')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ ok: false, fallo: 'sin-enlace' })
  })

  it('sin PIN no gasta una petición', async () => {
    const vacio = almacenFalso()
    const fetchImpl = vi.fn<FetchFalso>()
    const mando = crearMando({ store: vacio, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(await mando.enviar('siguiente')).toEqual({ ok: false, fallo: 'sin-pin' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('no encola un segundo comando mientras hay uno en vuelo', async () => {
    // El pulgar nervioso: dos toques seguidos al botón grande. El servidor ya
    // corta el duplicado, pero un comando que ni sale es una petición menos en
    // el único momento en el que la red importa.
    let resolver: (r: Response) => void = () => {}
    const fetchImpl = vi.fn<FetchFalso>(
      () =>
        new Promise<Response>((res) => {
          resolver = res
        })
    )
    const mando = crearMando({ store, fetchImpl: fetchImpl as unknown as typeof fetch })

    const primero = mando.enviar('siguiente')
    expect(mando.ocupado()).toBe(true)
    expect(await mando.enviar('siguiente')).toEqual({ ok: false, fallo: 'ocupado' })

    resolver(respuesta(200, estadoOk()))
    await primero
    expect(mando.ocupado()).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
