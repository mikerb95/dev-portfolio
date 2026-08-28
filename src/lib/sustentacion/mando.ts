// El lado del TELÉFONO: mandar. Es la contraparte de `obedecer.ts`, que es el
// lado del canvas, y como aquel corre en el navegador (sin `node:crypto`, sin
// `../db`, sin Redis) para poder importarse desde el `<script>` de la página.
//
// La lógica vive aquí y no dentro del `.astro` por una razón concreta: es lo
// único de todo el control remoto que puede equivocarse en silencio y hacer
// que la presentación salte dos beats delante del jurado. Fuera de la página
// se prueba con un `fetch` falso y un `localStorage` falso; dentro, no.
//
// IDENTIDAD Y CONTADOR, y por qué los dos se persisten
// -----------------------------------------------------
// El servidor corta el doble toque reclamando la pareja (clienteId, seq) de
// forma atómica (ver `control.ts`). Esa garantía solo sirve si el teléfono
// mantiene las dos mitades estables:
//
//  · `clienteId` se genera una vez y se guarda. Uno nuevo por carga convertiría
//    cada recarga en "otro mando" y el servidor no podría relacionar el
//    reintento con el comando original.
//  · `seq` se guarda ANTES de enviar y solo sube. Si se reiniciara en 1 al
//    recargar, el primer toque después de una recarga chocaría con un reclamo
//    ya hecho y se descartaría como duplicado: el botón no movería nada y la
//    causa sería invisible.
//
// EL REINTENTO REUSA EL MISMO `seq`. Es todo el sentido del reclamo atómico:
// con 5G irregular, lo normal no es que el comando no llegue, es que llegue y
// la respuesta se pierda. Reintentar con un `seq` nuevo avanzaría dos beats;
// reintentar con el mismo devuelve `aplicado: false` y la posición absoluta,
// que es exactamente lo que el teléfono necesita pintar.

import { esFormaPinPresentador, normalizarPinPresentador } from './pin-presentador'
import type { EstadoSustentacion } from './obedecer'

export type AccionMando = 'siguiente' | 'anterior' | 'ir'

/** Subconjunto de `localStorage` que se usa. Inyectable para probar. */
export type Almacen = {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
  removeItem(clave: string): void
}

export const CLAVE_PIN = 'rc.pin'
const CLAVE_CLIENTE = 'rc.cliente'
const CLAVE_SEQ = 'rc.seq'

/**
 * Un `localStorage` que no lanza. En iOS con navegación privada, escribir
 * lanza `QuotaExceededError`, y ese error saldría del handler del botón: el
 * mando se quedaría muerto por no poder recordar un número. Sin memoria el
 * control funciona igual (identidad efímera, contador en RAM), así que se
 * degrada en vez de fallar.
 */
export function almacenSeguro(base: Almacen | null | undefined): Almacen {
  const memoria = new Map<string, string>()
  return {
    getItem(clave) {
      try {
        return base?.getItem(clave) ?? memoria.get(clave) ?? null
      } catch {
        return memoria.get(clave) ?? null
      }
    },
    setItem(clave, valor) {
      memoria.set(clave, valor)
      try {
        base?.setItem(clave, valor)
      } catch {
        // La copia en memoria ya quedó: la sesión en curso sigue coherente.
      }
    },
    removeItem(clave) {
      memoria.delete(clave)
      try {
        base?.removeItem(clave)
      } catch {
        // Igual: lo que importa es que esta pestaña deje de verlo.
      }
    },
  }
}

/**
 * Forma que exige `parseComando` en el servidor: `^[a-z0-9-]{4,64}$`. Se
 * respeta aquí para que un id mal formado se vea en el primer toque en local y
 * no como un 400 en mitad de la sustentación.
 */
const CLIENTE_RE = /^[a-z0-9-]{4,64}$/

function idAleatorio(): string {
  const c = typeof crypto !== 'undefined' ? crypto : null
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().toLowerCase()
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(8))
    return Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('')
  }
  // Último recurso. No es una credencial: solo tiene que distinguir este
  // teléfono del siguiente dentro de una sesión de seis horas.
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0')
}

/** El id de este mando, estable entre recargas. Se crea la primera vez. */
export function identidadDelMando(store: Almacen): string {
  const guardado = (store.getItem(CLAVE_CLIENTE) ?? '').toLowerCase()
  if (CLIENTE_RE.test(guardado)) return guardado

  const nuevo = `celular-${idAleatorio()}`.slice(0, 64)
  const limpio = CLIENTE_RE.test(nuevo) ? nuevo : 'celular-respaldo'
  store.setItem(CLAVE_CLIENTE, limpio)
  return limpio
}

/**
 * El siguiente `seq`, ya persistido. Se guarda ANTES de enviar a propósito: si
 * el teléfono se apaga entre la reserva y el envío, el número perdido no le
 * cuesta nada a nadie, mientras que un número reutilizado sí cuesta un comando
 * silenciosamente descartado.
 */
export function reservarSeq(store: Almacen): number {
  const previo = Number(store.getItem(CLAVE_SEQ) ?? 0)
  const siguiente = Number.isInteger(previo) && previo > 0 ? previo + 1 : 1
  store.setItem(CLAVE_SEQ, String(siguiente))
  return siguiente
}

// ── PIN ─────────────────────────────────────────────────────────────────────

/** El PIN de presentador guardado, o null si no hay uno con forma válida. */
export function leerPin(store: Almacen): string | null {
  return normalizarPinPresentador(store.getItem(CLAVE_PIN))
}

/** Guarda el PIN si tiene forma válida. Devuelve el normalizado, o null. */
export function guardarPin(store: Almacen, bruto: string): string | null {
  const pin = normalizarPinPresentador(bruto)
  if (!pin) return null
  store.setItem(CLAVE_PIN, pin)
  return pin
}

export function olvidarPin(store: Almacen): void {
  store.removeItem(CLAVE_PIN)
}

// ── Envío ───────────────────────────────────────────────────────────────────

/** Por qué un envío no movió la presentación. */
export type FalloMando =
  | 'sin-pin' /** No hay PIN guardado, o el que hay no tiene forma válida. */
  | 'ocupado' /** Ya hay un comando en vuelo; el toque se ignora. */
  | 'pin-rechazado' /** 403: el PIN no controla esta sesión. Hay que reteclearlo. */
  | 'sin-sesion' /** 404: no hay sustentación abierta todavía. */
  | 'limite' /** 429: rate limit. Insistir solo empeora. */
  | 'sin-enlace' /** Ni una de las peticiones llegó a responder. */

export type ResultadoMando =
  | { ok: true; estado: EstadoSustentacion; aplicado: boolean; motivo: string | null }
  | { ok: false; fallo: FalloMando; error?: string }

export type OpcionesMando = {
  store: Almacen
  fetchImpl?: typeof fetch
  endpoint?: string
  /** Corte por intento. Corto a propósito: es mejor reintentar que esperar. */
  timeoutMs?: number
  /** Intentos con el MISMO `seq`. Dos cubren el bache típico de 5G. */
  intentos?: number
}

const TIMEOUT_MS = 2500
const INTENTOS = 2

export type Mando = {
  /** Manda un comando. Nunca lanza: todo fallo sale por el valor devuelto. */
  enviar(accion: AccionMando, beat?: number): Promise<ResultadoMando>
  /** ¿Hay un comando en vuelo? Lo mira la UI para no encolar toques. */
  ocupado(): boolean
  clienteId: string
}

export function crearMando(opts: OpcionesMando): Mando {
  const {
    store,
    fetchImpl,
    endpoint = '/api/sustentacion/comando',
    timeoutMs = TIMEOUT_MS,
    intentos = INTENTOS,
  } = opts

  const clienteId = identidadDelMando(store)
  let enVuelo = false

  async function intentar(cuerpo: string): Promise<Response | null> {
    const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : null)
    if (!f) return null

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null
    const corte = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
    try {
      return await f(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
        signal: ctrl?.signal,
        cache: 'no-store',
      })
    } catch {
      return null
    } finally {
      if (corte !== null) clearTimeout(corte)
    }
  }

  return {
    clienteId,
    ocupado: () => enVuelo,

    async enviar(accion, beat) {
      if (enVuelo) return { ok: false, fallo: 'ocupado' }

      const pin = leerPin(store)
      if (!pin || !esFormaPinPresentador(pin)) return { ok: false, fallo: 'sin-pin' }

      enVuelo = true
      try {
        // El `seq` se reserva UNA vez para los dos intentos. Ver la cabecera.
        const seq = reservarSeq(store)
        const cuerpo = JSON.stringify({
          pin,
          accion,
          ...(accion === 'ir' ? { beat } : {}),
          clienteId,
          seq,
        })

        for (let i = 0; i < Math.max(1, intentos); i++) {
          const res = await intentar(cuerpo)
          if (!res) continue // Sin respuesta: se reintenta con el mismo seq.

          if (res.ok) {
            const datos = (await res.json()) as EstadoSustentacion & {
              aplicado?: boolean
              motivo?: string | null
            }
            return {
              ok: true,
              estado: datos,
              aplicado: datos.aplicado === true,
              motivo: datos.motivo ?? null,
            }
          }

          // Un 4xx no mejora reintentando: el PIN sigue siendo el mismo y el
          // rate limit solo se agrava. Se corta aquí y se dice por qué.
          if (res.status === 403) return { ok: false, fallo: 'pin-rechazado' }
          if (res.status === 404) return { ok: false, fallo: 'sin-sesion' }
          if (res.status === 429) return { ok: false, fallo: 'limite' }
          if (res.status >= 400 && res.status < 500) {
            return { ok: false, fallo: 'sin-enlace', error: `HTTP ${res.status}` }
          }
          // 5xx (Redis caído) sí se reintenta: suele ser un pico, no un estado.
        }

        // Ninguna respuesta. Puede que el comando SÍ haya llegado: el sondeo de
        // `/estado` corregirá la posición en el ciclo siguiente. Por eso el
        // fallo se muestra y no se deshace nada localmente.
        return { ok: false, fallo: 'sin-enlace' }
      } finally {
        enVuelo = false
      }
    },
  }
}
