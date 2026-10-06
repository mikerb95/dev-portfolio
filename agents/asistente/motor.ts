// Motor del asistente del panel (docs/plan-asistente.md, fase 2): la Agent SDK
// con las herramientas de consulta del negocio y el analista del micro-SIEM
// como subagente. Solo lectura: no hay ninguna herramienta que escriba, y el
// bloqueo del analista se quita de la lista para todos.
//
// El aislamiento es el del analista (agents/analista-siem/motor.ts), por las
// mismas razones: sin cwd en el repo (leería la memoria del proyecto), sin
// settings ni conectores del disco, y pagando solo con la API key.
//
// Importa `src/db`, que fija la URL de la base al importarse: quien quiera
// otra base tiene que ajustar el entorno ANTES de importar este módulo.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query, type CanUseTool } from '@anthropic-ai/claude-agent-sdk'
import { serverEnv } from '../../src/lib/env'
import { entornoAislado, exigirApiKey, verificarFuente } from '../../src/lib/analista/credencial'
import { systemPrompt as promptSiem } from '../../src/lib/analista/prompt'
import { Seudonimos } from '../../src/lib/analista/seudonimos'
import { recogerCifras, revisarRespuesta } from '../../src/lib/asistente/cifras'
import { fecha } from '../../src/lib/asistente/herramientas/tipos'
import { TOPE_ASISTENTE } from '../../src/lib/asistente/presupuesto'
import { NOMBRE_ANALISTA, promptAnalista, systemPrompt } from '../../src/lib/asistente/prompt'
import { clavesDelSitio } from '../analista-siem/motor'
import { crearServidorSiem, HERRAMIENTA_BLOQUEO, HERRAMIENTAS_LECTURA as LECTURA_SIEM, SERVIDOR as SERVIDOR_SIEM } from '../analista-siem/herramientas'
import { crearServidorNegocio, HERRAMIENTAS_NEGOCIO, SERVIDOR } from './herramientas'

export const MODELO = 'claude-opus-5-5'

export type EventoAsistente =
  | { tipo: 'facturacion'; fuente: string }
  | { tipo: 'paso'; herramienta: string; entrada: Record<string, unknown>; deAnalista: boolean }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'cifrasDudosas'; cifras: string[] }
  | {
      tipo: 'fin'
      ok: boolean
      motivo: string
      turnos: number
      segundos: number
      costoUsd: number
      restanteHoyUsd: number | null
    }

export class SinPresupuesto extends Error {
  constructor(tope: number) {
    super(`Se alcanzó el tope de gasto de hoy (US$${tope}). Súbelo con ASISTENTE_TOPE_DIARIO_USD en el .env si de verdad hace falta.`)
    this.name = 'SinPresupuesto'
  }
}

let cwdAgente: string | undefined
const directorioAgente = () => (cwdAgente ??= mkdtempSync(join(tmpdir(), 'asistente-')))
let configAgente: string | undefined
const configuracionAgente = () => (configAgente ??= mkdtempSync(join(tmpdir(), 'asistente-config-')))

export type Sesion = {
  /** Id de la Agent SDK, para preguntas de seguimiento. */
  id?: string
  seudonimos: Seudonimos
  /** Cifras de dinero que devolvieron las herramientas en toda la conversación. */
  cifras: Set<number>
}

export const nuevaSesion = (): Sesion => ({ seudonimos: new Seudonimos(false), cifras: new Set() })

const nombreCorto = (n: string) => n.replace(`mcp__${SERVIDOR}__`, '').replace(`mcp__${SERVIDOR_SIEM}__`, 'siem.')

/** Corre un turno. Actualiza la sesión (id y cifras) para el siguiente. */
export async function consultar(pregunta: string, sesion: Sesion, emitir: (e: EventoAsistente) => void): Promise<void> {
  const apiKey = exigirApiKey(serverEnv('ANTHROPIC_API_KEY'))

  // Falla cerrado: si no se sabe cuánto se gastó hoy, no se gasta más.
  const restante = await TOPE_ASISTENTE.presupuestoRestante()
  if (restante <= 0) throw new SinPresupuesto(TOPE_ASISTENTE.topeDiarioUsd())

  // Todas las consultas van en allowedTools y nunca llegan aquí. Lo que llegue
  // es algo que nadie previó, y en una versión de solo lectura eso se niega.
  const canUseTool: CanUseTool = async (toolName) => ({
    behavior: 'deny',
    message: `${toolName} no está permitida: el asistente solo consulta.`,
  })

  const abort = new AbortController()
  let costo = 0

  for await (const msg of query({
    prompt: pregunta,
    options: {
      model: MODELO,
      effort: 'medium',
      systemPrompt: systemPrompt(fecha(new Date())!),
      // De las herramientas integradas, solo la de delegar en el subagente.
      tools: ['Agent'],
      agents: {
        [NOMBRE_ANALISTA]: {
          description:
            'Analista de seguridad del micro-SIEM de codebymike.net. Úsalo para cualquier pregunta sobre ataques, tráfico hostil, orígenes sospechosos, bloqueos o anomalías del sitio. Solo consulta.',
          prompt: promptAnalista(promptSiem('terminal')),
          tools: LECTURA_SIEM,
          model: MODELO,
          effort: 'medium',
          maxTurns: 15,
          omitClaudeMd: true,
        },
      },
      settingSources: [],
      strictMcpConfig: true,
      settings: { disableClaudeAiConnectors: true, autoMemoryEnabled: false },
      mcpServers: {
        [SERVIDOR]: crearServidorNegocio((_h, datos) => recogerCifras(datos, sesion.cifras)),
        [SERVIDOR_SIEM]: crearServidorSiem(sesion.seudonimos),
      },
      allowedTools: [...HERRAMIENTAS_NEGOCIO, ...LECTURA_SIEM, 'Agent'],
      // El bloqueo de orígenes es del analista en /admin/analista, con su propia
      // aprobación. Aquí desaparece de la lista para el principal y el subagente.
      disallowedTools: [HERRAMIENTA_BLOQUEO],
      permissionMode: 'default',
      canUseTool,
      maxTurns: 20,
      cwd: directorioAgente(),
      env: entornoAislado(process.env, { apiKey, configDir: configuracionAgente(), clavesDelSitio: clavesDelSitio() }),
      abortController: abort,
      ...(sesion.id ? { resume: sesion.id } : {}),
    },
  })) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      try {
        verificarFuente(msg.apiKeySource)
      } catch (err) {
        abort.abort()
        throw err
      }
      emitir({ tipo: 'facturacion', fuente: 'Créditos de Claude Platform (API key)' })
      sesion.id = msg.session_id
    }
    if (msg.type === 'assistant') {
      const deAnalista = !!msg.parent_tool_use_id
      for (const bloque of msg.message.content) {
        // El texto del subagente es para el principal, no para Mike: él lo resume.
        if (bloque.type === 'text' && bloque.text.trim() && !deAnalista) emitir({ tipo: 'texto', texto: bloque.text.trim() })
        if (bloque.type === 'tool_use')
          emitir({ tipo: 'paso', herramienta: nombreCorto(bloque.name), entrada: (bloque.input ?? {}) as Record<string, unknown>, deAnalista })
      }
    }
    if (msg.type === 'result') {
      costo = msg.total_cost_usd
      if (msg.subtype === 'success') {
        const guardia = revisarRespuesta(msg.result, sesion.cifras)
        if (!guardia.ok) emitir({ tipo: 'cifrasDudosas', cifras: guardia.inventadas.map((c) => c.texto) })
      }
      // El gasto se suma antes de avisar el fin; si la base falla aquí, se dice
      // en el evento (restante null) y la consulta ya hecha no se pierde.
      let restanteHoyUsd: number | null = null
      try {
        await TOPE_ASISTENTE.sumarGasto(costo)
        restanteHoyUsd = await TOPE_ASISTENTE.presupuestoRestante()
      } catch {
        restanteHoyUsd = null
      }
      emitir({
        tipo: 'fin',
        ok: msg.subtype === 'success',
        motivo: msg.subtype,
        turnos: msg.num_turns,
        segundos: Math.round(msg.duration_ms / 1000),
        costoUsd: costo,
        restanteHoyUsd,
      })
    }
  }
}
