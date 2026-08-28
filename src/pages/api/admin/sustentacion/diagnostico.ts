import type { APIRoute } from 'astro'
import { presentStore, storeReadiness, PresentStoreError } from '../../../../lib/present/store'
import { serverEnv } from '../../../../lib/env'

/**
 * Diagnóstico de Redis para la sustentación: ¿lee?, ¿escribe?, y si no, ¿por qué?
 *
 * Existe por un fallo real: el panel decía "Redis respondió 403" y nada más. Un
 * 403 de Upstash puede ser un token revocado, una base borrada o un token de
 * SOLO LECTURA intentando escribir, y cada causa se arregla distinto. Sin poder
 * distinguirlas, la única salida era adivinar, y era la mañana de la charla.
 *
 * Prueba lo mismo que hace una sesión de verdad, en el orden en que lo hace:
 * primero una lectura, luego una escritura sobre una clave desechable con TTL
 * corto. Que la lectura funcione y la escritura no ES el diagnóstico.
 *
 * NUNCA devuelve valores de variables de entorno, solo si están definidas: esta
 * respuesta es texto que va a acabar pegado en un chat o en una captura.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const motivo = (e: unknown) =>
  e instanceof PresentStoreError ? e.message : e instanceof Error ? e.message : 'error inesperado'

export const GET: APIRoute = async () => {
  const store = presentStore()
  const readiness = storeReadiness()

  // Solo la PRESENCIA. Saber cuál falta es la mitad de los diagnósticos.
  const variables = Object.fromEntries(
    [
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'KV_REST_API_URL',
      'KV_REST_API_TOKEN',
      'KV_REST_API_READ_ONLY_TOKEN',
      'PRESENT_BUS_REST_URL',
      'PRESENT_BUS_REST_TOKEN',
      'PRESENT_BUS_READONLY_TOKEN',
      'AUTH_SECRET',
      'PRESENT_SECRET',
      'SUSTENTACION_PASSWORD',
    ].map((k) => [k, Boolean(serverEnv(k))])
  )

  const clave = `sust:diag:${Date.now()}`
  const lectura: { ok: boolean; error?: string } = { ok: false }
  const escritura: { ok: boolean; error?: string } = { ok: false }

  try {
    await store.get(clave)
    lectura.ok = true
  } catch (e) {
    lectura.error = motivo(e)
  }

  try {
    // TTL de un minuto: si algo sale mal a mitad, no queda basura en la base.
    await store.set(clave, '1', 60)
    escritura.ok = true
  } catch (e) {
    escritura.error = motivo(e)
  }

  // El veredicto en una frase, para no tener que interpretar el JSON con prisa.
  let veredicto: string
  if (store.kind !== 'upstash') {
    veredicto =
      'El almacén está EN MEMORIA, no en Redis: cada instancia de Vercel tendría su propio estado. Faltan UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN.'
  } else if (lectura.ok && escritura.ok) {
    veredicto = 'Redis lee y escribe. La sesión de sustentación se puede abrir.'
  } else if (lectura.ok && !escritura.ok) {
    veredicto =
      'Redis LEE pero NO ESCRIBE. El síntoma clásico de un token de solo lectura en UPSTASH_REDIS_REST_TOKEN: hay que poner ahí el token de lectura y escritura de la base (en la consola de Upstash, el que la integración expone como KV_REST_API_TOKEN).'
  } else {
    veredicto =
      'Redis no responde ni a lecturas. Token revocado, base borrada o límite de la cuenta alcanzado: el detalle está en el error de abajo.'
  }

  return json(200, {
    veredicto,
    almacen: store.kind,
    listo: readiness.ok,
    razon: readiness.reason ?? null,
    lectura,
    escritura,
    variables,
  })
}
