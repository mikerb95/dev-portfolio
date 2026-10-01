// Motor del asesor público: conecta el bucle (bucle.ts) con la API de Claude y
// el tope diario. Solo servidor.
//
// Haiku 4.5 y no Opus como el analista: respuestas cortas a dudas comerciales,
// con los precios fuera del modelo, no necesitan más, y un endpoint público
// conviene que cueste lo mínimo por pregunta.
//
// Sin transmisión en vivo (a diferencia del analista): la guardia de cifras
// revisa la respuesta COMPLETA antes de mostrarla, así que transmitirla palabra
// a palabra enseñaría justo lo que la guardia podría rechazar.

import Anthropic from '@anthropic-ai/sdk'
import { serverEnv } from '../env'
import { exigirApiKey } from '../analista/credencial'
import { atender, type Entrada, type Respuesta } from './bucle'
import { costoUsd, MODELO } from './costo'
import { definiciones } from './herramientas'
import { presupuestoRestante, sumarGasto } from './presupuesto'
import { systemPrompt } from './prompt'

export class AsesorNoDisponible extends Error {
  constructor(motivo: 'sin_clave' | 'sin_presupuesto') {
    super(motivo)
    this.name = 'AsesorNoDisponible'
  }
}

/** ¿Puede responder ahora? Falla cerrado: si la base no contesta, no. */
export async function disponible(): Promise<boolean> {
  try {
    exigirApiKey(serverEnv('ANTHROPIC_API_KEY'))
    return (await presupuestoRestante()) > 0
  } catch {
    return false
  }
}

export async function responder(e: Entrada): Promise<Respuesta> {
  let clave: string
  try {
    clave = exigirApiKey(serverEnv('ANTHROPIC_API_KEY'))
  } catch {
    throw new AsesorNoDisponible('sin_clave')
  }
  let restante = 0
  try {
    restante = await presupuestoRestante()
  } catch {
    restante = 0
  }
  if (restante <= 0) throw new AsesorNoDisponible('sin_presupuesto')

  // Dos reintentos del SDK por defecto multiplicarían la espera de alguien que
  // está mirando el chat; uno basta, y con 25 s de tope por llamada.
  const api = new Anthropic({ apiKey: clave, maxRetries: 1, timeout: 25_000 })
  const tools = definiciones().map((d, i, todas) => ({
    ...d,
    input_schema: d.input_schema as Anthropic.Tool.InputSchema,
    ...(i === todas.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }))
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: systemPrompt(e.locale), cache_control: { type: 'ephemeral' } },
  ]

  const r = await atender(e, {
    llamarModelo: (messages) =>
      api.messages.create({
        model: MODELO,
        // Respuestas de 2 a 5 frases; el techo evita que una respuesta
        // desbocada cueste diez veces lo normal.
        max_tokens: 700,
        system,
        tools,
        messages,
      }),
  })

  // Si anotar el gasto falla, la respuesta ya está pagada: se entrega igual.
  await sumarGasto(costoUsd(r.uso)).catch(() => {})
  return r
}
