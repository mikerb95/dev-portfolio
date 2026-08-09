// Cliente de sincronía. Corre en el NAVEGADOR: no puede importar `../db`, ni
// `node:crypto`, ni nada con efectos de servidor. Lo comparten las tres vistas
// (pantalla principal, público y control remoto).
//
// El canal es un EventSource contra Upstash DIRECTAMENTE, no contra nosotros.
// Esa es la decisión de fondo de esta feature: si cada espectador abriera un
// SSE contra una función de Vercel, tendríamos una invocación viva por persona
// durante toda la charla. Suscribiéndose a Upstash con un token de solo
// lectura, Vercel solo trabaja al entrar (un snapshot) y en cada comando.
//
// Tres capas, de más rápida a más terca:
//   1. Bus (SSE a Upstash)  - la vía normal, decenas de ms.
//   2. Resync periódico     - un snapshot cada 10 s cura un mensaje perdido.
//   3. Polling de rescate   - si el bus no conecta, 1 s de latencia y seguimos.
//
// El pub/sub no garantiza entrega, así que la capa 2 no es opcional: sin ella,
// un mensaje perdido dejaría a media sala en el slide anterior para siempre.

export type Snapshot = {
  sessionId: string
  pin: string
  deckTitle: string
  state: 'lobby' | 'live' | 'ended'
  currentSlide: number
  totalSlides: number
  version: number
}

export type SyncOptions = {
  sessionId: string
  /** Credenciales del bus. Si faltan, se arranca directo en modo polling. */
  bus: { url: string; token: string } | null
  onSnapshot: (snap: Snapshot) => void
  /** Cambios de conectividad, para pintar un indicador discreto. */
  onStatus?: (status: 'connecting' | 'live' | 'polling') => void
}

const RESYNC_MS = 10_000
const POLL_MS = 1_000
/** Tras estos fallos seguidos del bus, se asume que no va a conectar. */
const BUS_FAILURES_BEFORE_POLLING = 3

export function startSync(opts: SyncOptions): () => void {
  const { sessionId, bus, onSnapshot, onStatus } = opts

  let stopped = false
  let lastVersion = -1
  let source: EventSource | null = null
  let busFailures = 0
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let resyncTimer: ReturnType<typeof setInterval> | null = null

  const accept = (snap: Snapshot | null) => {
    if (stopped || !snap) return
    // Pub/sub no garantiza orden: un mensaje viejo que llega tarde no debe
    // hacer retroceder la presentación.
    if (typeof snap.version === 'number' && snap.version < lastVersion) return
    lastVersion = snap.version ?? lastVersion
    onSnapshot(snap)
  }

  const fetchSnapshot = async () => {
    if (stopped) return
    try {
      const res = await fetch(`/api/present/${sessionId}/snapshot`, { cache: 'no-store' })
      if (res.status === 404) {
        // La sesión expiró o se cerró: para el público es la pantalla de cierre.
        accept({
          sessionId,
          pin: '',
          deckTitle: '',
          state: 'ended',
          currentSlide: 0,
          totalSlides: 0,
          version: Number.MAX_SAFE_INTEGER,
        })
        stop()
        return
      }
      if (!res.ok) return
      accept((await res.json()) as Snapshot)
    } catch {
      // Sin red. El siguiente ciclo lo reintenta; no hay nada que reportar.
    }
  }

  const startPolling = () => {
    if (pollTimer || stopped) return
    onStatus?.('polling')
    pollTimer = setInterval(fetchSnapshot, POLL_MS)
  }

  const connectBus = () => {
    if (!bus || stopped) return
    onStatus?.('connecting')

    // El token es de SOLO LECTURA y por eso puede viajar en la URL: es la única
    // forma de autenticar un EventSource, que no admite cabeceras.
    const url = `${bus.url}/subscribe/present:ch:${encodeURIComponent(sessionId)}?_token=${encodeURIComponent(bus.token)}`
    source = new EventSource(url)

    source.onopen = () => {
      busFailures = 0
      onStatus?.('live')
      // Al (re)conectar, el estado real manda sobre lo que hubiera en pantalla.
      void fetchSnapshot()
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    source.onmessage = (ev) => {
      // Upstash entrega `message,<canal>,<payload>`; el payload es nuestro JSON.
      const raw = String(ev.data ?? '')
      const start = raw.indexOf('{')
      if (start === -1) return
      try {
        accept(JSON.parse(raw.slice(start)) as Snapshot)
      } catch {
        // Un mensaje ilegible no rompe nada: el resync llega en ≤10 s.
      }
    }

    source.onerror = () => {
      busFailures++
      if (busFailures >= BUS_FAILURES_BEFORE_POLLING) {
        // EventSource reintenta solo, pero si no engancha no vamos a dejar al
        // salón congelado esperándolo.
        startPolling()
      }
    }
  }

  const stop = () => {
    stopped = true
    source?.close()
    source = null
    if (pollTimer) clearInterval(pollTimer)
    if (resyncTimer) clearInterval(resyncTimer)
    pollTimer = null
    resyncTimer = null
  }

  void fetchSnapshot()
  if (bus) connectBus()
  else startPolling()

  resyncTimer = setInterval(fetchSnapshot, RESYNC_MS)

  // Volver de segundo plano en un móvil suele haber matado la conexión sin
  // avisar: al reaparecer, lo primero es preguntar por dónde vamos.
  const onVisible = () => {
    if (document.visibilityState === 'visible') void fetchSnapshot()
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    stop()
  }
}

// ── Control del deck dentro del iframe ──────────────────────────────────────

export type DeckHandle = {
  goTo: (n: number) => void
  total: () => number
}

/**
 * Engancha el `<deck-stage>` del iframe. Devuelve null mientras el documento no
 * esté listo - el iframe es del mismo origen (por eso el deck se sirve desde
 * `/decks/<id>.html` y no desde su URL de blob), así que el acceso al DOM es
 * legítimo y no hay postMessage de por medio.
 */
/**
 * Oculta los controles propios del deck: rail de miniaturas, contador y botones.
 *
 * Lo delicado es DÓNDE viven. En el deck que exporta Claude Design el cromo
 * está dentro del **shadow DOM** de `<deck-stage>` (`.rail`, `.overlay`,
 * `button.btn`, `span.count`), y una hoja de estilos del documento no cruza esa
 * frontera: el CSS “genérico” que se inyectaba en el `<head>` no ocultaba
 * absolutamente nada y se proyectaba con 188 px de miniaturas a la vista.
 *
 * Se hacen dos cosas, en este orden:
 *
 *  1. `no-rail`, que es la API del propio componente (está en sus
 *     `observedAttributes`). Además de esconder el rail, **recupera su ancho**:
 *     con CSS a secas el rail desaparecía pero dejaba una banda negra de 188 px,
 *     porque el layout sigue reservándole el hueco.
 *  2. Un `<style>` inyectado DENTRO del shadow root para el resto del cromo, y
 *     otro en el documento para los decks que no usan shadow DOM.
 *
 * Todo va en try/catch: un deck que no deje tocar su interior se proyecta igual,
 * solo que con su propia barra a la vista.
 */
export function hideDeckChrome(iframe: HTMLIFrameElement, opts: { readOnly?: boolean } = {}): void {
  try {
    const doc = iframe.contentDocument
    if (!doc) return

    const light = doc.createElement('style')
    light.textContent = `
      deck-nav, deck-progress, deck-counter, deck-thumbs,
      [data-deck-chrome], .deck-nav, .deck-counter, .deck-thumbnails, .deck-controls {
        display: none !important;
      }
      ${opts.readOnly ? 'html, body { user-select: none !important; }' : ''}
    `
    doc.head.appendChild(light)

    const stage = doc.querySelector('deck-stage')
    if (!stage) return

    stage.setAttribute('no-rail', '')

    const shadow = (stage as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
    if (shadow) {
      const inner = doc.createElement('style')
      inner.textContent = `
        .rail, .rail-resize, .overlay { display: none !important; }
        ${opts.readOnly ? '.canvas { pointer-events: none !important; }' : ''}
      `
      shadow.appendChild(inner)
    }
  } catch {
    // Sin acceso al documento del deck no hay nada que hacer, y desde luego no
    // hay que romper la vista que lo envuelve.
  }
}

export function attachDeck(iframe: HTMLIFrameElement): DeckHandle | null {
  const doc = iframe.contentDocument
  if (!doc) return null
  const stage = doc.querySelector('deck-stage') as (Element & { goTo?: (n: number) => void }) | null
  if (!stage) return null

  return {
    goTo(n) {
      try {
        stage.goTo?.(n)
      } catch {
        // Un deck con su propio JS roto no debe tumbar la vista que lo envuelve.
      }
    },
    total() {
      return doc.querySelectorAll('deck-stage > section').length
    },
  }
}
