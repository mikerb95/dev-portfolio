import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { crearMedidor, medidorDesdeEnv, type OpcionesMedidor } from '../instrumentacion/medidor'
import { validarLote } from '../src/lib/computo/lote'
import { verificarLote } from '../src/lib/computo/firma'

// El medidor corre en el proyecto del cliente y no puede importar nada de
// aquí, así que la firma y el formato del lote están escritos dos veces. Estas
// pruebas son las que impiden que las dos copias diverjan: lo que el medidor
// envía tiene que pasar por `verificarLote` y `validarLote` tal cual.

const HORA = 3_600_000
const T0 = Date.parse('2026-09-22T15:00:00Z')
const SECRETO = 'a'.repeat(64)

interface Envio {
  url: string
  headers: Record<string, string>
  cuerpo: string
}

/** Medidor con reloj, CPU y transporte de mentira. */
function banco(extra: Partial<OpcionesMedidor> & { respuestas?: (number | 'red')[] } = {}) {
  let ahora = T0
  let cpu = 0
  let n = 0
  const envios: Envio[] = []
  const respuestas = [...(extra.respuestas ?? [])]
  const medidor = crearMedidor({
    endpoint: 'https://panel.test/api/computo/ingest',
    proyecto: 'cliente-uno',
    secreto: SECRETO,
    reloj: () => ahora,
    cpuMs: () => cpu,
    nuevoId: () => `lote-${String(++n).padStart(4, '0')}`,
    fetch: async (url, init) => {
      envios.push({ url, headers: init.headers as Record<string, string>, cuerpo: init.body as string })
      const r = respuestas.shift() ?? 200
      if (r === 'red') throw new TypeError('fetch failed')
      return new Response(null, { status: r })
    },
    ...extra,
  })
  return {
    medidor,
    envios,
    avanzar: (ms: number) => { ahora += ms },
    gastarCpu: (ms: number) => { cpu += ms },
    get ahora() { return ahora },
  }
}

const cuerpo = (e: Envio) => JSON.parse(e.cuerpo) as { batchId: string; muestras: Record<string, number>[] }

describe('contrato con la ingesta', () => {
  it('lo que envía pasa la verificación de firma y la validación del lote', async () => {
    const b = banco()
    const cerrar = b.medidor.iniciar(120)
    b.gastarCpu(40)
    b.avanzar(900)
    cerrar(5_000)
    await b.medidor.vaciar()

    expect(b.envios).toHaveLength(1)
    const [e] = b.envios
    expect(e.headers['x-computo-project']).toBe('cliente-uno')
    expect(e.headers['content-type']).toBe('application/json')
    const firma = verificarLote(e.headers['x-computo-timestamp'], e.headers['x-computo-signature'], e.cuerpo, SECRETO, b.ahora)
    expect(firma).toBe('ok')

    const lote = validarLote(JSON.parse(e.cuerpo), b.ahora)
    expect(lote.ok).toBe(true)
    if (!lote.ok) return
    expect(lote.lote.muestras).toEqual([{
      hora: T0,
      cpuMs: 40,
      gbMs: 900 * 2, // 900 ms ocupados con 2 GB
      invocaciones: 1,
      transferBytes: 5_000,
      originTransferBytes: 5_120,
      edgeRequests: 1,
    }])
  })

  it('la firma no valida con otro secreto', async () => {
    const b = banco()
    b.medidor.iniciar()(10)
    await b.medidor.vaciar()
    const [e] = b.envios
    expect(verificarLote(e.headers['x-computo-timestamp'], e.headers['x-computo-signature'], e.cuerpo, 'b'.repeat(64), b.ahora)).toBe('firma_invalida')
  })
})

describe('memoria por tiempo ocupado', () => {
  it('dos peticiones solapadas cuentan el tiempo una sola vez, como Vercel', () => {
    const b = banco()
    const a = b.medidor.iniciar()
    b.avanzar(500)
    const c = b.medidor.iniciar()
    b.avanzar(500)
    a(0)
    b.avanzar(500)
    c(0)
    const [h] = b.medidor.estado().horas
    // Ocupado de 0 a 1500 ms, no 1000 + 1000.
    expect(h.gbMs).toBe(1_500 * 2)
    expect(h.invocaciones).toBe(2)
  })

  it('el tiempo sin peticiones en curso no cuenta', () => {
    const b = banco()
    b.medidor.iniciar()(0) // instantánea
    b.avanzar(60_000)
    const c = b.medidor.iniciar()
    b.avanzar(200)
    c(0)
    expect(b.medidor.estado().horas[0].gbMs).toBe(200 * 2)
  })

  it('parte un intervalo que cruza el cambio de hora', () => {
    // Intervalo largo: a los 10 min el medidor ya habría enviado el lote.
    const b = banco({ intervaloMs: 10 * HORA })
    b.avanzar(HORA - 300)
    const c = b.medidor.iniciar()
    b.avanzar(800)
    c(0)
    const horas = b.medidor.estado().horas
    expect(horas.find((h) => h.hora === T0)?.gbMs).toBe(300 * 2)
    expect(horas.find((h) => h.hora === T0 + HORA)?.gbMs).toBe(500 * 2)
  })

  it('respeta la memoria configurada', () => {
    const b = banco({ memoriaMb: 4096 })
    const c = b.medidor.iniciar()
    b.avanzar(100)
    c(0)
    expect(b.medidor.estado().horas[0].gbMs).toBe(100 * 4)
  })

  it('al vaciar con peticiones en curso, cuenta lo ocupado sin contarlo dos veces', async () => {
    const b = banco()
    const c = b.medidor.iniciar()
    b.avanzar(300)
    await b.medidor.vaciar()
    b.avanzar(200)
    c(0)
    await b.medidor.vaciar()
    const total = b.envios.flatMap((e) => cuerpo(e).muestras).reduce((s, m) => s + m.gbMs, 0)
    expect(total).toBe(500 * 2)
  })
})

describe('CPU', () => {
  it('cuenta la CPU del proceso entre marcas, incluido el arranque en frío', () => {
    const b = banco()
    b.gastarCpu(250) // CPU gastada antes de la primera petición
    const c = b.medidor.iniciar()
    b.gastarCpu(30)
    c(0)
    expect(b.medidor.estado().horas[0].cpuMs).toBe(280)
  })

  it('una lectura de CPU que falla no tumba la petición', () => {
    const b = banco({ cpuMs: () => { throw new Error('sin cpuUsage') } })
    const c = b.medidor.iniciar()
    c(10)
    const [h] = b.medidor.estado().horas
    expect(h.invocaciones).toBe(1)
    expect(h.cpuMs).toBe(0)
  })
})

describe('envío y reintentos', () => {
  it('un 503 deja el lote en cola y el reintento manda el MISMO batchId', async () => {
    const b = banco({ respuestas: [503, 200] })
    b.medidor.iniciar()(10)
    await b.medidor.vaciar()
    expect(b.medidor.estado().pendientes).toBe(1)
    b.avanzar(10 * 60_000)
    await b.medidor.vaciar()
    expect(b.medidor.estado().pendientes).toBe(0)
    expect(b.envios).toHaveLength(2)
    expect(cuerpo(b.envios[1]).batchId).toBe(cuerpo(b.envios[0]).batchId)
    expect(b.envios[1].cuerpo).toBe(b.envios[0].cuerpo)
    // Firma nueva con timestamp nuevo: la vieja ya estaría fuera de la ventana.
    expect(b.envios[1].headers['x-computo-timestamp']).not.toBe(b.envios[0].headers['x-computo-timestamp'])
  })

  it('una red caída también se reintenta', async () => {
    const b = banco({ respuestas: ['red', 200] })
    b.medidor.iniciar()(10)
    await b.medidor.vaciar()
    expect(b.medidor.estado().pendientes).toBe(1)
    await b.medidor.vaciar()
    expect(b.medidor.estado().pendientes).toBe(0)
  })

  it('un 4xx se descarta: reintentarlo no lo arregla', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const b = banco({ respuestas: [401] })
    b.medidor.iniciar()(10)
    await b.medidor.vaciar()
    expect(b.medidor.estado().pendientes).toBe(0)
    await b.medidor.vaciar()
    expect(b.envios).toHaveLength(1)
    error.mockRestore()
  })

  it('con la ingesta caída no se salta lotes: se detiene en el primero', async () => {
    const b = banco({ respuestas: [503, 503, 200, 200] })
    b.medidor.iniciar()(10)
    await b.medidor.vaciar() // lote 1 falla
    b.avanzar(HORA)
    b.medidor.iniciar()(10)
    await b.medidor.vaciar() // lote 1 falla otra vez, lote 2 ni se intenta
    expect(b.envios.map((e) => cuerpo(e).batchId)).toEqual(['lote-0001', 'lote-0001'])
    await b.medidor.vaciar()
    expect(b.envios.map((e) => cuerpo(e).batchId)).toEqual(['lote-0001', 'lote-0001', 'lote-0001', 'lote-0002'])
  })

  it('dos vaciados simultáneos envían cada lote una vez', async () => {
    const b = banco()
    b.medidor.iniciar()(10)
    await Promise.all([b.medidor.vaciar(), b.medidor.vaciar()])
    expect(b.envios).toHaveLength(1)
  })

  it('un vaciado sin nada que enviar no bloquea los siguientes', async () => {
    const b = banco()
    await b.medidor.vaciar()
    b.medidor.iniciar()(10)
    await b.medidor.vaciar()
    expect(b.envios).toHaveLength(1)
  })

  it('envía solo al cerrar una petición pasado el intervalo, con waitUntil', async () => {
    const esperas: Promise<unknown>[] = []
    const b = banco({ waitUntil: (p) => esperas.push(p) })
    b.medidor.iniciar()(10)
    expect(esperas).toHaveLength(0)
    b.avanzar(10 * 60_000)
    b.medidor.iniciar()(10)
    expect(esperas).toHaveLength(1)
    await Promise.all(esperas)
    expect(b.envios).toHaveLength(1)
    expect(cuerpo(b.envios[0]).muestras[0].invocaciones).toBe(2)
  })
})

describe('peticiones huérfanas', () => {
  it('una petición que nunca se cierra se barre sin contar memoria hasta el barrido', () => {
    const b = banco({ intervaloMs: 10 * HORA })
    b.medidor.iniciar() // nunca se cierra
    b.avanzar(1_000)
    b.avanzar(16 * 60_000)
    const c = b.medidor.iniciar()
    expect(b.medidor.estado().enVuelo).toBe(1)
    b.avanzar(100)
    c(0)
    const gb = b.medidor.estado().horas.reduce((s, h) => s + h.gbMs, 0)
    // La huérfana se da por terminada en su última actividad observada (su
    // propio inicio), y solo se suman los 100 ms de la petición nueva.
    expect(gb).toBe(100 * 2)
  })
})

describe('adaptador web (Astro y handlers fetch)', () => {
  const trozos = (...partes: string[]) =>
    new ReadableStream<Uint8Array>({
      start(ctrl) {
        for (const p of partes) ctrl.enqueue(new TextEncoder().encode(p))
        ctrl.close()
      },
    })

  it('cuenta los bytes del cuerpo y cierra la petición al terminar de leerlo', async () => {
    const b = banco()
    const mw = b.medidor.astro()
    const res = await mw({ request: new Request('https://sitio.test/') }, async () => new Response(trozos('hola ', 'mundo'), { status: 200, headers: { 'x-propia': '1' } }))
    expect(b.medidor.estado().enVuelo).toBe(1)
    expect(res.headers.get('x-propia')).toBe('1')
    expect(await res.text()).toBe('hola mundo')
    expect(b.medidor.estado().enVuelo).toBe(0)
    expect(b.medidor.estado().horas[0].transferBytes).toBe(10)
  })

  it('un cliente que cancela el cuerpo cierra la petición', async () => {
    const b = banco()
    const res = await b.medidor.astro()({ request: new Request('https://sitio.test/') }, async () => new Response(trozos('x'.repeat(100))))
    await res.body!.cancel()
    expect(b.medidor.estado().enVuelo).toBe(0)
  })

  it('HEAD, 204 y respuestas sin cuerpo se cierran al momento', async () => {
    const b = banco()
    const mw = b.medidor.astro()
    await mw({ request: new Request('https://sitio.test/', { method: 'HEAD' }) }, async () => new Response('ignorado'))
    await mw({ request: new Request('https://sitio.test/') }, async () => new Response(null, { status: 204 }))
    await mw({ request: new Request('https://sitio.test/') }, async () => Response.redirect('https://sitio.test/otra', 302))
    expect(b.medidor.estado().enVuelo).toBe(0)
    expect(b.medidor.estado().horas[0].invocaciones).toBe(3)
  })

  it('ignora los renders del prerender: son el build, no visitas', async () => {
    const b = banco()
    const res = new Response('estática')
    const salida = await b.medidor.astro()({ request: new Request('https://sitio.test/'), isPrerendered: true }, async () => res)
    expect(salida).toBe(res)
    expect(b.medidor.estado()).toEqual({ enVuelo: 0, horas: [], pendientes: 0 })
  })

  it('un error del handler se propaga intacto y la petición queda cerrada', async () => {
    const b = banco()
    const h = b.medidor.fetch(async () => { throw new Error('falló la página') })
    await expect(h(new Request('https://sitio.test/'))).rejects.toThrow('falló la página')
    expect(b.medidor.estado().enVuelo).toBe(0)
  })

  it('cuenta el content-length de la petición como transferencia de origen', async () => {
    const b = banco()
    const h = b.medidor.fetch(async () => new Response('ok'))
    const res = await h(new Request('https://sitio.test/api', { method: 'POST', body: 'x'.repeat(300), headers: { 'content-length': '300' } }))
    await res.text()
    const [m] = b.medidor.estado().horas
    expect(m.transferBytes).toBe(2)
    expect(m.originTransferBytes).toBe(302)
  })
})

describe('adaptador Express', () => {
  /** Respuesta de Node de mentira: write/end y los eventos finish/close. */
  function respuestaFalsa() {
    const ee = new EventEmitter()
    const escrito: unknown[] = []
    const res = {
      write: (chunk: unknown) => { escrito.push(chunk); return true },
      end(chunk?: unknown) {
        // Como algunas implementaciones reales: end() pasa por write().
        if (chunk !== undefined && typeof chunk !== 'function') res.write(chunk)
        ee.emit('finish')
        ee.emit('close')
      },
      once: (ev: 'finish' | 'close', fn: () => void) => ee.once(ev, fn),
    }
    return { res, escrito }
  }

  it('cuenta bytes de write y end una sola vez y cierra en finish', () => {
    const b = banco()
    const { res, escrito } = respuestaFalsa()
    const next = vi.fn()
    b.medidor.express()({ method: 'GET', headers: { 'content-length': '50' } }, res, next)
    expect(next).toHaveBeenCalledOnce()
    res.write('ñandú') // 7 bytes en UTF-8
    res.end(Buffer.from('fin'))
    expect(escrito).toHaveLength(2)
    const [m] = b.medidor.estado().horas
    expect(b.medidor.estado().enVuelo).toBe(0)
    expect(m.transferBytes).toBe(10)
    expect(m.originTransferBytes).toBe(60)
  })

  it('un cliente que se desconecta antes de finish también cierra', () => {
    const b = banco()
    const ee = new EventEmitter()
    const res = { write: () => true, end: () => {}, once: (ev: 'finish' | 'close', fn: () => void) => ee.once(ev, fn) }
    b.medidor.express()({ headers: {} }, res, () => {})
    ee.emit('close')
    expect(b.medidor.estado().enVuelo).toBe(0)
  })
})

describe('apagado', () => {
  it('engancha SIGTERM con la primera petición, no al crearse, y vacía la cola al recibirlo', async () => {
    const antes = process.listenerCount('SIGTERM')
    const b = banco({ engancharApagado: true })
    // El proceso del build importa el middleware sin atender visitas: no debe quedar escuchando.
    expect(process.listenerCount('SIGTERM')).toBe(antes)
    b.medidor.iniciar()(10)
    b.medidor.iniciar()(10)
    expect(process.listenerCount('SIGTERM')).toBe(antes + 1)

    process.emit('SIGTERM')
    await vi.waitFor(() => expect(b.envios).toHaveLength(1))
    expect(cuerpo(b.envios[0]).muestras[0].invocaciones).toBe(2)
    // `once`: el listener se va solo tras la señal.
    expect(process.listenerCount('SIGTERM')).toBe(antes)
  })

  it('sin engancharApagado no toca las señales del proceso', () => {
    const antes = process.listenerCount('SIGTERM')
    banco().medidor.iniciar()(10)
    expect(process.listenerCount('SIGTERM')).toBe(antes)
  })
})

describe('configuración por entorno', () => {
  const base = { COMPUTO_PROYECTO: 'p', COMPUTO_SECRETO: 's' }

  it('sin proyecto o sin secreto es inerte', () => {
    expect(medidorDesdeEnv({ env: { VERCEL: '1', COMPUTO_SECRETO: 's' } }).activo).toBe(false)
    expect(medidorDesdeEnv({ env: { VERCEL: '1', COMPUTO_PROYECTO: 'p' } }).activo).toBe(false)
  })

  it('fuera de Vercel es inerte salvo que se fuerce', () => {
    expect(medidorDesdeEnv({ env: base }).activo).toBe(false)
    expect(medidorDesdeEnv({ env: { ...base, VERCEL: '1', VERCEL_ENV: 'development' } }).activo).toBe(false)
    expect(medidorDesdeEnv({ env: { ...base, COMPUTO_FORZAR: '1', COMPUTO_PROYECTO: 'forzado' } }).activo).toBe(true)
  })

  it('devuelve el mismo medidor en cada llamada: dos leerían la misma CPU dos veces', () => {
    const env = { ...base, COMPUTO_FORZAR: '1', COMPUTO_PROYECTO: 'unico' }
    expect(medidorDesdeEnv({ env })).toBe(medidorDesdeEnv({ env }))
  })

  it('el medidor inerte deja pasar todo tal cual', async () => {
    const m = medidorDesdeEnv({ env: {} })
    const res = new Response('x')
    expect(await m.astro()({ request: new Request('https://sitio.test/') }, async () => res)).toBe(res)
    const next = vi.fn()
    m.express()({ headers: {} }, { write: () => true, end: () => {}, once: () => {} }, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
