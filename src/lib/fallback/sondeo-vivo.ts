// Sondeo en vivo para /status cuando la base de datos no responde.
//
// EL PUNTO: una página de estado que no puede leer su historial NO tiene que
// resignarse a estar vacía. Puede medir. Estos números se toman en el momento
// del render, contra los endpoints públicos reales, y son más ciertos que
// cualquier fila guardada: describen el estado de ahora, no el de la última vez
// que el cron pudo escribir.
//
// Lo que NO puede dar es historial: sin base no hay 30 días de nada, y esta
// capa no inventa uno. La página lo dice explícitamente en modo respaldo.
//
// Coste: se activa solo cuando la consulta a base falló, y /status se sirve con
// `s-maxage=300` del CDN, así que como mucho hay un barrido de sondeos cada
// 5 minutos por región, no uno por visitante.

import { probe, type MonitorState } from '../monitors'
import { DESTINOS_RESPALDO, origenPublico, type DestinoRespaldo } from '../../data/respaldo-monitores'

export type EstadoVivo = {
  id: number
  name: string
  lastStatus: MonitorState
  lastCheckedAt: Date
  lastResponseMs: number | null
  sslExpiresAt: Date | null
}

// Techo corto: esto corre dentro de un render que alguien está esperando. Un
// destino que no contesta en 4s se reporta como caído, que para una página de
// estado es información válida, no un fallo del sondeo.
const TIMEOUT_MS = 4_000

// Memo en el proceso. Fluid Compute reutiliza instancias entre requests, así
// que dos visitas seguidas a la misma instancia comparten el barrido en vez de
// repetirlo. Es best-effort, no un cache distribuido: si no acierta, lo peor
// que pasa es que se vuelve a medir.
let memo: { at: number; datos: EstadoVivo[] } | null = null
const MEMO_MS = 60_000

async function sondear(destino: DestinoRespaldo, origen: string): Promise<EstadoVivo> {
  const resultado = await probe({
    url: urlDe(destino, origen),
    method: 'GET',
    expectedStatus: 200,
    expectedText: destino.textoEsperado ?? null,
    latencyThresholdMs: destino.umbralMs,
    timeoutMs: TIMEOUT_MS,
  })

  return {
    id: destino.id,
    name: destino.nombre,
    lastStatus: resultado.state,
    lastCheckedAt: new Date(),
    lastResponseMs: resultado.responseMs,
    // El certificado se lee con un socket TLS aparte: en modo respaldo se omite
    // a propósito, porque duplicaría el tiempo del render para un dato que la
    // página ya marca como no disponible.
    sslExpiresAt: null,
  }
}

/**
 * Mide en paralelo todos los destinos de respaldo. Nunca lanza: `probe` ya
 * devuelve las caídas como resultado, y un fallo inesperado se reporta como
 * monitor en estado desconocido en vez de tumbar la página que lo llamó.
 */
export async function sondearEnVivo(): Promise<EstadoVivo[]> {
  const ahora = Date.now()
  if (memo && ahora - memo.at < MEMO_MS) return memo.datos

  const origen = origenPublico()
  const resultados = await Promise.all(
    DESTINOS_RESPALDO.map((d) =>
      sondear(d, origen).catch(
        (): EstadoVivo => ({
          id: d.id,
          name: d.nombre,
          lastStatus: 'unknown',
          lastCheckedAt: new Date(),
          lastResponseMs: null,
          sslExpiresAt: null,
        }),
      ),
    ),
  )

  memo = { at: ahora, datos: resultados }
  return resultados
}
