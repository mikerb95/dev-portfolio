// Motor de producción del analista: conecta el bucle (bucle.ts) con la API de
// Claude, las herramientas del micro-SIEM y la tabla de ejecuciones. Es lo que
// usan las rutas de /api/admin/analista. Solo servidor.
//
// Paga SOLO con ANTHROPIC_API_KEY (Claude Platform). No hay otra vía: el SDK
// de la API no conoce el login de claude.ai.

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverEnv } from '../env'
import { avanzar, decidir, nuevaEjecucion, type Dependencias, type Ejecucion, type EventoBucle } from './bucle'
import { MODELO } from './costo'
import { exigirApiKey } from './credencial'
import {
  crearEjecucion,
  guardarEjecucion,
  hayEnCurso,
  presupuestoRestante,
  reclamarPropuesta,
} from './ejecuciones'
import { ejecutar, HERRAMIENTA_BLOQUEO, herramienta, HERRAMIENTAS } from './herramientas'
import { systemPrompt } from './prompt'

export const RUTA_AUDITORIA = '/admin/analista'

// Definiciones para la API, generadas del mismo esquema Zod que valida la
// entrada antes de ejecutar. La última lleva la marca de caché: herramientas y
// system prompt son fijos, así que a partir del segundo turno se leen de caché
// (una décima parte del precio).
function definiciones(): Anthropic.Beta.BetaTool[] {
  return HERRAMIENTAS.map((h, i) => {
    const { $schema: _, ...esquema } = z.toJSONSchema(h.esquema) as Record<string, unknown>
    return {
      name: h.nombre,
      description: h.descripcion,
      input_schema: esquema as Anthropic.Beta.BetaTool.InputSchema,
      ...(i === HERRAMIENTAS.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }
  })
}

function cliente(): Anthropic {
  return new Anthropic({ apiKey: exigirApiKey(serverEnv('ANTHROPIC_API_KEY')) })
}

function dependencias(emitir: (e: EventoBucle) => void): Dependencias {
  const api = cliente()
  const tools = definiciones()
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: systemPrompt('pantalla'), cache_control: { type: 'ephemeral' } },
  ]
  return {
    herramientaBloqueo: HERRAMIENTA_BLOQUEO,
    llamarModelo: (mensajes) =>
      api.beta.messages
        .stream({
          model: MODELO,
          max_tokens: 32_000,
          system,
          tools,
          messages: mensajes,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high' },
          // Si el modelo declina por un falso positivo de sus filtros (un
          // análisis de ataques puede parecerlo), el servidor reintenta con
          // el modelo de respaldo que corresponda en la misma llamada.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
        .finalMessage(),
    validar: (nombre, entrada) => {
      const h = herramienta(nombre)
      if (!h) return `Herramienta desconocida: ${nombre}`
      const r = h.esquema.safeParse(entrada ?? {})
      return r.success ? null : r.error.issues.map((i) => i.message).join('; ')
    },
    ejecutar: (nombre, entrada, seudonimos) => ejecutar(nombre, entrada, { seudonimos, rutaAuditoria: RUTA_AUDITORIA }),
    guardar: (e) => guardarEjecucion(e),
    emitir,
    presupuestoRestante: () => presupuestoRestante(),
  }
}

export class AnalistaOcupado extends Error {
  constructor() {
    super('Ya hay un análisis en curso. Espera a que termine.')
    this.name = 'AnalistaOcupado'
  }
}

export class SinPresupuesto extends Error {
  constructor() {
    super('Se alcanzó el tope de gasto diario del analista. Vuelve a intentarlo mañana.')
    this.name = 'SinPresupuesto'
  }
}

/** Arranca un análisis nuevo. Lanza si falta la API key, si hay otro en curso o si no queda presupuesto. */
export async function iniciarAnalisis(pregunta: string, emitir: (e: EventoBucle) => void): Promise<Ejecucion> {
  const deps = dependencias(emitir)
  if (await hayEnCurso()) throw new AnalistaOcupado()
  if ((await presupuestoRestante()) <= 0) throw new SinPresupuesto()
  const e = nuevaEjecucion(randomUUID(), pregunta)
  await crearEjecucion(e)
  return avanzar(e, deps)
}

/** Aplica la decisión sobre un bloqueo pendiente y retoma el análisis. null si ya estaba decidido. */
export async function decidirPropuesta(
  id: string,
  aprobado: boolean,
  emitir: (e: EventoBucle) => void
): Promise<Ejecucion | null> {
  const deps = dependencias(emitir)
  const e = await reclamarPropuesta(id)
  if (!e) return null
  return decidir(e, aprobado, deps)
}
