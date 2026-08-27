// Cliente de la vista de seguidor. Corre en el NAVEGADOR: sin `../db`, sin
// `node:crypto`, sin nada de servidor.
//
// Misma arquitectura de tres capas que `lib/present/client-sync.ts`, que es el
// mecanismo que ya usan los asistentes de una presentación:
//   1. Bus (SSE directo a Upstash) - la vía normal, decenas de ms.
//   2. Resync periódico            - un snapshot cada 10 s cura un mensaje perdido.
//   3. Polling de rescate          - si el bus no engancha, seguimos igual.
//
// No se reutiliza `startSync` tal cual porque lleva cableados el endpoint
// (`/api/present/...`) y el canal (`present:ch:...`) del dominio de decks, y su
// tipo `Snapshot` es el de un deck. Modificarlo habría tocado un módulo que ya
// funciona en producción para tres charlas que no son esta.
//
// DOS DIFERENCIAS DELIBERADAS con el original, ambas por el contexto de uso:
// esto se mira en un celular, en datos móviles, durante una hora.
//
//   · Backoff exponencial en el rescate. `client-sync` cae a un polling fijo de
//     1 s, que en un salón con mala cobertura es un martilleo que gasta batería
//     y no ayuda. Aquí el reintento se espacia hasta 15 s y se reinicia en
//     cuanto algo responde.
//   · La pantalla NUNCA se vacía. Cuando la sesión expira, `client-sync`
//     fabrica un snapshot vacío para pintar el cierre. Aquí eso sería lo peor
//     que puede pasar: alguien mira el celular justo cuando venció el TTL y ve
//     una pantalla en blanco. El último beat conocido se queda, y lo único que
//     cambia es un indicador discreto.

export type BeatSnapshot = {
  sessionId: string
  pin: string
  beat: number
  titulo: string
  dato: string | null
  version: number
}

export type EstadoConexion = 'conectando' | 'en-vivo' | 'reintentando' | 'terminada'

export type OpcionesSeguidor = {
  sessionId: string
  /** Credenciales de solo lectura del bus. Sin ellas se arranca en polling. */
  bus: { url: string; token: string } | null
  onSnapshot: (s: BeatSnapshot) => void
  onEstado?: (e: EstadoConexion) => void
}

const RESYNC_MS = 10_000
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 15_000
/** Tras estos fallos seguidos del bus, se asume que no va a conectar. */
const FALLOS_ANTES_DE_RESCATE = 3

export function seguirSustentacion(opts: OpcionesSeguidor): () => void {
  const { sessionId, bus, onSnapshot, onEstado } = opts

  let detenido = false
  let source: EventSource | null = null
  let ultimaVersion = -1
  let fallosBus = 0
  let intentos = 0
  let rescateTimer: ReturnType<typeof setTimeout> | null = null
  let resyncTimer: ReturnType<typeof setInterval> | null = null

  const aceptar = (snap: BeatSnapshot | null) => {
    if (detenido || !snap) return
    // Pub/sub no garantiza orden: un mensaje viejo que llega tarde no debe
    // hacer retroceder la presentación.
    if (typeof snap.version === 'number' && snap.version < ultimaVersion) return
    ultimaVersion = snap.version ?? ultimaVersion
    onSnapshot(snap)
  }

  const retrasoRescate = () => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** intentos)

  const pedirSnapshot = async (): Promise<boolean> => {
    if (detenido) return false
    try {
      const res = await fetch(`/api/sustentacion/${encodeURIComponent(sessionId)}/snapshot`, {
        cache: 'no-store',
      })
      if (res.status === 404) {
        // La sesión venció. NO se vacía la pantalla: el último beat se queda y
        // solo cambia el indicador. Ver la cabecera de este archivo.
        onEstado?.('terminada')
        detener()
        return true
      }
      if (!res.ok) return false
      aceptar((await res.json()) as BeatSnapshot)
      return true
    } catch {
      // Sin red. El backoff decide cuándo volver a intentarlo.
      return false
    }
  }

  /** Capa 3: reintento espaciado mientras el bus no engancha. */
  const programarRescate = () => {
    if (rescateTimer || detenido) return
    onEstado?.('reintentando')
    rescateTimer = setTimeout(async () => {
      rescateTimer = null
      const ok = await pedirSnapshot()
      if (detenido) return
      if (ok) {
        intentos = 0
        // Se responde otra vez: merece la pena volver a intentar el bus, que
        // es mucho más barato que seguir preguntando.
        if (bus && !source) conectarBus()
        else if (!bus) programarRescate()
      } else {
        intentos++
        programarRescate()
      }
    }, retrasoRescate())
  }

  const conectarBus = () => {
    if (!bus || detenido) return
    onEstado?.('conectando')

    // El token es de SOLO LECTURA y por eso puede viajar en la URL: es la única
    // forma de autenticar un EventSource, que no admite cabeceras.
    const url = `${bus.url}/subscribe/sust:ch:${encodeURIComponent(sessionId)}?_token=${encodeURIComponent(bus.token)}`
    source = new EventSource(url)

    source.onopen = () => {
      fallosBus = 0
      intentos = 0
      if (rescateTimer) {
        clearTimeout(rescateTimer)
        rescateTimer = null
      }
      onEstado?.('en-vivo')
      // Al (re)conectar, el estado real manda sobre lo que haya en pantalla.
      void pedirSnapshot()
    }

    source.onmessage = (ev) => {
      // Upstash entrega `message,<canal>,<payload>`; el payload es nuestro JSON.
      const raw = String(ev.data ?? '')
      const inicio = raw.indexOf('{')
      if (inicio === -1) return
      try {
        aceptar(JSON.parse(raw.slice(inicio)) as BeatSnapshot)
      } catch {
        // Un mensaje ilegible no rompe nada: el resync llega en ≤10 s.
      }
    }

    source.onerror = () => {
      fallosBus++
      if (fallosBus >= FALLOS_ANTES_DE_RESCATE) {
        // EventSource reintenta solo, pero si no engancha no vamos a dejar al
        // seguidor congelado esperándolo.
        source?.close()
        source = null
        programarRescate()
      }
    }
  }

  const detener = () => {
    detenido = true
    source?.close()
    source = null
    if (rescateTimer) clearTimeout(rescateTimer)
    if (resyncTimer) clearInterval(resyncTimer)
    rescateTimer = null
    resyncTimer = null
  }

  void pedirSnapshot()
  if (bus) conectarBus()
  else programarRescate()

  // Capa 2: el resync corre pase lo que pase, también con el bus sano.
  resyncTimer = setInterval(() => void pedirSnapshot(), RESYNC_MS)

  // Volver de segundo plano en un móvil suele haber matado la conexión sin
  // avisar: al reaparecer, lo primero es preguntar por dónde vamos.
  const alVolver = () => {
    if (document.visibilityState === 'visible') {
      intentos = 0
      void pedirSnapshot()
      if (bus && !source) conectarBus()
    }
  }
  document.addEventListener('visibilitychange', alVolver)

  return () => {
    document.removeEventListener('visibilitychange', alVolver)
    detener()
  }
}
