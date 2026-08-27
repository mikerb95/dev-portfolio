// Publicador de beats para el navegador. Módulo PURO e isomorfo: sin
// `node:crypto`, sin `../db`, sin nada del servidor, porque lo importa un
// `<script>` de la página de sustentación.
//
// La regla que gobierna todo este archivo: PUBLICAR NUNCA PUEDE ESTORBAR.
// Esto se llama desde el handler de la flecha derecha, delante de un jurado,
// con datos móviles. Si Upstash no responde, si no hay red, si el endpoint
// devuelve 500 o si `fetch` ni siquiera existe, la diapositiva avanza igual y
// el fallo no sale de la consola. Mismo criterio que `lib/notify.ts`, que hace
// no-op silencioso cuando falta su configuración.
//
// Tres decisiones que hacen que eso sea cierto y no una intención:
//
//  1. La función devuelve `void` de forma SÍNCRONA. No hay promesa que
//     esperar, así que quien la llama no puede bloquearse ni por descuido.
//  2. Todo el cuerpo va dentro de un `try`, incluida la construcción del
//     `fetch`. Un `AbortController` que no exista no puede tumbar la flecha.
//  3. `keepalive: true`: si el beat coincide con una navegación, el navegador
//     termina de enviarlo en vez de cancelarlo.

export type Publicador = (indice: number, titulo: string, dato?: string | null) => void

export type OpcionesPublicador = {
  sessionId: string
  secreto: string
  /** Corte duro. Un beat que tarda más que esto ya no le importa a nadie. */
  timeoutMs?: number
  endpoint?: string
  /** Inyectable para poder probar el fail-open sin levantar un servidor. */
  fetchImpl?: typeof fetch
}

/** No-op silencioso: lo que se devuelve cuando faltan credenciales de sesión. */
const NO_OP: Publicador = () => {}

export function crearPublicador(opts: OpcionesPublicador): Publicador {
  const {
    sessionId,
    secreto,
    timeoutMs = 1500,
    endpoint = '/api/sustentacion/beat',
    fetchImpl,
  } = opts ?? ({} as OpcionesPublicador)

  // Sin sesión no se publica, y tampoco se avisa en cada flecha: la
  // presentación funciona perfectamente sin seguidores.
  if (!sessionId || !secreto) return NO_OP

  return function publicarBeat(indice, titulo, dato = null) {
    try {
      const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : null)
      if (!f) return

      // El corte se arma antes del envío y se desarma pase lo que pase.
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null
      const corte = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null

      const peticion = f(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, secreto, beat: indice, titulo, dato }),
        signal: ctrl?.signal,
        keepalive: true,
      })

      // `void` y no `await`: aquí es donde se decide que la flecha no espera.
      void Promise.resolve(peticion)
        .catch((e: unknown) => {
          console.debug('[sustentacion] beat no publicado:', (e as Error)?.message ?? e)
        })
        .finally(() => {
          if (corte !== null) clearTimeout(corte)
        })
    } catch (e) {
      // Falla la construcción misma del envío. Ni siquiera esto se propaga.
      console.debug('[sustentacion] beat no publicado:', (e as Error)?.message ?? e)
    }
  }
}
