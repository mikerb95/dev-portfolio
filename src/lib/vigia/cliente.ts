import Anthropic from '@anthropic-ai/sdk'
import { exigirApiKey } from '../analista/credencial'
import { serverEnv } from '../env'

/** Cliente de la API para leer y responder sesiones del vigía. Lanza SinApiKey si falta la clave. */
export function clienteVigia(): Anthropic {
  return new Anthropic({ apiKey: exigirApiKey(serverEnv('ANTHROPIC_API_KEY')) })
}
