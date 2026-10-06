// Motor del asistente en el panel (RF-210, fase 7): la caja "Pregunta o busca
// algo" del dashboard. Conecta el bucle del analista (lib/analista/bucle.ts),
// que ya sabe pausarse para pedir aprobación, con las herramientas de lectura
// del asistente, sus escrituras y la tabla de conversaciones.
//
// Por qué la API y no la Agent SDK de la terminal: la SDK levanta un
// subproceso que no cabe en una función de Vercel (mismo motivo que el
// analista), y una propuesta puede esperar el clic de Mike durante horas.
//
// Paga SOLO con ANTHROPIC_API_KEY (Claude Platform). Solo servidor.

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverEnv } from '../env'
import { avanzar, decidir, nuevaEjecucion, type Dependencias, type Ejecucion, type EventoBucle } from '../analista/bucle'
import { costoUsd, MODELO, sumarUso, USO_CERO } from '../analista/costo'
import { exigirApiKey } from '../analista/credencial'
import { crearConversacion, guardarConversacion, MAX_TURNOS, reclamar } from './conversaciones'
import { ESCRITURAS, escritura } from './escrituras'
import { ejecutar, herramienta, HERRAMIENTAS } from './herramientas'
import { fecha } from './herramientas/tipos'
import { TOPE_ASISTENTE } from './presupuesto'
import { systemPrompt } from './prompt'
import { contarTurnos, PREFIJO_CAMBIOS } from './turnos'

export class SinPresupuesto extends Error {
  constructor() {
    super('Se alcanzó el tope de gasto diario del asistente. Vuelve a intentarlo mañana.')
    this.name = 'SinPresupuesto'
  }
}

export class ConversacionLarga extends Error {
  constructor() {
    super(`Esta conversación ya tiene ${MAX_TURNOS} preguntas. Empieza una nueva: sale más barato y responde igual.`)
    this.name = 'ConversacionLarga'
  }
}

// Definiciones para la API generadas del mismo esquema Zod que valida antes de
// ejecutar. La última lleva la marca de caché: herramientas y system prompt no
// cambian en el día, así que desde la segunda llamada se leen de caché.
function definiciones(): Anthropic.Beta.BetaTool[] {
  const todas = [...HERRAMIENTAS, ...ESCRITURAS]
  return todas.map((h, i) => {
    const { $schema: _, ...esquema } = z.toJSONSchema(h.esquema) as Record<string, unknown>
    return {
      name: h.nombre,
      description: h.descripcion,
      input_schema: esquema as Anthropic.Beta.BetaTool.InputSchema,
      ...(i === todas.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }
  })
}

/** Lo que recibe el modelo cuando Mike no aprueba. Con indicación, `turnos.ts` la recupera para pintarla. */
export function textoRechazo(comentario: string | null): string {
  return comentario
    ? `${PREFIJO_CAMBIOS}"${comentario}". Ajusta la propuesta según su indicación y vuelve a proponer si corresponde.`
    : 'Mike no aprobó la propuesta. No la repitas igual: pregúntale qué quiere cambiar.'
}

function dependencias(emitir: (e: EventoBucle) => void): Dependencias {
  const api = new Anthropic({ apiKey: exigirApiKey(serverEnv('ANTHROPIC_API_KEY')) })
  const tools = definiciones()
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: systemPrompt(fecha(new Date())!, 'panel'), cache_control: { type: 'ephemeral' } },
  ]
  return {
    herramientaBloqueo: ESCRITURAS[0]!.nombre,
    herramientasAprobacion: ESCRITURAS.map((e) => e.nombre),
    async llamarModelo(mensajes) {
      const msg = await api.beta.messages
        .stream({
          model: MODELO,
          max_tokens: 16_000,
          system,
          tools,
          messages: mensajes,
          thinking: { type: 'adaptive' },
          // Decidido por Mike el 6 oct 2026 para el asistente: las
          // herramientas hacen el trabajo pesado, el modelo solo elige y resume.
          output_config: { effort: 'medium' },
        })
        .finalMessage()
      // El gasto se suma por llamada y no al final: si la función muere a
      // mitad, lo ya pagado cuenta igual para el tope.
      await TOPE_ASISTENTE.sumarGasto(costoUsd(sumarUso(USO_CERO, msg.usage))).catch((err) =>
        console.error('[asistente] no se pudo sumar el gasto', err)
      )
      return msg
    },
    validar(nombre, entrada) {
      const h = herramienta(nombre) ?? escritura(nombre)
      if (!h) return `Herramienta desconocida: ${nombre}`
      const r = h.esquema.safeParse(entrada ?? {})
      return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    },
    async ejecutar(nombre, entrada) {
      const w = escritura(nombre)
      // Solo `decidir` llega aquí con una escritura, y solo tras el "Aprobar".
      if (w) return w.ejecutar(entrada)
      return ejecutar(nombre, entrada)
    },
    async prepararPropuesta(nombre, entrada) {
      const w = escritura(nombre)
      if (!w) return { ok: false, error: `${nombre} no es una acción que se pueda proponer.` }
      return w.preparar(entrada)
    },
    rechazo: textoRechazo,
    guardar: (e) => guardarConversacion(e),
    emitir,
    presupuestoRestante: () => TOPE_ASISTENTE.presupuestoRestante(),
  }
}

async function exigirPresupuesto() {
  exigirApiKey(serverEnv('ANTHROPIC_API_KEY'))
  // Sin poder leer el gasto, lanza: el llamador responde 503 y no se gasta.
  if ((await TOPE_ASISTENTE.presupuestoRestante()) <= 0) throw new SinPresupuesto()
}

/** Crea una conversación nueva sin arrancarla, para fallar con un error claro antes de transmitir. */
export async function prepararConversacion(pregunta: string): Promise<Ejecucion> {
  await exigirPresupuesto()
  const e = nuevaEjecucion(randomUUID(), pregunta)
  await crearConversacion(e)
  return e
}

/**
 * Toma una conversación existente para seguirla con otra pregunta. Si había
 * una propuesta esperando, la pregunta cuenta como "no apruebo, cambia esto".
 * null si no existe, está corriendo en otra pestaña o se cortó con un error.
 */
export async function reclamarParaSeguir(id: string): Promise<Ejecucion | null> {
  await exigirPresupuesto()
  // Una fallida no se sigue: pudo cortarse con herramientas sin respuesta, y
  // anexar una pregunta encima haría inválido el historial. Se empieza otra.
  const e = await reclamar(id, ['terminada', 'esperando_aprobacion'])
  if (!e) return null
  if (contarTurnos(e.mensajes as never) >= MAX_TURNOS && !e.propuesta) {
    // Se devuelve a su estado: reclamarla no debe dejarla "corriendo" para siempre.
    e.estado = 'terminada'
    await guardarConversacion(e)
    throw new ConversacionLarga()
  }
  return e
}

/** Reclama la propuesta pendiente para decidirla (atómico). null si ya se decidió. */
export async function reclamarDecision(id: string): Promise<Ejecucion | null> {
  exigirApiKey(serverEnv('ANTHROPIC_API_KEY'))
  return reclamar(id, ['esperando_aprobacion'])
}

/** Corre una conversación nueva hasta que termina, falla o se pausa. Nunca lanza. */
export function correr(e: Ejecucion, emitir: (e: EventoBucle) => void): Promise<Ejecucion> {
  return avanzar(e, dependencias(emitir))
}

/** Sigue una conversación reclamada con la pregunta nueva de Mike. Nunca lanza. */
export async function seguir(e: Ejecucion, pregunta: string, emitir: (e: EventoBucle) => void): Promise<Ejecucion> {
  const deps = dependencias(emitir)
  // El tope de pasos es por pregunta, no por conversación.
  e.iteraciones = 0
  // Con una propuesta pendiente, escribir otra cosa es pedir cambios.
  if (e.propuesta) return decidir(e, false, deps, pregunta)
  e.mensajes.push({ role: 'user', content: pregunta })
  e.estado = 'corriendo'
  e.respuesta = null
  e.error = null
  return avanzar(e, deps)
}

/** Aplica la decisión de Mike y retoma. Nunca lanza. */
export function continuarDecision(e: Ejecucion, aprobado: boolean, emitir: (e: EventoBucle) => void): Promise<Ejecucion> {
  return decidir(e, aprobado, dependencias(emitir))
}
