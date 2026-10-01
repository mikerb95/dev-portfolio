// Redacción del resumen semanal con la API de Claude. Solo servidor.
//
// Mismo modelo, misma regla de credencial y mismo respaldo ante negativas que
// el analista (lib/analista). Una llamada por semana, sin herramientas y con
// una entrada de tamaño fijo: unos US$0,02. Sin API key o si la API falla,
// devuelve null y el cron manda el resumen armado sin IA.
import Anthropic from '@anthropic-ai/sdk'
import { exigirApiKey } from './analista/credencial'
import { costoUsd, MODELO, sumarUso, USO_CERO } from './analista/costo'
import { serverEnv } from './env'
import { entradaModelo, partirRespuesta, SYSTEM, type DatosSemana } from './resumen-semanal'

export async function redactar(d: DatosSemana): Promise<{ titular: string; texto: string; costoUsd: number } | null> {
  let api: Anthropic
  try {
    api = new Anthropic({ apiKey: exigirApiKey(serverEnv('ANTHROPIC_API_KEY')), timeout: 60_000, maxRetries: 1 })
  } catch {
    return null
  }
  try {
    const r = await api.beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: entradaModelo(d) }],
      // Redactar un resumen corto de cifras ya calculadas no necesita pensar a fondo.
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (r.stop_reason === 'refusal') return null
    const texto = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
    if (!texto) return null
    return { ...partirRespuesta(texto, d), costoUsd: costoUsd(sumarUso(USO_CERO, r.usage)) }
  } catch (err) {
    console.error('[resumen-semanal] API:', err instanceof Error ? err.message : err)
    return null
  }
}
