// Medidor de cómputo para los proyectos de cliente desplegados en Vercel.
//
// Se COPIA tal cual al proyecto del cliente: un solo archivo, sin imports y sin
// dependencias, y TypeScript solo con sintaxis borrable (nada de enums ni
// namespaces) para que lo acepten Vite, el builder de Vercel y el
// `strip-types` de Node sin configuración. Plan y límites de precisión en
// `docs/plan-computo-clientes.md` del portafolio.
//
// Mide lo que la función ve (CPU del proceso, tiempo con peticiones en curso,
// invocaciones, bytes de respuesta), lo acumula por hora en memoria y lo envía
// firmado con HMAC a `/api/computo/ingest`. Lo que el CDN sirve sin despertar
// la función (estáticos, aciertos de caché) queda fuera, y por eso la
// transferencia al visitante y las peticiones al edge son cotas inferiores.
//
// FAIL-OPEN en todo: un error del medidor nunca puede tumbar ni alterar la
// petición del cliente. El que es estricto es el endpoint que recibe.

const HORA_MS = 3_600_000

/**
 * Cada envío es una invocación del portafolio, que sale de la MISMA cuota
 * gratis que se quiere vigilar. Diez minutos son, como mucho, ~4.300 envíos al
 * mes por instancia siempre ocupada; a un minuto serían diez veces más.
 */
const INTERVALO_POR_DEFECTO_MS = 10 * 60_000

/** Tope de la cola de reintentos: 48 lotes son 8 h de ingesta caída. */
const MAX_PENDIENTES = 48

/** Tope de muestras por lote, por debajo del que acepta la ingesta (240). */
const MAX_MUESTRAS_POR_LOTE = 200

/**
 * Una petición abierta más que esto es un cuerpo que nadie leyó ni canceló.
 * Dejarla abierta mantendría la instancia "ocupada" y contaría memoria para
 * siempre, que es peor que perder la medición de una petición.
 */
const PETICION_HUERFANA_MS = 15 * 60_000

const TIMEOUT_ENVIO_MS = 5_000

/** Vercel da 500 ms tras el SIGTERM; se deja margen para salir a tiempo. */
const TIMEOUT_APAGADO_MS = 400

/** En Hobby la memoria es fija: 2 GB. */
const MEMORIA_POR_DEFECTO_MB = 2048

const ENDPOINT_POR_DEFECTO = 'https://codebymike.net/api/computo/ingest'

/** Estados sin cuerpo: construir un Response con cuerpo para ellos lanza. */
const SIN_CUERPO = new Set([101, 103, 204, 205, 304])

/** Una hora de consumo, en las unidades pequeñas que espera la ingesta. */
export interface MuestraHora {
  /** Inicio de la hora en UTC, epoch ms. */
  hora: number
  cpuMs: number
  /** Memoria por tiempo, en GB-milisegundo. */
  gbMs: number
  invocaciones: number
  transferBytes: number
  originTransferBytes: number
  edgeRequests: number
}

export interface OpcionesMedidor {
  endpoint: string
  /** Slug del proyecto en el panel. */
  proyecto: string
  /** Secreto HMAC del proyecto, tal como lo entrega el panel. */
  secreto: string
  /** Memoria configurada de la función, en MB. */
  memoriaMb?: number
  intervaloMs?: number
  /**
   * `waitUntil` de `@vercel/functions`. Si no se pasa, se busca en el contexto
   * de la petición igual que lo hace ese paquete.
   */
  waitUntil?: (promesa: Promise<unknown>) => void
  // Inyectables para las pruebas: reloj, CPU acumulada del proceso en ms,
  // transporte y generador de ids.
  reloj?: () => number
  cpuMs?: () => number
  fetch?: (url: string, init: RequestInit) => Promise<Response>
  nuevoId?: () => string
}

/** Cierra una petición con los bytes que salieron. Idempotente. */
export type CerrarPeticion = (bytesSalida: number) => void

// Formas mínimas de Node/Express, declaradas aquí para no exigir @types/node
// ni @types/express en el proyecto que copia el archivo.
export interface PeticionNode {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
export interface RespuestaNode {
  write: (...args: never[]) => unknown
  end: (...args: never[]) => unknown
  once: (evento: 'finish' | 'close', fn: () => void) => unknown
}

export interface EstadoMedidor {
  enVuelo: number
  horas: MuestraHora[]
  pendientes: number
}

export interface Medidor {
  readonly activo: boolean
  /** Marca el inicio de una petición. Para adaptadores propios. */
  iniciar(bytesEntrada?: number): CerrarPeticion
  /** Devuelve una respuesta equivalente que cierra la petición al terminar de enviarse. */
  envolverRespuesta(respuesta: Response, cerrar: CerrarPeticion): Response
  /** Envuelve un handler web (`Request` → `Response`): Next, Hono, `/api` de Vercel. */
  fetch<A extends unknown[]>(
    handler: (req: Request, ...resto: A) => Response | Promise<Response>,
  ): (req: Request, ...resto: A) => Promise<Response>
  /** Middleware de Astro: `export const onRequest = medidor.astro()`. */
  astro(): (contexto: { request: Request }, next: () => Promise<Response>) => Promise<Response>
  /** Middleware de Express: `app.use(medidor.express())`, antes que las rutas. */
  express(): (req: PeticionNode, res: RespuestaNode, next: (err?: unknown) => void) => void
  /** Sella lo acumulado y envía la cola. Nunca lanza. */
  vaciar(opciones?: { timeoutMs?: number }): Promise<void>
  estado(): EstadoMedidor
}

// ---------------------------------------------------------------------------
// Acceso a globales sin depender de sus tipos
// ---------------------------------------------------------------------------

interface ProcesoMinimo {
  env?: Record<string, string | undefined>
  cpuUsage?: () => { user: number; system: number }
  once?: (evento: string, fn: () => void) => unknown
}

const proceso = (): ProcesoMinimo | undefined => (globalThis as { process?: ProcesoMinimo }).process

/** CPU acumulada del proceso, en ms. Mide el proceso y no la petición: con
 * concurrencia Fluid, dos peticiones solapadas no se cuentan dos veces. */
function cpuDelProceso(): number {
  const uso = proceso()?.cpuUsage?.()
  return uso ? (uso.user + uso.system) / 1000 : 0
}

/** Mismo mecanismo que usa `waitUntil` de `@vercel/functions` por dentro. */
function waitUntilDelContexto(): ((p: Promise<unknown>) => void) | undefined {
  const g = globalThis as unknown as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>
  return g[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil
}

const positivo = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

function largoDeclarado(req: Request): number {
  try {
    return positivo(Number(req.headers.get('content-length')))
  } catch {
    return 0
  }
}

function largoDe(fragmento: unknown, codificacion: unknown): number {
  try {
    if (typeof fragmento === 'string') {
      const B = (globalThis as { Buffer?: { byteLength(s: string, e?: string): number } }).Buffer
      if (B) return B.byteLength(fragmento, typeof codificacion === 'string' ? codificacion : 'utf8')
      return new TextEncoder().encode(fragmento).byteLength
    }
    if (fragmento instanceof Uint8Array) return fragmento.byteLength
  } catch {
    // Codificación rara: se pierde el conteo de este fragmento, no la petición.
  }
  return 0
}

function aHex(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += b.toString(16).padStart(2, '0')
  return s
}

const horaDe = (t: number) => Math.floor(t / HORA_MS) * HORA_MS

const muestraVacia = (hora: number): MuestraHora => ({
  hora, cpuMs: 0, gbMs: 0, invocaciones: 0, transferBytes: 0, originTransferBytes: 0, edgeRequests: 0,
})

const tieneConsumo = (m: MuestraHora) =>
  m.cpuMs > 0 || m.gbMs > 0 || m.invocaciones > 0 || m.transferBytes > 0 || m.originTransferBytes > 0 || m.edgeRequests > 0

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

/**
 * Crea un medidor. Uno solo por proceso: dos medidores del mismo proceso
 * leerían la misma CPU y la contarían dos veces. `medidorDesdeEnv` ya lo
 * garantiza; esta función existe suelta para las pruebas.
 */
export function crearMedidor(op: OpcionesMedidor): Medidor {
  const reloj = op.reloj ?? Date.now
  const leerCpu = op.cpuMs ?? cpuDelProceso
  const transporte = op.fetch ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init))
  const nuevoId = op.nuevoId ?? (() => globalThis.crypto.randomUUID())
  const gb = (positivo(op.memoriaMb) || MEMORIA_POR_DEFECTO_MB) / 1024
  const intervalo = positivo(op.intervaloMs) || INTERVALO_POR_DEFECTO_MS

  const horas = new Map<number, MuestraHora>()
  /** Lotes sellados: cuerpo y batchId fijos, para que un reintento sea el mismo lote. */
  const pendientes: { batchId: string; cuerpo: string }[] = []
  /** Peticiones en curso: id → inicio. */
  const abiertas = new Map<number, number>()
  let siguienteId = 0
  // Línea base en cero y no en la CPU actual: el primer delta incluye el
  // arranque en frío, que Vercel también cobra.
  let cpuPrevio = 0
  let inicioOcupado = 0
  let ultimaActividad = reloj()
  let ultimoEnvio = reloj()
  let enviando: Promise<void> | null = null
  let clave: Promise<CryptoKey> | null = null

  const cubo = (t: number): MuestraHora => {
    const h = horaDe(t)
    let m = horas.get(h)
    if (!m) {
      m = muestraVacia(h)
      horas.set(h, m)
    }
    return m
  }

  function marcarCpu(ahora: number) {
    let actual: number
    try {
      actual = leerCpu()
    } catch {
      return
    }
    const delta = actual - cpuPrevio
    if (!Number.isFinite(delta)) return
    cpuPrevio = actual
    if (delta > 0) cubo(ahora).cpuMs += delta
  }

  /** Suma memoria por el tiempo ocupado, partiendo el intervalo por horas. */
  function sumarOcupado(desde: number, hasta: number) {
    let t = desde
    while (t < hasta) {
      const tramo = Math.min(hasta, horaDe(t) + HORA_MS) - t
      cubo(t).gbMs += tramo * gb
      t += tramo
    }
  }

  function cerrarHuerfanas(ahora: number) {
    let cerradas = 0
    for (const [id, inicio] of abiertas) {
      if (ahora - inicio > PETICION_HUERFANA_MS) {
        abiertas.delete(id)
        cerradas++
      }
    }
    // Se asume que terminó con la última actividad observada, no ahora: una
    // huérfana suele ser un cuerpo que la plataforma dejó de leer hace rato.
    if (cerradas > 0 && abiertas.size === 0) sumarOcupado(inicioOcupado, Math.max(inicioOcupado, ultimaActividad))
  }

  function iniciar(bytesEntrada = 0): CerrarPeticion {
    try {
      const ahora = reloj()
      marcarCpu(ahora)
      cerrarHuerfanas(ahora)
      if (abiertas.size === 0) inicioOcupado = ahora
      const id = siguienteId++
      abiertas.set(id, ahora)
      ultimaActividad = ahora
      const m = cubo(ahora)
      m.invocaciones++
      // Toda invocación pasa por el edge; lo que el edge sirve solo, no se ve.
      m.edgeRequests++
      const entrada = positivo(bytesEntrada)
      let cerrada = false
      return (bytesSalida: number) => {
        if (cerrada) return
        cerrada = true
        try {
          cerrar(id, entrada, positivo(bytesSalida))
        } catch {
          // fail-open
        }
      }
    } catch {
      return () => {}
    }
  }

  function cerrar(id: number, entrada: number, salida: number) {
    // Ya la cerró el barrido de huérfanas: su tiempo está contado.
    if (!abiertas.delete(id)) return
    const ahora = reloj()
    marcarCpu(ahora)
    ultimaActividad = ahora
    const m = cubo(ahora)
    m.transferBytes += salida
    m.originTransferBytes += salida + entrada
    if (abiertas.size === 0) sumarOcupado(inicioOcupado, ahora)
    if (ahora - ultimoEnvio >= intervalo) programarEnvio()
  }

  function sellar(ahora: number) {
    marcarCpu(ahora)
    cerrarHuerfanas(ahora)
    // Con peticiones en curso, lo ocupado hasta ahora se cuenta ya y el tramo
    // sigue abierto desde este instante.
    if (abiertas.size > 0) {
      sumarOcupado(inicioOcupado, ahora)
      inicioOcupado = ahora
    }
    const muestras = [...horas.values()].filter(tieneConsumo).sort((a, b) => a.hora - b.hora)
    horas.clear()
    for (let i = 0; i < muestras.length; i += MAX_MUESTRAS_POR_LOTE) {
      const batchId = nuevoId()
      pendientes.push({ batchId, cuerpo: JSON.stringify({ batchId, muestras: muestras.slice(i, i + MAX_MUESTRAS_POR_LOTE) }) })
    }
    while (pendientes.length > MAX_PENDIENTES) {
      pendientes.shift()
      console.error('[medidor] cola llena: se descartó el lote más viejo')
    }
  }

  async function firmar(mensaje: string): Promise<string> {
    const cod = new TextEncoder()
    // La llave son los bytes UTF-8 del secreto tal cual (hex como texto), que
    // es lo que hace `createHmac('sha256', secreto)` del lado que verifica.
    clave ??= globalThis.crypto.subtle.importKey('raw', cod.encode(op.secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    try {
      return aHex(await globalThis.crypto.subtle.sign('HMAC', await clave, cod.encode(mensaje)))
    } catch (e) {
      clave = null
      throw e
    }
  }

  async function enviarLote(lote: { cuerpo: string }, timeoutMs: number): Promise<'entregado' | 'descartado' | 'reintentar'> {
    let res: Response
    try {
      const ts = reloj()
      const firma = await firmar(`${ts}.${lote.cuerpo}`)
      res = await transporte(op.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-computo-project': op.proyecto,
          'x-computo-timestamp': String(ts),
          'x-computo-signature': firma,
        },
        body: lote.cuerpo,
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
      })
    } catch {
      return 'reintentar'
    }
    // Liberar la conexión: el cuerpo de la respuesta no interesa.
    res.body?.cancel().catch(() => {})
    if (res.ok) return 'entregado'
    if (res.status === 408 || res.status === 429 || res.status >= 500) return 'reintentar'
    // Un 4xx no se arregla reintentando: firma, formato o proyecto mal
    // configurados. Reintentarlo solo llenaría la cola.
    console.error(`[medidor] la ingesta rechazó un lote (HTTP ${res.status}); se descarta`)
    return 'descartado'
  }

  async function enviarCola(timeoutMs: number) {
    try {
      const ahora = reloj()
      ultimoEnvio = ahora
      sellar(ahora)
      while (pendientes.length > 0) {
        const resultado = await enviarLote(pendientes[0], timeoutMs)
        // En orden y sin saltarse ninguno: si la ingesta está caída, el
        // siguiente lote tampoco va a entrar.
        if (resultado === 'reintentar') break
        pendientes.shift()
      }
    } catch (e) {
      console.error('[medidor] envío fallido', e)
    }
  }

  function vaciar(opciones?: { timeoutMs?: number }): Promise<void> {
    if (enviando) return enviando
    const tarea = enviarCola(positivo(opciones?.timeoutMs) || TIMEOUT_ENVIO_MS)
    enviando = tarea
    // Se libera al terminar y no en un `finally` dentro de la tarea: si la
    // cola está vacía la tarea termina antes de la asignación y el candado
    // quedaría puesto para siempre.
    void tarea.then(() => {
      if (enviando === tarea) enviando = null
    })
    return tarea
  }

  function programarEnvio() {
    const tarea = vaciar()
    try {
      // Sin waitUntil, Fluid puede pausar la instancia a mitad del envío. No
      // se pierde nada (el lote queda en cola), solo llega más tarde.
      ;(op.waitUntil ?? waitUntilDelContexto())?.(tarea)
    } catch {
      // fail-open
    }
  }

  function envolverRespuesta(respuesta: Response, cerrarPeticion: CerrarPeticion): Response {
    try {
      const original = respuesta.body
      if (!original || SIN_CUERPO.has(respuesta.status)) {
        cerrarPeticion(0)
        return respuesta
      }
      let lector: ReadableStreamDefaultReader<Uint8Array> | null = null
      let bytes = 0
      const fin = () => cerrarPeticion(bytes)
      // El lector se toma en el primer `pull` y no aquí: si el constructor de
      // Response lanzara, el cuerpo original seguiría sin bloquear y se podría
      // devolver la respuesta intacta.
      const contado = new ReadableStream<Uint8Array>({
        async pull(ctrl) {
          try {
            lector ??= original.getReader()
            const { done, value } = await lector.read()
            if (done) {
              fin()
              ctrl.close()
              return
            }
            bytes += value?.byteLength ?? 0
            ctrl.enqueue(value)
          } catch (e) {
            fin()
            ctrl.error(e)
          }
        },
        cancel(motivo) {
          fin()
          return (lector ?? original.getReader()).cancel(motivo)
        },
      })
      return new Response(contado, { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers })
    } catch {
      cerrarPeticion(0)
      return respuesta
    }
  }

  function envolverHandlerWeb(
    req: Request,
    handler: () => Response | Promise<Response>,
  ): Promise<Response> {
    const cerrarPeticion = iniciar(largoDeclarado(req))
    return (async () => {
      let res: Response
      try {
        res = await handler()
      } catch (e) {
        cerrarPeticion(0)
        throw e
      }
      // Un HEAD no tiene cuerpo que leer: esperar a que alguien lo consuma
      // dejaría la petición abierta hasta el barrido de huérfanas.
      if (req.method === 'HEAD') {
        cerrarPeticion(0)
        return res
      }
      return envolverRespuesta(res, cerrarPeticion)
    })()
  }

  return {
    activo: true,
    iniciar,
    envolverRespuesta,
    fetch(handler) {
      return (req, ...resto) => envolverHandlerWeb(req, () => handler(req, ...resto))
    },
    astro() {
      return (contexto, next) => envolverHandlerWeb(contexto.request, next)
    },
    express() {
      return (req, res, next) => {
        try {
          const cerrarPeticion = iniciar(positivo(Number(req.headers['content-length'])))
          let bytes = 0
          let dentroDeEnd = false
          const escribir = res.write as (...args: unknown[]) => unknown
          const terminar = res.end as (...args: unknown[]) => unknown
          res.write = function (this: unknown, ...args: unknown[]) {
            // Algunas implementaciones de end() pasan por write(): sin esta
            // guarda el último fragmento se contaría dos veces.
            if (!dentroDeEnd) bytes += largoDe(args[0], args[1])
            return escribir.apply(this, args)
          } as RespuestaNode['write']
          res.end = function (this: unknown, ...args: unknown[]) {
            if (typeof args[0] !== 'function') bytes += largoDe(args[0], args[1])
            dentroDeEnd = true
            try {
              return terminar.apply(this, args)
            } finally {
              dentroDeEnd = false
            }
          } as RespuestaNode['end']
          // `close` cubre al cliente que se desconecta antes de `finish`.
          const fin = () => cerrarPeticion(bytes)
          res.once('finish', fin)
          res.once('close', fin)
        } catch {
          // fail-open
        }
        next()
      }
    },
    vaciar,
    estado() {
      return {
        enVuelo: abiertas.size,
        horas: [...horas.values()].map((m) => ({ ...m })),
        pendientes: pendientes.length,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Medidor inerte y configuración por entorno
// ---------------------------------------------------------------------------

const INERTE: Medidor = {
  activo: false,
  iniciar: () => () => {},
  envolverRespuesta: (respuesta) => respuesta,
  fetch: (handler) => async (req, ...resto) => handler(req, ...resto),
  astro: () => (_contexto, next) => next(),
  express: () => (_req, _res, next) => next(),
  vaciar: async () => {},
  estado: () => ({ enVuelo: 0, horas: [], pendientes: 0 }),
}

const REGISTRO = Symbol.for('codebymike.medidor')

/** Registro por proceso en `globalThis`: sobrevive a que el bundler duplique este módulo. */
function registro(): Map<string, Medidor> {
  const g = globalThis as unknown as Record<symbol, Map<string, Medidor> | undefined>
  let r = g[REGISTRO]
  if (!r) {
    r = new Map()
    g[REGISTRO] = r
  }
  return r
}

export interface OpcionesEntorno {
  env?: Record<string, string | undefined>
  waitUntil?: (promesa: Promise<unknown>) => void
}

/**
 * Medidor configurado por variables de entorno, único por proceso.
 *
 * Sin `COMPUTO_PROYECTO` o `COMPUTO_SECRETO`, o fuera de Vercel, devuelve un
 * medidor inerte en silencio: el desarrollo local no debe sumar consumo al
 * proyecto real. `COMPUTO_FORZAR=1` lo activa fuera de Vercel para probarlo.
 */
export function medidorDesdeEnv(opciones: OpcionesEntorno = {}): Medidor {
  try {
    const env = opciones.env ?? proceso()?.env ?? {}
    const proyecto = env.COMPUTO_PROYECTO?.trim()
    const secreto = env.COMPUTO_SECRETO?.trim()
    const enVercel = env.VERCEL === '1' && env.VERCEL_ENV !== 'development'
    if (!proyecto || !secreto || !(enVercel || env.COMPUTO_FORZAR === '1')) return INERTE

    const endpoint = env.COMPUTO_ENDPOINT?.trim() || ENDPOINT_POR_DEFECTO
    const clave = `${endpoint}|${proyecto}`
    const existentes = registro()
    const previo = existentes.get(clave)
    if (previo) return previo

    const medidor = crearMedidor({
      endpoint,
      proyecto,
      secreto,
      memoriaMb: positivo(Number(env.COMPUTO_MEMORIA_MB)) || undefined,
      waitUntil: opciones.waitUntil,
    })
    existentes.set(clave, medidor)
    // Solo en Vercel: fuera de ahí, un listener de SIGTERM cambiaría cómo se
    // apaga la app (Node deja de salir solo al recibir la señal).
    if (enVercel) proceso()?.once?.('SIGTERM', () => void medidor.vaciar({ timeoutMs: TIMEOUT_APAGADO_MS }))
    return medidor
  } catch {
    return INERTE
  }
}
