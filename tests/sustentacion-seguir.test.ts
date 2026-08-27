import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seguirSustentacion, type BeatSnapshot } from '../src/lib/sustentacion/seguir'

// El repo no tiene jsdom ni happy-dom, y traerlo solo para esto sería una
// dependencia nueva para probar tres líneas. Se estabiliza lo mínimo que el
// módulo toca del navegador: `document`, `fetch` y `EventSource`.

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

const snap = (over: Partial<BeatSnapshot> = {}): BeatSnapshot => ({
  sessionId: 's1',
  pin: 'k4m7',
  beat: 1,
  titulo: 'Arquitectura',
  dato: '32 nodos',
  version: 1,
  ...over,
})

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response
const noEncontrado = () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response

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
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('seguidor · camino normal', () => {
  it('pide el snapshot al arrancar y lo entrega', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(snap({ beat: 4, titulo: 'Punto de quiebre' }))))
    const recibidos: BeatSnapshot[] = []
    const parar = seguirSustentacion({ sessionId: 's1', bus: null, onSnapshot: (s) => recibidos.push(s) })
    await vi.waitFor(() => expect(recibidos).toHaveLength(1))
    expect(recibidos[0].beat).toBe(4)
    expect(recibidos[0].titulo).toBe('Punto de quiebre')
    parar()
  })

  it('descarta un snapshot viejo que llega tarde', async () => {
    // Pub/sub no garantiza orden: un mensaje rezagado no puede hacer retroceder
    // la presentación delante del jurado.
    const respuestas = [ok(snap({ version: 5, beat: 5 })), ok(snap({ version: 2, beat: 2 }))]
    vi.stubGlobal('fetch', vi.fn(async () => respuestas.shift()!))
    const recibidos: BeatSnapshot[] = []
    const parar = seguirSustentacion({ sessionId: 's1', bus: null, onSnapshot: (s) => recibidos.push(s) })
    await vi.waitFor(() => expect(recibidos).toHaveLength(1))

    const es = new EventSourceFalso('x')
    void es
    parar()
    expect(recibidos.map((r) => r.beat)).toEqual([5])
  })

  it('con bus, se suscribe al canal sust: y marca en-vivo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(snap())))
    const estados: string[] = []
    const recibidos: BeatSnapshot[] = []
    const parar = seguirSustentacion({
      sessionId: 's1',
      bus: { url: 'https://bus.upstash.io', token: 'ro-token' },
      onSnapshot: (s) => recibidos.push(s),
      onEstado: (e) => estados.push(e),
    })

    const es = EventSourceFalso.instancias[0]
    expect(es.url).toContain('/subscribe/sust:ch:s1')
    expect(es.url).toContain('_token=ro-token')

    es.onopen!()
    expect(estados).toContain('en-vivo')

    // Upstash entrega `message,<canal>,<payload>`.
    es.onmessage!({ data: `message,sust:ch:s1,${JSON.stringify(snap({ version: 9, beat: 9 }))}` })
    expect(recibidos.at(-1)!.beat).toBe(9)
    parar()
  })
})

describe('seguidor · la pantalla nunca se vacía', () => {
  it('con la sesión expirada (404) avisa pero NO emite un snapshot vacío', async () => {
    // Es el requisito central de esta vista: alguien mira el celular justo
    // cuando venció el TTL y tiene que seguir viendo el último beat.
    vi.stubGlobal('fetch', vi.fn(async () => noEncontrado()))
    const recibidos: BeatSnapshot[] = []
    const estados: string[] = []
    const parar = seguirSustentacion({
      sessionId: 's1',
      bus: null,
      onSnapshot: (s) => recibidos.push(s),
      onEstado: (e) => estados.push(e),
    })
    await vi.waitFor(() => expect(estados).toContain('terminada'))
    expect(recibidos).toHaveLength(0)
    parar()
  })

  it('sin red no lanza y no emite nada: lo que hay en pantalla se queda', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Failed to fetch')
    }))
    const recibidos: BeatSnapshot[] = []
    const estados: string[] = []
    const parar = seguirSustentacion({
      sessionId: 's1',
      bus: null,
      onSnapshot: (s) => recibidos.push(s),
      onEstado: (e) => estados.push(e),
    })
    await vi.waitFor(() => expect(estados).toContain('reintentando'))
    expect(recibidos).toHaveLength(0)
    parar()
  })
})

describe('seguidor · backoff', () => {
  it('espacia los reintentos y los reinicia al recuperar', async () => {
    vi.useFakeTimers()
    let falla = true
    const f = vi.fn(async () => {
      if (falla) throw new Error('sin red')
      return ok(snap({ version: 3, beat: 3 }))
    })
    vi.stubGlobal('fetch', f)

    const recibidos: BeatSnapshot[] = []
    const parar = seguirSustentacion({ sessionId: 's1', bus: null, onSnapshot: (s) => recibidos.push(s) })

    // Arranque: 1 intento inmediato.
    await vi.advanceTimersByTimeAsync(0)
    const trasArranque = f.mock.calls.length

    // El primer rescate llega a 1 s, no antes.
    await vi.advanceTimersByTimeAsync(999)
    expect(f.mock.calls.length).toBe(trasArranque)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.mock.calls.length).toBe(trasArranque + 1)

    // El siguiente ya no es a 1 s: el backoff lo empujó a 2 s.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(f.mock.calls.length).toBe(trasArranque + 1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(f.mock.calls.length).toBe(trasArranque + 2)

    // Vuelve la red: el siguiente intento acierta y el contador se reinicia.
    falla = false
    await vi.advanceTimersByTimeAsync(4_000)
    await vi.waitFor(() => expect(recibidos.length).toBeGreaterThan(0))
    expect(recibidos.at(-1)!.beat).toBe(3)
    parar()
  })

  it('el rescate nunca se espacia más de 15 s', async () => {
    vi.useFakeTimers()
    const f = vi.fn(async () => {
      throw new Error('sin red')
    })
    vi.stubGlobal('fetch', f)
    const parar = seguirSustentacion({ sessionId: 's1', bus: null, onSnapshot: () => {} })

    await vi.advanceTimersByTimeAsync(0)
    // Se dejan pasar varios ciclos para que el backoff llegue a su techo.
    await vi.advanceTimersByTimeAsync(120_000)
    const antes = f.mock.calls.length
    // A partir del techo, cada 15 s debe haber al menos un intento más.
    await vi.advanceTimersByTimeAsync(15_000)
    expect(f.mock.calls.length).toBeGreaterThan(antes)
    parar()
  })
})

describe('seguidor · caída del bus', () => {
  it('tras varios errores del EventSource cae al rescate por snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(snap())))
    const estados: string[] = []
    const parar = seguirSustentacion({
      sessionId: 's1',
      bus: { url: 'https://bus.upstash.io', token: 'ro' },
      onSnapshot: () => {},
      onEstado: (e) => estados.push(e),
    })
    const es = EventSourceFalso.instancias[0]
    es.onerror!()
    es.onerror!()
    expect(estados).not.toContain('reintentando')
    es.onerror!()
    expect(estados).toContain('reintentando')
    expect(es.cerrado).toBe(true)
    parar()
  })
})
