// El lado del canvas. Lo que se prueba aquí es sobre todo lo que NO debe
// pasar: quedarse en blanco, repintar cuatro veces por segundo, o retroceder
// porque llegó un mensaje viejo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { obedecerComandos, type EstadoSustentacion } from '../src/lib/sustentacion/obedecer'

// Mismo criterio que `sustentacion-seguir.test.ts`: el repo no tiene jsdom, y
// traerlo para esto sería una dependencia nueva. Se estabiliza lo mínimo.
type Handler = () => void
const oyentes = new Map<string, Set<Handler>>()

class EventSourceFalso {
  static instancias: EventSourceFalso[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  cerrado = false
  constructor(readonly url: string) {
    EventSourceFalso.instancias.push(this)
  }
  close() {
    this.cerrado = true
  }
}

const estado = (over: Partial<EstadoSustentacion> = {}): EstadoSustentacion => ({
  sessionId: 's1',
  beat: 1,
  titulo: 'Bienvenida',
  dato: null,
  version: 1,
  actualizadoEn: 1_000,
  beatIniciadoEn: 1_000,
  primerBeat: 1,
  ultimoBeat: 12,
  ...over,
})

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response
const fallo = (status: number) =>
  ({ ok: false, status, json: async () => ({ error: 'x' }) }) as unknown as Response

beforeEach(() => {
  oyentes.clear()
  EventSourceFalso.instancias = []
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (t: string, h: Handler) => {
      if (!oyentes.has(t)) oyentes.set(t, new Set())
      oyentes.get(t)!.add(h)
    },
    removeEventListener: (t: string, h: Handler) => oyentes.get(t)?.delete(h),
  })
  vi.stubGlobal('EventSource', EventSourceFalso)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Deja correr los timers falsos y las promesas pendientes. */
async function avanzar(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('el canvas obedece', () => {
  it('sondea dentro del presupuesto de 300 ms aunque no haya bus', async () => {
    // Es LA garantía: sin SSE, sin credenciales, el canvas se entera igual.
    const fetchImpl = vi.fn(async () => ok(estado()))
    const vistos: EstadoSustentacion[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      bus: null,
      onEstado: (e) => vistos.push(e),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await avanzar(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(vistos[0]?.beat).toBe(1)

    // Cuatro sondeos por segundo: el peor caso son 250 ms de retraso.
    await avanzar(1000)
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(4)
    parar()
  })

  it('solo repinta cuando la versión sube, no en cada sondeo', async () => {
    let actual = estado({ version: 1, beat: 1 })
    const fetchImpl = vi.fn(async () => ok(actual))
    const vistos: EstadoSustentacion[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      onEstado: (e) => vistos.push(e),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await avanzar(1000)
    expect(vistos).toHaveLength(1) // diez sondeos, un repintado

    actual = estado({ version: 2, beat: 2 })
    await avanzar(300)
    expect(vistos).toHaveLength(2)
    expect(vistos[1].beat).toBe(2)
    parar()
  })

  it('ignora un mensaje viejo del bus que llega tarde', async () => {
    // Pub/sub no garantiza orden. Aplicar el mensaje del beat 2 después del 5
    // haría retroceder la presentación delante del jurado.
    const fetchImpl = vi.fn(async () => ok(estado({ version: 5, beat: 5 })))
    const vistos: EstadoSustentacion[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      bus: { url: 'https://bus.example', token: 'ro' },
      onEstado: (e) => vistos.push(e),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await avanzar(0)
    expect(vistos.at(-1)?.beat).toBe(5)

    const es = EventSourceFalso.instancias[0]
    es.onmessage?.({ data: `message,sust:ch:s1,${JSON.stringify(estado({ version: 2, beat: 2 }))}` })
    await avanzar(0)

    expect(vistos.at(-1)?.beat).toBe(5)
    parar()
  })

  it('el bus adelanta el cambio sin esperar al siguiente sondeo', async () => {
    const fetchImpl = vi.fn(async () => ok(estado({ version: 1, beat: 1 })))
    const vistos: EstadoSustentacion[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      bus: { url: 'https://bus.example', token: 'ro' },
      onEstado: (e) => vistos.push(e),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await avanzar(0)

    const es = EventSourceFalso.instancias[0]
    // El canal es el mismo que ya escuchan los asistentes: se reusa, no se
    // inventa un segundo bus.
    expect(es.url).toContain('sust:ch:s1')

    es.onmessage?.({ data: `message,sust:ch:s1,${JSON.stringify(estado({ version: 9, beat: 7 }))}` })
    await avanzar(0)

    // Sin haber esperado los 250 ms del sondeo.
    expect(vistos.at(-1)?.beat).toBe(7)
    parar()
  })
})

describe('nunca se queda en blanco', () => {
  it('con Redis caído (503) conserva el último beat y avisa', async () => {
    let respuesta = ok(estado({ version: 3, beat: 3 }))
    const fetchImpl = vi.fn(async () => respuesta)
    const vistos: EstadoSustentacion[] = []
    const conexiones: string[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      onEstado: (e) => vistos.push(e),
      onConexion: (c) => conexiones.push(c),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await avanzar(0)
    expect(vistos.at(-1)?.beat).toBe(3)

    respuesta = fallo(503)
    await avanzar(2000)

    // Ni un `onEstado` con nada dentro: el canvas sigue pintando el beat 3.
    expect(vistos).toHaveLength(1)
    expect(conexiones.at(-1)).toBe('sin-enlace')
    parar()
  })

  it('con la sesión expirada (404) tampoco borra la pantalla', async () => {
    let respuesta = ok(estado({ version: 4, beat: 4 }))
    const fetchImpl = vi.fn(async () => respuesta)
    const vistos: EstadoSustentacion[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      onEstado: (e) => vistos.push(e),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await avanzar(0)

    respuesta = fallo(404)
    await avanzar(2000)

    expect(vistos).toHaveLength(1)
    expect(vistos[0].beat).toBe(4)
    parar()
  })

  it('se recupera solo cuando la red vuelve', async () => {
    let respuesta = fallo(503)
    const fetchImpl = vi.fn(async () => respuesta)
    const vistos: EstadoSustentacion[] = []
    const conexiones: string[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      onEstado: (e) => vistos.push(e),
      onConexion: (c) => conexiones.push(c),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await avanzar(1000)
    expect(conexiones.at(-1)).toBe('sin-enlace')

    respuesta = ok(estado({ version: 6, beat: 6 }))
    await avanzar(300)

    expect(vistos.at(-1)?.beat).toBe(6)
    expect(conexiones.at(-1)).toBe('sondeando')
    parar()
  })

  it('un fetch que lanza no rompe el ciclo de sondeo', async () => {
    // Sin red, `fetch` rechaza. Si eso escapara, el intervalo moriría y el
    // canvas se quedaría congelado para siempre sin que nada lo delatara.
    let lanzar = true
    const fetchImpl = vi.fn(async () => {
      if (lanzar) throw new Error('network error')
      return ok(estado({ version: 2, beat: 2 }))
    })
    const vistos: EstadoSustentacion[] = []

    const parar = obedecerComandos({
      sessionId: 's1',
      onEstado: (e) => vistos.push(e),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await avanzar(1000)
    lanzar = false
    await avanzar(300)

    expect(vistos.at(-1)?.beat).toBe(2)
    parar()
  })

  it('no acumula sondeos solapados cuando la red va lenta', async () => {
    // Con respuestas de 2 s y sondeos de 250 ms, sin el guarda habría ocho
    // peticiones en vuelo y las respuestas llegarían desordenadas.
    const pendientes: ((r: Response) => void)[] = []
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((res) => {
          pendientes.push(res)
        })
    )

    const parar = obedecerComandos({
      sessionId: 's1',
      onEstado: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await avanzar(2000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    pendientes.shift()?.(ok(estado()))
    await avanzar(300)
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1)
    parar()
  })

  it('al parar cierra el bus y deja de sondear', async () => {
    const fetchImpl = vi.fn(async () => ok(estado()))
    const parar = obedecerComandos({
      sessionId: 's1',
      bus: { url: 'https://bus.example', token: 'ro' },
      onEstado: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await avanzar(0)

    parar()
    const llamadas = fetchImpl.mock.calls.length
    await avanzar(2000)

    expect(fetchImpl.mock.calls.length).toBe(llamadas)
    expect(EventSourceFalso.instancias[0].cerrado).toBe(true)
  })
})
