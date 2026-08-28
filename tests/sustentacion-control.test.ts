// Canal inverso de la sustentación: el teléfono manda, el canvas obedece.
//
// La prueba que da nombre a este archivo es la del comando duplicado. Todo lo
// demás son guardas alrededor de ella.

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { createMemoryStore, __setPresentStore, type PresentStore } from '../src/lib/present/store'
import { crearSesion, getSesion, pinPresentadorDe, sesionActual } from '../src/lib/sustentacion/bus'
import {
  beatDestino,
  ejecutarComando,
  leerEstado,
  parseComando,
  type ComandoEntrada,
} from '../src/lib/sustentacion/control'
import { BEAT_PRIMERO, BEAT_ULTIMO, BEATS } from '../src/lib/sustentacion/guion'
import {
  formatearPinPresentador,
  normalizarPinPresentador,
  pinDesdeBytes,
  PIN_PRESENTADOR_LONGITUD,
  sonDistintos,
} from '../src/lib/sustentacion/pin-presentador'
import { isPinShape } from '../src/lib/present/pin'

const IP = '203.0.113.7'

beforeEach(() => {
  __setPresentStore(createMemoryStore())
})

afterEach(() => {
  __setPresentStore(null)
})

/** Sesión nueva + su PIN de control, que es lo que teclea el celular. */
async function sesionConPin() {
  const s = await crearSesion('Sustentación')
  return { sesion: s, pin: await pinPresentadorDe(s.id) }
}

const comando = (pin: string, extra: Partial<ComandoEntrada> = {}): ComandoEntrada => ({
  pin,
  accion: 'siguiente',
  clienteId: 'celular-mike',
  seq: 1,
  ...extra,
})

describe('los dos PINes', () => {
  it('el de presentador es más largo que el de asistente y NO tiene su forma', async () => {
    const { sesion, pin } = await sesionConPin()

    expect(sesion.pin).toHaveLength(4)
    expect(pin).toHaveLength(PIN_PRESENTADOR_LONGITUD)
    expect(pin.length).toBeGreaterThan(sesion.pin.length)

    // Que no pase por `isPinShape` importa de verdad: es el filtro de la ruta
    // comodín `/{pin}`. Un PIN de presentador con forma de PIN de asistente
    // sería una credencial de control publicable en una URL.
    expect(isPinShape(pin)).toBe(false)
  })

  it('nunca coinciden, y son distintos entre sesiones', async () => {
    const a = await sesionConPin()
    __setPresentStore(createMemoryStore())
    const b = await sesionConPin()

    expect(sonDistintos(a.sesion.pin, a.pin)).toBe(true)
    expect(sonDistintos(b.sesion.pin, b.pin)).toBe(true)
    expect(a.pin).not.toBe(b.pin)
  })

  it('es estable para la misma sesión: recargar el control no lo cambia', async () => {
    const { sesion } = await sesionConPin()
    expect(await pinPresentadorDe(sesion.id)).toBe(await pinPresentadorDe(sesion.id))
  })

  it('no se guarda en Redis: no está en el JSON de la sesión', async () => {
    // Es la invariante que permite que el token de SOLO LECTURA del bus viaje
    // al navegador de cada asistente. Si el PIN de control estuviera aquí,
    // cualquiera del público podría leerlo y quedarse con el mando.
    const { sesion, pin } = await sesionConPin()
    const crudo = await createMemoryStoreLeer(`sust:s:${sesion.id}`)
    expect(crudo).toBeTruthy()
    expect(crudo).not.toContain(pin)
  })

  it('se normaliza lo que sale de un teclado de celular', () => {
    const pin = 'ab3kd9mn2p'
    // Guiones del formato legible, mayúscula del autocorrector, espacio suelto.
    expect(normalizarPinPresentador('AB3KD-9MN2P')).toBe(pin)
    expect(normalizarPinPresentador(' ab3kd 9mn2p ')).toBe(pin)
    expect(formatearPinPresentador(pin)).toBe('ab3kd-9mn2p')

    expect(normalizarPinPresentador('ab3kd')).toBeNull()
    expect(normalizarPinPresentador('ab3kd9mn2p0')).toBeNull()
    // `i`, `l`, `o`, `0` y `1` no están en el alfabeto: se confunden al leer.
    expect(normalizarPinPresentador('ab3kd9mn2i')).toBeNull()
  })

  it('la derivación de bytes a PIN no tiene sesgo de módulo', () => {
    // 248..255 caen en la zona de rechazo (31 × 8 = 248). Si el rechazo no
    // funcionara, esos bytes producirían símbolos del principio del alfabeto.
    const bytes = new Uint8Array([248, 249, 250, 251, 252, 253, 254, 255, ...Array(10).fill(0)])
    expect(pinDesdeBytes(bytes)).toHaveLength(PIN_PRESENTADOR_LONGITUD)
    expect(pinDesdeBytes(bytes)).toBe('aaaaaaaaaa')
  })
})

describe('idempotencia', () => {
  it('EL CASO: el mismo comando dos veces NO avanza dos beats', async () => {
    // Mala señal, el pulgar insiste, y el teléfono manda dos veces el mismo
    // (clienteId, seq). Es lo que de verdad pasa en un salón.
    const { sesion, pin } = await sesionConPin()
    expect(sesion.beat).toBe(0)

    const primero = await ejecutarComando(comando(pin, { seq: 1 }), IP)
    const segundo = await ejecutarComando(comando(pin, { seq: 1 }), IP)

    expect(primero).toMatchObject({ ok: true, aplicado: true })
    expect(segundo).toMatchObject({ ok: true, aplicado: false, motivo: 'duplicado' })

    // Lo que importa: la posición, no el veredicto.
    if (primero.ok) expect(primero.estado.beat).toBe(BEAT_PRIMERO)
    if (segundo.ok) expect(segundo.estado.beat).toBe(BEAT_PRIMERO)
    expect((await getSesion(sesion.id))?.beat).toBe(BEAT_PRIMERO)
  })

  it('resiste el doble toque también con las dos peticiones EN VUELO a la vez', async () => {
    // La versión difícil del caso anterior: sin `await` entre medias, que es
    // como llegan de verdad dos reintentos de una red mala. Un contador leído
    // y escrito con get+set fallaría aquí y avanzaría dos beats.
    const { sesion, pin } = await sesionConPin()

    const resultados = await Promise.all([
      ejecutarComando(comando(pin, { seq: 1 }), IP),
      ejecutarComando(comando(pin, { seq: 1 }), IP),
      ejecutarComando(comando(pin, { seq: 1 }), IP),
    ])

    const aplicados = resultados.filter((r) => r.ok && r.aplicado)
    expect(aplicados).toHaveLength(1)
    expect((await getSesion(sesion.id))?.beat).toBe(BEAT_PRIMERO)

    // Ninguna respuesta puede ir POR DELANTE del estado real: lo que no se
    // tolera es que alguna anuncie un beat de más. Que una copia perdedora
    // conteste con la posición anterior, cuando las tres van tan pegadas que
    // ni la relectura alcanza a ver el cambio, es inofensivo por diseño: el
    // ciclo siguiente de `/estado` trae la posición absoluta.
    for (const r of resultados) {
      expect(r.ok && r.estado.beat).toBeLessThanOrEqual(BEAT_PRIMERO)
    }

    // Y el reintento REAL (el que llega tarde, tras un timeout) sí ve la
    // posición ya aplicada, que es el caso que de verdad ocurre en un salón.
    const tardio = await ejecutarComando(comando(pin, { seq: 1 }), IP)
    expect(tardio).toMatchObject({ ok: true, aplicado: false, motivo: 'duplicado' })
    expect(tardio.ok && tardio.estado.beat).toBe(BEAT_PRIMERO)
  })

  it('un seq nuevo sí avanza: la idempotencia no bloquea el avance normal', async () => {
    const { sesion, pin } = await sesionConPin()

    await ejecutarComando(comando(pin, { seq: 1 }), IP)
    await ejecutarComando(comando(pin, { seq: 1 }), IP) // duplicado, no cuenta
    await ejecutarComando(comando(pin, { seq: 2 }), IP)
    await ejecutarComando(comando(pin, { seq: 3 }), IP)

    expect((await getSesion(sesion.id))?.beat).toBe(BEAT_PRIMERO + 2)
  })

  it('descarta un comando que llega tarde y fuera de orden', async () => {
    // El seq 2 se quedó atascado en la red y aparece después del 5. Aplicarlo
    // ahora haría retroceder la presentación por un mensaje viejo.
    const { sesion, pin } = await sesionConPin()

    await ejecutarComando(comando(pin, { seq: 1 }), IP)
    await ejecutarComando(comando(pin, { seq: 5 }), IP)
    const beatAntes = (await getSesion(sesion.id))?.beat

    const tarde = await ejecutarComando(comando(pin, { seq: 2, accion: 'anterior' }), IP)

    expect(tarde).toMatchObject({ ok: true, aplicado: false, motivo: 'fuera-de-orden' })
    expect((await getSesion(sesion.id))?.beat).toBe(beatAntes)
  })

  it('dos controles distintos llevan contadores independientes', async () => {
    // El celular y el portátil pueden ir los dos por seq 1 sin pisarse.
    const { sesion, pin } = await sesionConPin()

    await ejecutarComando(comando(pin, { clienteId: 'celular-mike', seq: 1 }), IP)
    const otro = await ejecutarComando(comando(pin, { clienteId: 'portatil-mike', seq: 1 }), IP)

    expect(otro).toMatchObject({ ok: true, aplicado: true })
    expect((await getSesion(sesion.id))?.beat).toBe(BEAT_PRIMERO + 1)
  })
})

describe('posición absoluta', () => {
  it('el comando es relativo y la respuesta nunca lo es', async () => {
    const { pin } = await sesionConPin()

    const r = await ejecutarComando(comando(pin, { seq: 1, accion: 'siguiente' }), IP)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    // Nada de "avanzaste uno": un beat concreto, con todo lo necesario para
    // repintar el canvas desde cero.
    expect(r.estado.beat).toBe(BEAT_PRIMERO)
    expect(r.estado.titulo).toBe(BEATS[0].vista_celular.titulo)
    expect(r.estado.primerBeat).toBe(BEAT_PRIMERO)
    expect(r.estado.ultimoBeat).toBe(BEAT_ULTIMO)
    expect(typeof r.estado.beatIniciadoEn).toBe('number')
  })

  it('`ir` salta a un beat concreto y trae su título del guion', async () => {
    const { pin } = await sesionConPin()

    const r = await ejecutarComando(comando(pin, { seq: 1, accion: 'ir', beat: 8 }), IP)
    expect(r.ok && r.estado.beat).toBe(8)
    // El teléfono manda intención, no contenido: el texto sale del guion.
    expect(r.ok && r.estado.titulo).toBe('Punto de quiebre')
    expect(r.ok && r.estado.dato).toBe('100 req/s → 1.9% error')
  })

  it('el cronómetro del beat se reinicia solo cuando el beat cambia', async () => {
    const { pin } = await sesionConPin()

    const uno = await ejecutarComando(comando(pin, { seq: 1, accion: 'ir', beat: 4 }), IP)
    const repetido = await ejecutarComando(comando(pin, { seq: 2, accion: 'ir', beat: 4 }), IP)
    const dos = await ejecutarComando(comando(pin, { seq: 3, accion: 'siguiente' }), IP)

    if (!uno.ok || !repetido.ok || !dos.ok) throw new Error('comandos fallidos')
    expect(repetido.aplicado).toBe(false)
    expect(repetido.estado.beatIniciadoEn).toBe(uno.estado.beatIniciadoEn)
    expect(dos.estado.beatIniciadoEn).toBeGreaterThanOrEqual(uno.estado.beatIniciadoEn)
  })

  it('no se pasa de los topes del guion', () => {
    // Puro, sin Redis: `siguiente` en el último beat es un tope, NO el final de
    // la sesión. Cerrar la presentación sola durante las preguntas del jurado
    // sería el peor fallo posible de esta feature.
    const ultimo = { accion: 'siguiente' } as ComandoEntrada
    expect(beatDestino(BEAT_ULTIMO, ultimo)).toBe(BEAT_ULTIMO)
    expect(beatDestino(BEAT_PRIMERO, { accion: 'anterior' } as ComandoEntrada)).toBe(BEAT_PRIMERO)
    // Beat 0 es "aún no he empezado": cualquier avance entra al primer beat.
    expect(beatDestino(0, ultimo)).toBe(BEAT_PRIMERO)
    expect(beatDestino(0, { accion: 'anterior' } as ComandoEntrada)).toBe(BEAT_PRIMERO)
  })

  it('en el tope responde igual, con la posición y sin aplicar', async () => {
    const { pin } = await sesionConPin()
    await ejecutarComando(comando(pin, { seq: 1, accion: 'ir', beat: BEAT_ULTIMO }), IP)

    const tope = await ejecutarComando(comando(pin, { seq: 2, accion: 'siguiente' }), IP)
    expect(tope).toMatchObject({ ok: true, aplicado: false, motivo: 'sin-cambio' })
    expect(tope.ok && tope.estado.beat).toBe(BEAT_ULTIMO)
  })
})

describe('autorización por PIN', () => {
  it('el PIN de ASISTENTE no controla nada', async () => {
    // Es la razón de ser de los dos PINes: el de asistente va proyectado en la
    // pantalla, delante del jurado y del público entero.
    const { sesion } = await sesionConPin()

    const r = await ejecutarComando(comando(sesion.pin.padEnd(10, 'x')), IP)
    expect(r).toMatchObject({ ok: false })
  })

  it('rechaza un PIN inventado sin decir por qué', async () => {
    await sesionConPin()
    const r = await ejecutarComando(comando('ab3kd9mn2p'), IP)
    expect(r).toMatchObject({ ok: false, status: 403 })
    // El mensaje no distingue "PIN de asistente" de "PIN inventado".
    expect(r.ok === false && r.error).toBe('PIN sin permiso de control')
  })

  it('corta la fuerza bruta sobre el PIN antes de que llegue a ninguna parte', async () => {
    const { pin } = await sesionConPin()

    for (let i = 0; i < 10; i++) {
      await ejecutarComando(comando('ab3kd9mn2p', { seq: i + 1 }), IP)
    }

    // El 11º intento ya no se evalúa, ni siquiera acertando el PIN bueno.
    const bloqueado = await ejecutarComando(comando(pin, { seq: 99 }), IP)
    expect(bloqueado).toMatchObject({ ok: false, status: 429 })

    // Y la IP de al lado sigue funcionando: el cupo es por IP, no global.
    const otraIp = await ejecutarComando(comando(pin, { seq: 100 }), '198.51.100.4')
    expect(otraIp).toMatchObject({ ok: true, aplicado: true })
  })

  it('limita el ritmo de comandos aunque el PIN sea el correcto', async () => {
    const { pin } = await sesionConPin()

    const resultados = []
    for (let i = 1; i <= 45; i++) {
      resultados.push(await ejecutarComando(comando(pin, { seq: i }), '198.51.100.9'))
    }

    expect(resultados.some((r) => !r.ok && r.status === 429)).toBe(true)
  })
})

describe('validación de la entrada', () => {
  it('rechaza lo que no puede convertirse en un comando', () => {
    const pin = 'ab3kd9mn2p'
    expect(parseComando(null).ok).toBe(false)
    expect(parseComando({ ...comando(pin), accion: 'borrar' }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), pin: 'ab3k' }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), seq: 0 }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), seq: 1.5 }).ok).toBe(false)
    // `ir` sin beat, o con uno fuera del guion.
    expect(parseComando({ ...comando(pin), accion: 'ir' }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), accion: 'ir', beat: 99 }).ok).toBe(false)
  })

  it('rechaza un clienteId que podría romper una clave de Redis', () => {
    // Los dos puntos separan segmentos en las claves: un clienteId con `:`
    // podría apuntar el reclamo de idempotencia a otra sesión.
    const pin = 'ab3kd9mn2p'
    expect(parseComando({ ...comando(pin), clienteId: 'a:b:c' }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), clienteId: '*' }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), clienteId: 'ab' }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), clienteId: 'x'.repeat(65) }).ok).toBe(false)
    expect(parseComando({ ...comando(pin), clienteId: 'CELULAR-Mike' }).ok).toBe(true)
  })
})

describe('cuando Redis no responde', () => {
  const caido = (): PresentStore => ({
    ...createMemoryStore(),
    get: async () => {
      throw new Error('Redis respondió 500')
    },
    incr: async () => {
      throw new Error('Redis respondió 500')
    },
  })

  it('/estado da un error claro con 503 y no un beat inventado', async () => {
    __setPresentStore(caido())
    const r = await leerEstado()

    expect(r).toMatchObject({ ok: false, status: 503 })
    // El canvas distingue esto de un 404 y conserva el último beat conocido.
    expect(r.ok === false && r.error).toContain('Redis')
  })

  it('/comando falla con 503 en vez de lanzar', async () => {
    // Que no lance es lo que evita el 500 opaco: el control remoto puede
    // mostrar "sin conexión" y seguir ofreciendo el teclado del canvas.
    __setPresentStore(caido())
    const r = await ejecutarComando(comando('ab3kd9mn2p'), IP)
    expect(r).toMatchObject({ ok: false, status: 503 })
  })

  it('sin sesión en curso responde 404, que NO es lo mismo que Redis caído', async () => {
    const r = await leerEstado()
    expect(r).toMatchObject({ ok: false, status: 404 })
  })
})

describe('lectura del estado', () => {
  it('devuelve la sesión en curso sin necesidad de sessionId', async () => {
    const { pin } = await sesionConPin()
    await ejecutarComando(comando(pin, { seq: 1, accion: 'ir', beat: 6 }), IP)

    const r = await leerEstado()
    expect(r.ok && r.estado.beat).toBe(6)
    expect(r.ok && r.estado.sessionId).toBe((await sesionActual())?.id)
  })

  it('acepta un sessionId explícito, que es una lectura menos', async () => {
    const { sesion, pin } = await sesionConPin()
    await ejecutarComando(comando(pin, { seq: 1 }), IP)

    const r = await leerEstado(sesion.id)
    expect(r.ok && r.estado.sessionId).toBe(sesion.id)
  })
})

/** Lee una clave cruda del almacén activo, para inspeccionar lo que se guardó. */
async function createMemoryStoreLeer(clave: string): Promise<string | null> {
  const { presentStore } = await import('../src/lib/present/store')
  return presentStore().get(clave)
}
