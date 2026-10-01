// Motor del analista del micro-SIEM: lo comparten la terminal (index.ts) y la
// pantalla del escenario (/admin/analista). Cada uno pinta a su manera; aquí
// solo vive lo que no puede divergir entre los dos: el prompt, el aislamiento
// del agente y la regla de que un bloqueo siempre lo aprueba un humano.
//
// Importa `src/db`, que fija la URL de la base al importarse: quien quiera
// otra base tiene que ajustar el entorno ANTES de importar este módulo.

import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query, type CanUseTool } from '@anthropic-ai/claude-agent-sdk'
import { serverEnv } from '../../src/lib/env'
import { entornoAislado, exigirApiKey, verificarFuente } from '../../src/lib/analista/credencial'
import { systemPrompt, type Formato } from '../../src/lib/analista/prompt'
import { Seudonimos } from '../../src/lib/analista/seudonimos'
import { crearServidorSiem, HERRAMIENTA_BLOQUEO, HERRAMIENTAS_LECTURA, SERVIDOR } from './herramientas'

export { Seudonimos }

export type EventoAnalista =
  | { tipo: 'sesion'; id: string }
  | { tipo: 'facturacion'; fuente: string }
  | { tipo: 'paso'; id: string; herramienta: string; entrada: Record<string, unknown> }
  | { tipo: 'dato'; herramienta: string; datos: unknown }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'aprobacion'; origen: string; motivo: string }
  | { tipo: 'decision'; origen: string; aprobado: boolean }
  | {
      tipo: 'fin'
      ok: boolean
      motivo: string
      turnos: number
      segundos: number
      costoUsd: number
      /** Respuesta final del agente (solo si terminó bien). */
      resultado: string | null
      uso: { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }
    }

// Claves de los .env del sitio (credenciales de Turso, secretos de cifrado…).
// El subproceso de Claude Code no las necesita: las consultas corren en este
// proceso, dentro del servidor MCP.
function clavesDelSitio(): Set<string> {
  const claves = new Set<string>()
  for (const archivo of ['.env', '.env.local', '.env.development.local']) {
    if (!existsSync(archivo)) continue
    for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=/.exec(linea)
      if (m) claves.add(m[1]!)
    }
  }
  return claves
}

// Directorio de trabajo vacío: con cwd en el repo, Claude Code cargaba la
// memoria del proyecto y el agente "sabía" cosas que no salían de los datos.
// Un analista que cita fuentes que no puede mostrar no sirve para una demo.
let cwdAgente: string | undefined
const directorioAgente = () => (cwdAgente ??= mkdtempSync(join(tmpdir(), 'analista-siem-')))

// Configuración de Claude Code propia y vacía: ahí no existe el login de
// claude.ai de esta máquina, así que el agente no tiene cómo pagar con él.
let configAgente: string | undefined
const configuracionAgente = () => (configAgente ??= mkdtempSync(join(tmpdir(), 'analista-siem-config-')))

export type Consulta = {
  pregunta: string
  /** Sesión anterior, para preguntas de seguimiento. */
  sesion?: string
  seudonimos: Seudonimos
  formato: Formato
  emitir: (evento: EventoAnalista) => void
  /** Decide un bloqueo propuesto. Si no hay a quién preguntar, debe resolver false. */
  aprobar: (propuesta: { origen: string; motivo: string }) => Promise<boolean>
  signal?: AbortSignal
}

/** Corre un turno del agente. Devuelve el id de sesión para seguir la conversación. */
export async function consultar(c: Consulta): Promise<string | undefined> {
  // Antes que nada: sin API key no se arranca (ver credencial.ts).
  const apiKey = exigirApiKey(serverEnv('ANTHROPIC_API_KEY'))
  let sesion = c.sesion

  // Las lecturas van en allowedTools y nunca llegan aquí. Lo que llega es el
  // bloqueo (o cualquier cosa inesperada): se pregunta al humano, y lo
  // desconocido se niega por defecto.
  const canUseTool: CanUseTool = async (toolName, input) => {
    if (toolName !== HERRAMIENTA_BLOQUEO) {
      return { behavior: 'deny', message: `Herramienta no permitida: ${toolName}` }
    }
    const propuesta = { origen: String(input.origen ?? ''), motivo: String(input.motivo ?? '') }
    c.emitir({ tipo: 'aprobacion', ...propuesta })
    const aprobado = await c.aprobar(propuesta).catch(() => false)
    c.emitir({ tipo: 'decision', origen: propuesta.origen, aprobado })
    if (aprobado) return { behavior: 'allow', updatedInput: input }
    return { behavior: 'deny', message: 'El administrador rechazó el bloqueo. No lo vuelvas a proponer en esta sesión.' }
  }

  const abort = new AbortController()
  c.signal?.addEventListener('abort', () => abort.abort(), { once: true })

  for await (const msg of query({
    prompt: c.pregunta,
    options: {
      model: 'claude-opus-5-5',
      effort: 'high',
      systemPrompt: systemPrompt(c.formato),
      // Sin herramientas integradas (ni Bash, ni archivos, ni web): el agente
      // solo ve el micro-SIEM. Y sin settings del disco, para que el CLAUDE.md
      // del repo o la configuración personal no cambien su comportamiento.
      tools: [],
      settingSources: [],
      // Ni los conectores de la cuenta de claude.ai ni otros MCP del disco:
      // el único servidor que ve es el del micro-SIEM.
      strictMcpConfig: true,
      settings: { disableClaudeAiConnectors: true, autoMemoryEnabled: false },
      mcpServers: { [SERVIDOR]: crearServidorSiem(c.seudonimos, (herramienta, datos) => c.emitir({ tipo: 'dato', herramienta, datos })) },
      allowedTools: HERRAMIENTAS_LECTURA,
      permissionMode: 'default',
      canUseTool,
      maxTurns: 30,
      cwd: directorioAgente(),
      env: entornoAislado(process.env, { apiKey, configDir: configuracionAgente(), clavesDelSitio: clavesDelSitio() }),
      abortController: abort,
      ...(c.sesion ? { resume: c.sesion } : {}),
    },
  })) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      try {
        verificarFuente(msg.apiKeySource)
      } catch (err) {
        abort.abort()
        throw err
      }
      c.emitir({ tipo: 'facturacion', fuente: 'Créditos de Claude Platform (API key)' })
      sesion = msg.session_id
      c.emitir({ tipo: 'sesion', id: msg.session_id })
    }
    if (msg.type === 'assistant') {
      for (const bloque of msg.message.content) {
        if (bloque.type === 'text' && bloque.text.trim()) c.emitir({ tipo: 'texto', texto: bloque.text.trim() })
        if (bloque.type === 'tool_use') {
          c.emitir({
            tipo: 'paso',
            id: bloque.id,
            herramienta: bloque.name.replace(`mcp__${SERVIDOR}__`, ''),
            entrada: (bloque.input ?? {}) as Record<string, unknown>,
          })
        }
      }
    }
    if (msg.type === 'result') {
      c.emitir({
        tipo: 'fin',
        ok: msg.subtype === 'success',
        motivo: msg.subtype,
        turnos: msg.num_turns,
        segundos: Math.round(msg.duration_ms / 1000),
        costoUsd: msg.total_cost_usd,
        resultado: msg.subtype === 'success' ? msg.result : null,
        uso: {
          entrada: msg.usage.input_tokens ?? 0,
          salida: msg.usage.output_tokens ?? 0,
          cacheLectura: msg.usage.cache_read_input_tokens ?? 0,
          cacheEscritura: msg.usage.cache_creation_input_tokens ?? 0,
        },
      })
    }
  }
  return sesion
}
