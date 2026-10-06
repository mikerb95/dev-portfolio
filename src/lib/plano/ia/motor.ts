// Llamadas a Claude de Plano. Solo servidor.
//
// Opus 5.5 y no Haiku como el asesor público: es uso privado, de bajo volumen
// (unas pocas llamadas por propuesta) y la calidad de la lectura de una
// conversación desordenada importa más que unos centavos. Salida estructurada
// (JSON con esquema) en vez de texto libre: la respuesta se valida campo por
// campo antes de tocar la propuesta, y nada de lo que diga el modelo se usa
// sin pasar por esa validación.
//
// `fallbacks: "default"`: si los clasificadores de Opus 5.5 rechazan una
// petición (una conversación de cliente rara vez lo provoca, pero puede), la
// API la reintenta en el modelo que corresponda en vez de devolver el rechazo.

import Anthropic from '@anthropic-ai/sdk'
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import { exigirApiKey } from '../../analista/credencial'
import { serverEnv } from '../../env'

export const MODELO = 'claude-opus-5-5'

/** USD por millón de tokens (Opus 5.5). Escribir en caché cuesta 1,25 veces la entrada. */
export const TARIFA = { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 } as const

export class IaNoDisponible extends Error {
  constructor(public motivo: 'sin_clave' | 'rechazo' | 'formato' | 'api') {
    super(
      {
        sin_clave: 'Falta ANTHROPIC_API_KEY en el entorno.',
        rechazo: 'Claude no quiso procesar este contenido.',
        formato: 'La respuesta de Claude no tuvo el formato esperado. Inténtalo otra vez.',
        api: 'La API de Claude no respondió. Inténtalo en un momento.',
      }[motivo],
    )
    this.name = 'IaNoDisponible'
  }
}

type Usage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function costoUsd(u: Usage | null | undefined): number {
  if (!u) return 0
  const m = 1_000_000
  return (
    ((u.input_tokens ?? 0) * TARIFA.entrada) / m +
    ((u.output_tokens ?? 0) * TARIFA.salida) / m +
    ((u.cache_read_input_tokens ?? 0) * TARIFA.cacheLectura) / m +
    ((u.cache_creation_input_tokens ?? 0) * TARIFA.cacheEscritura) / m
  )
}

export type Esquema = Parameters<typeof betaJSONSchemaOutputFormat>[0]

/**
 * Una llamada con salida estructurada. Devuelve el objeto ya parseado (sin
 * validar el negocio: eso lo hace quien llama) y el costo.
 */
export async function pedirJson<T>(opts: { system: string; usuario: string; esquema: Esquema; maxTokens?: number }): Promise<{ datos: T; costo: number }> {
  let clave: string
  try {
    clave = exigirApiKey(serverEnv('ANTHROPIC_API_KEY'))
  } catch {
    throw new IaNoDisponible('sin_clave')
  }
  const api = new Anthropic({ apiKey: clave, maxRetries: 1, timeout: 120_000 })
  let r
  try {
    r = await api.beta.messages.parse({
      model: MODELO,
      max_tokens: opts.maxTokens ?? 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // El prompt de sistema (con el catálogo entero) es idéntico entre
      // llamadas: se cachea y la segunda propuesta del día lo lee a 1/20.
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'medium', format: betaJSONSchemaOutputFormat(opts.esquema) },
      messages: [{ role: 'user', content: opts.usuario }],
    })
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new IaNoDisponible('api')
    throw e
  }
  const costo = costoUsd(r.usage)
  if (r.stop_reason === 'refusal') throw new IaNoDisponible('rechazo')
  if (!r.parsed_output) throw new IaNoDisponible('formato')
  return { datos: r.parsed_output as T, costo }
}
