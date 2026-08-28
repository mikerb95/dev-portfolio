// El lado del CANVAS: obedecer lo que manda el teléfono.
//
// Corre en el navegador (sin `../db`, sin `node:crypto`), igual que `seguir.ts`.
// La diferencia con aquel es el presupuesto de latencia: un asistente puede
// enterarse del beat 3 segundos tarde y no pasa nada, pero si el canvas tarda
// eso en obedecer, el mando se siente roto y acabo usando el teclado.
//
// EL TRANSPORTE, y por qué es el que es
// --------------------------------------
// Hay SSE funcionando y probado en producción (`seguir.ts` sobre el pub/sub de
// Upstash), así que se REUSA: cuando engancha, un cambio llega en decenas de
// milisegundos y no hay nada mejor. Pero no se confía en él, porque el mismo
// 5G irregular que hace falta para el control remoto es el que tumba un
// EventSource sin avisar y sin disparar `onerror` durante un buen rato.
//
// Así que el SSE es un ACELERADOR sobre un polling corto que corre SIEMPRE, a
// 250 ms, esté el bus como esté. Esa es la decisión: el peor caso del sistema
// es el polling, y el peor caso del polling ya cumple el presupuesto de 300 ms.
// No hay ninguna condición de red en la que el canvas dependa de que el SSE
// esté vivo, ni una máquina de estados que decida cuándo acelerar y cuándo no,
// que es exactamente el tipo de lógica que falla el día que importa.
//
// Lo que cuesta: ~4 lecturas por segundo de Redis contra `/estado`, unas 14.000
// en una hora de sustentación. Es una lectura de una clave, y solo la hace el
// canvas (los asistentes siguen con el resync de 10 s de `seguir.ts`). Si algún
// día molesta, `intervaloMs` lo sube sin tocar nada más.
//
// Y la regla que manda sobre todas: LA PANTALLA NUNCA SE VACÍA. Ni con la
// sesión expirada, ni con Redis caído, ni sin red. Se conserva el último beat
// conocido y solo cambia un indicador; el teclado del canvas sigue funcionando.
// Una pantalla en blanco delante del jurado es peor que cualquier desincronía.

export type EstadoSustentacion = {
  sessionId: string
  beat: number
  titulo: string
  dato: string | null
  version: number
  actualizadoEn: number
  beatIniciadoEn: number
  /** Hora del servidor al responder. Puede faltar en un mensaje del bus. */
  ahora?: number
  primerBeat: number
  ultimoBeat: number
}

/**
 * `en-vivo`   - el bus está enganchado, los cambios llegan al instante.
 * `sondeando` - sin bus, pero `/estado` responde. Todo funciona, con 250 ms.
 * `sin-enlace`- ni bus ni `/estado`. El canvas sigue con el último beat y el
 *               teclado; es el estado que el indicador tiene que hacer visible.
 */
export type EstadoConexion = 'en-vivo' | 'sondeando' | 'sin-enlace'

export type OpcionesObedecer = {
  /**
   * La sesión, si quien mira ya la conoce (el canvas la conoce: la abrió él).
   * Ahorra una lectura de Redis por sondeo. El control remoto NO la conoce: su
   * única credencial es el PIN de presentador, así que la omite y `/estado`
   * resuelve la sesión en curso por su cuenta.
   */
  sessionId?: string | null
  /** Credenciales de SOLO LECTURA del bus. Sin ellas, solo polling. */
  bus?: { url: string; token: string } | null
  /** Se llama solo cuando el estado CAMBIA de verdad, no en cada sondeo. */
  onEstado: (e: EstadoSustentacion) => void
  onConexion?: (c: EstadoConexion) => void
  /** El presupuesto. 250 ms deja margen bajo los 300 ms pedidos. */
  intervaloMs?: number
  fetchImpl?: typeof fetch
}

const INTERVALO_MS = 250
/** Fallos seguidos de `/estado` antes de admitir que no hay enlace. */
const FALLOS_ANTES_DE_AVISAR = 3

export function obedecerComandos(opts: OpcionesObedecer): () => void {
  const {
    sessionId = null,
    bus = null,
    onEstado,
    onConexion,
    intervaloMs = INTERVALO_MS,
    fetchImpl,
  } = opts

  let detenido = false
  let source: EventSource | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let ultimaVersion = -1
  let fallos = 0
  let conexion: EstadoConexion | null = null
  let enVuelo = false

  const anunciar = (c: EstadoConexion) => {
    if (c === conexion) return
    conexion = c
    onConexion?.(c)
  }

  const aceptar = (e: EstadoSustentacion | null) => {
    if (detenido || !e || typeof e.version !== 'number') return
    // El pub/sub no garantiza orden y el sondeo repite: solo sube la versión.
    // Sin esto el canvas repintaría cuatro veces por segundo.
    if (e.version <= ultimaVersion) return
    ultimaVersion = e.version
    onEstado(e)
  }

  const consultar = async (): Promise<void> => {
    if (detenido || enVuelo) return
    // Un solo `/estado` en vuelo a la vez: con la red lenta, los sondeos se
    // solaparían y acabaríamos con una cola de respuestas viejas llegando
    // desordenadas. Perder un ciclo no cuesta nada; el siguiente va en 250 ms.
    enVuelo = true
    try {
      const f = fetchImpl ?? fetch
      const url = sessionId
        ? `/api/sustentacion/estado?sessionId=${encodeURIComponent(sessionId)}`
        : '/api/sustentacion/estado'
      const res = await f(url, { cache: 'no-store' })
      if (!res.ok) {
        // 404 (sesión expirada) y 503 (Redis caído) se tratan IGUAL a efectos
        // de pantalla: se conserva lo último y se avisa. Lo que no se hace
        // nunca es pintar un estado vacío.
        fallos++
        if (fallos >= FALLOS_ANTES_DE_AVISAR) anunciar('sin-enlace')
        return
      }
      fallos = 0
      if (!source) anunciar('sondeando')
      aceptar((await res.json()) as EstadoSustentacion)
    } catch {
      fallos++
      if (fallos >= FALLOS_ANTES_DE_AVISAR) anunciar('sin-enlace')
    } finally {
      enVuelo = false
    }
  }

  const conectarBus = () => {
    // Sin `sessionId` no hay canal al que suscribirse: el bus publica por
    // sesión. Quien no la conoce se queda con el sondeo, que ya cumple.
    if (!bus || !sessionId || detenido || typeof EventSource !== 'function') return
    // El token es de SOLO LECTURA: es la única forma de autenticar un
    // EventSource, que no admite cabeceras. Mismo canal que usan los asistentes.
    source = new EventSource(
      `${bus.url}/subscribe/sust:ch:${encodeURIComponent(sessionId)}?_token=${encodeURIComponent(bus.token)}`
    )

    source.onopen = () => {
      anunciar('en-vivo')
      // Al conectar, el estado real manda sobre lo que haya en pantalla.
      void consultar()
    }

    source.onmessage = (ev) => {
      // Upstash entrega `message,<canal>,<payload>`; el payload es el JSON.
      const raw = String(ev.data ?? '')
      const inicio = raw.indexOf('{')
      if (inicio === -1) return
      try {
        aceptar(JSON.parse(raw.slice(inicio)) as EstadoSustentacion)
      } catch {
        // Un mensaje ilegible da igual: el sondeo lo corrige en 250 ms.
      }
    }

    source.onerror = () => {
      // No se reintenta a mano ni se apaga nada: EventSource reconecta solo y,
      // mientras tanto, el polling ya está corriendo y sostiene el presupuesto.
      // Aquí lo único que cambia es lo que dice el indicador.
      if (fallos === 0) anunciar('sondeando')
    }
  }

  const detener = () => {
    detenido = true
    source?.close()
    source = null
    if (timer) clearInterval(timer)
    timer = null
  }

  void consultar()
  conectarBus()
  timer = setInterval(() => void consultar(), intervaloMs)

  // Volver de segundo plano suele haber matado la conexión sin avisar.
  const alVolver = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void consultar()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', alVolver)
  }

  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', alVolver)
    }
    detener()
  }
}
