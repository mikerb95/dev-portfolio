// Bucle del agente en producción: habla con la API de Claude, ejecuta las
// herramientas y, cuando el modelo pide un bloqueo, SE PAUSA.
//
// Por qué un bucle propio y no el Tool Runner del SDK: el runner corre el
// agente de un tirón, y aquí un bloqueo puede esperar la decisión del
// administrador durante horas. Una función de Vercel no puede quedarse
// esperando, así que la ejecución se guarda (estado `esperando_aprobacion`),
// la función termina, y `decidir()` la retoma en otra petición con el
// `tool_result` que falta.
//
// Reglas que impone Opus 5.5 y que este bucle respeta:
//  - Historial solo por anexión: el `content` de cada respuesta se guarda tal
//    cual (bloques de thinking incluidos). Editar turnos previos invalida el
//    thinking.
//  - Nunca se ejecutan herramientas de un turno cortado (`max_tokens`,
//    `refusal`): su entrada puede estar truncada.
//
// Módulo sin BD ni red: todo lo externo llega por `Dependencias`, para poder
// probar cada rama con un modelo falso.

import type Anthropic from '@anthropic-ai/sdk'
import { costoUsd, sumarUso, USO_CERO, type Uso } from './costo'
import { Seudonimos } from './seudonimos'

type Mensaje = Anthropic.Beta.BetaMessage
type MensajeParam = Anthropic.Beta.BetaMessageParam
type ResultadoParam = Anthropic.Beta.BetaToolResultBlockParam

export const MAX_ITERACIONES = 15

export type EstadoEjecucion = 'corriendo' | 'esperando_aprobacion' | 'terminada' | 'fallida'

export type Propuesta = {
  toolUseId: string
  origen: string
  motivo: string
  entrada: unknown
  /** Resultados ya calculados de las otras herramientas del mismo turno. */
  resultadosPrevios: ResultadoParam[]
  /** Orden de los tool_use del turno: los resultados vuelven en ese orden. */
  orden: string[]
}

export type Ejecucion = {
  id: string
  estado: EstadoEjecucion
  pregunta: string
  mensajes: MensajeParam[]
  seudonimos: Record<string, string>
  propuesta: Propuesta | null
  respuesta: string | null
  error: string | null
  iteraciones: number
  uso: Uso
  costoUsd: number
}

export type EventoBucle =
  | { tipo: 'paso'; id: string; herramienta: string; entrada: Record<string, unknown> }
  | { tipo: 'dato'; herramienta: string; datos: unknown }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'aprobacion'; origen: string; motivo: string }
  | { tipo: 'decision'; origen: string; aprobado: boolean }
  | { tipo: 'fin'; estado: EstadoEjecucion; iteraciones: number; costoUsd: number; error: string | null }

export type ResultadoHerramienta = { ok: true; datos: unknown } | { ok: false; error: string }

export type Dependencias = {
  llamarModelo: (mensajes: MensajeParam[]) => Promise<Mensaje>
  /** Valida la entrada sin ejecutar (para no molestar al humano con una propuesta mal formada). */
  validar: (nombre: string, entrada: unknown) => string | null
  ejecutar: (nombre: string, entrada: unknown, seudonimos: Seudonimos) => Promise<ResultadoHerramienta>
  guardar: (e: Ejecucion) => Promise<void>
  emitir: (e: EventoBucle) => void
  /** USD que quedan hoy. Si no se puede saber, debe lanzar: sin saberlo no se gasta. */
  presupuestoRestante: () => Promise<number>
  herramientaBloqueo: string
}

export function nuevaEjecucion(id: string, pregunta: string): Ejecucion {
  return {
    id,
    estado: 'corriendo',
    pregunta,
    mensajes: [{ role: 'user', content: pregunta }],
    seudonimos: {},
    propuesta: null,
    respuesta: null,
    error: null,
    iteraciones: 0,
    uso: USO_CERO,
    costoUsd: 0,
  }
}

const aResultado = (toolUseId: string, r: ResultadoHerramienta): ResultadoParam =>
  r.ok
    ? { type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify(r.datos) }
    : { type: 'tool_result', tool_use_id: toolUseId, content: r.error, is_error: true }

const enOrden = (orden: string[], resultados: ResultadoParam[]) =>
  orden.map((id) => resultados.find((r) => r.tool_use_id === id)).filter((r): r is ResultadoParam => !!r)

async function terminar(e: Ejecucion, deps: Dependencias, estado: EstadoEjecucion, error: string | null) {
  e.estado = estado
  e.error = error
  e.propuesta = null
  await deps.guardar(e)
  deps.emitir({ tipo: 'fin', estado, iteraciones: e.iteraciones, costoUsd: e.costoUsd, error })
  return e
}

/** Hace avanzar una ejecución `corriendo` hasta que termina, falla o se pausa. */
export async function avanzar(e: Ejecucion, deps: Dependencias): Promise<Ejecucion> {
  const seudonimos = Seudonimos.desde(e.seudonimos)

  while (true) {
    if (e.iteraciones >= MAX_ITERACIONES) {
      return terminar(e, deps, 'fallida', `El análisis superó el máximo de ${MAX_ITERACIONES} pasos.`)
    }
    let restante: number
    try {
      restante = await deps.presupuestoRestante()
    } catch {
      return terminar(e, deps, 'fallida', 'No se pudo comprobar el gasto del día; por seguridad no se sigue gastando.')
    }
    if (restante <= 0) return terminar(e, deps, 'fallida', 'Se alcanzó el tope de gasto diario del analista.')

    let msg: Mensaje
    try {
      msg = await deps.llamarModelo(e.mensajes)
    } catch (err) {
      return terminar(e, deps, 'fallida', `La API de Claude falló: ${err instanceof Error ? err.message : String(err)}`)
    }
    e.iteraciones++
    e.uso = sumarUso(e.uso, msg.usage)
    e.costoUsd = costoUsd(e.uso)
    e.mensajes.push({ role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] })

    const textos = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text' && !!b.text.trim())
    for (const t of textos) deps.emitir({ tipo: 'texto', texto: t.text.trim() })

    switch (msg.stop_reason) {
      case 'end_turn':
      case 'stop_sequence':
        e.respuesta = textos.map((t) => t.text.trim()).join('\n\n') || null
        return terminar(e, deps, 'terminada', null)
      case 'pause_turn':
        await deps.guardar(e)
        continue
      case 'refusal':
        return terminar(e, deps, 'fallida', 'El modelo declinó continuar con este análisis.')
      case 'max_tokens':
        return terminar(e, deps, 'fallida', 'La respuesta del modelo se cortó por longitud.')
      case 'tool_use':
        break
      default:
        return terminar(e, deps, 'fallida', `El modelo se detuvo de forma inesperada (${msg.stop_reason}).`)
    }

    const usos = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (!usos.length) return terminar(e, deps, 'fallida', 'El modelo pidió herramientas sin nombrar ninguna.')

    const resultados: ResultadoParam[] = []
    let propuesta: Propuesta | null = null
    for (const uso of usos) {
      if (uso.name === deps.herramientaBloqueo) {
        const invalida = deps.validar(uso.name, uso.input)
        const entrada = (uso.input ?? {}) as { origen?: string; motivo?: string }
        if (invalida) {
          resultados.push(aResultado(uso.id, { ok: false, error: invalida }))
        } else if (!seudonimos.ip(String(entrada.origen))) {
          resultados.push(aResultado(uso.id, { ok: false, error: `"${entrada.origen}" no es un origen visto en este análisis.` }))
        } else if (propuesta) {
          resultados.push(aResultado(uso.id, { ok: false, error: 'Propón un bloqueo a la vez y espera la decisión.' }))
        } else {
          propuesta = {
            toolUseId: uso.id,
            origen: String(entrada.origen),
            motivo: String(entrada.motivo),
            entrada: uso.input,
            resultadosPrevios: [],
            orden: usos.map((u) => u.id),
          }
        }
        continue
      }
      deps.emitir({ tipo: 'paso', id: uso.id, herramienta: uso.name, entrada: (uso.input ?? {}) as Record<string, unknown> })
      const r = await deps.ejecutar(uso.name, uso.input, seudonimos)
      if (r.ok) deps.emitir({ tipo: 'dato', herramienta: uso.name, datos: r.datos })
      resultados.push(aResultado(uso.id, r))
    }
    e.seudonimos = seudonimos.exportar()

    if (propuesta) {
      propuesta.resultadosPrevios = resultados
      e.propuesta = propuesta
      e.estado = 'esperando_aprobacion'
      await deps.guardar(e)
      deps.emitir({ tipo: 'aprobacion', origen: propuesta.origen, motivo: propuesta.motivo })
      return e
    }

    e.mensajes.push({ role: 'user', content: enOrden(usos.map((u) => u.id), resultados) })
    await deps.guardar(e)
  }
}

/**
 * Aplica la decisión del administrador sobre la propuesta pendiente y retoma
 * el análisis. Quien llama debe haber reclamado la ejecución de forma atómica
 * (ejecuciones.ts), para que dos clics no la decidan dos veces.
 */
export async function decidir(e: Ejecucion, aprobado: boolean, deps: Dependencias): Promise<Ejecucion> {
  const p = e.propuesta
  if (!p) throw new Error('La ejecución no tiene ninguna propuesta pendiente.')
  const seudonimos = Seudonimos.desde(e.seudonimos)

  let resultado: ResultadoParam
  if (aprobado) {
    const r = await deps.ejecutar(deps.herramientaBloqueo, p.entrada, seudonimos)
    if (r.ok) deps.emitir({ tipo: 'dato', herramienta: deps.herramientaBloqueo, datos: r.datos })
    resultado = aResultado(p.toolUseId, r)
  } else {
    resultado = aResultado(p.toolUseId, {
      ok: false,
      error: 'El administrador rechazó el bloqueo. No lo vuelvas a proponer en este análisis.',
    })
  }
  deps.emitir({ tipo: 'decision', origen: p.origen, aprobado })

  e.mensajes.push({ role: 'user', content: enOrden(p.orden, [...p.resultadosPrevios, resultado]) })
  e.propuesta = null
  e.estado = 'corriendo'
  await deps.guardar(e)
  return avanzar(e, deps)
}
