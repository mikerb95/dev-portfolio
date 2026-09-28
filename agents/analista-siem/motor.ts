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
import { crearServidorSiem, HERRAMIENTA_BLOQUEO, HERRAMIENTAS_LECTURA, SERVIDOR } from './herramientas'
import { Seudonimos } from './seudonimos'

export { Seudonimos }

export type EventoAnalista =
  | { tipo: 'sesion'; id: string }
  | { tipo: 'paso'; id: string; herramienta: string; entrada: Record<string, unknown> }
  | { tipo: 'dato'; herramienta: string; datos: unknown }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'aprobacion'; origen: string; motivo: string }
  | { tipo: 'decision'; origen: string; aprobado: boolean }
  | { tipo: 'fin'; ok: boolean; motivo: string; turnos: number; segundos: number; costoUsd: number }

export type Formato = 'terminal' | 'pantalla'

const INDICACIONES_FORMATO: Record<Formato, string> = {
  terminal:
    'Responde en español, en texto plano apto para una terminal (sin tablas markdown). Estructura: un veredicto de una línea, los hallazgos ordenados por importancia con sus cifras, y las acciones recomendadas.',
  pantalla:
    'Tu respuesta se proyecta en una charla ante público que no es técnico. Responde en español, claro y sin jerga innecesaria (si usas un término técnico, explícalo en pocas palabras). Formato: la primera línea es un veredicto corto, de una frase. Luego secciones con un título en una línea que empiece por "## ", y debajo párrafos breves o listas con "- ". Sin tablas ni negritas. Máximo unas 250 palabras: es una pantalla, no un informe.',
}

function systemPrompt(formato: Formato): string {
  return `Eres el analista de seguridad del micro-SIEM de codebymike.net, un portafolio con panel privado, portal de clientes y API desplegado en Vercel. El sitio clasifica cada request hostil (categorías alineadas con OWASP), aplica rate limit, mantiene una lista de bloqueo con TTL y detecta anomalías con z-score.

Tu trabajo es leer esos datos con tus herramientas y responder al administrador con un análisis que pueda accionar.

Cómo trabajar:
- Empieza por el panorama (resumen_actividad) y baja al detalle solo donde haya algo que investigar. Mira la línea de tiempo de un origen antes de sacar conclusiones sobre él.
- Separa el ruido de fondo de internet (scanners genéricos buscando WordPress o .env, que el sitio ya absorbe) de lo que es dirigido o persistente: sondeo de autenticación, reincidentes, orígenes que cambian de técnica, picos fuera de la línea base.
- Las IPs llegan seudonimizadas (origen-01, origen-02…). Refiérete a ellas así; no intentes deducir la IP real.
- Solo afirma lo que ves en los datos. Si una herramienta no devuelve nada, dilo.
- Puedes proponer bloqueos con bloquear_origen, uno por origen y con evidencia concreta. Un humano aprueba cada uno. No propongas bloquear orígenes marcados como protegidos ni orígenes que ya están bloqueados, y no bloquees tráfico que el sitio ya está conteniendo solo porque sí: el bloqueo es para lo persistente o peligroso.

${INDICACIONES_FORMATO[formato]}`
}

// Claves del .env del sitio (credenciales de Turso, secretos de cifrado…). El
// subproceso de Claude Code no las necesita: las consultas corren en este
// proceso, dentro del servidor MCP.
function envAgente(): Record<string, string | undefined> {
  const delSitio = new Set<string>()
  if (existsSync('.env')) {
    for (const linea of readFileSync('.env', 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=/.exec(linea)
      if (m && !m[1]!.startsWith('ANTHROPIC_')) delSitio.add(m[1]!)
    }
  }
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !delSitio.has(k) && !k.startsWith('TURSO_'))
  )
}

// Directorio de trabajo vacío: con cwd en el repo, Claude Code cargaba la
// memoria del proyecto y el agente "sabía" cosas que no salían de los datos.
// Un analista que cita fuentes que no puede mostrar no sirve para una demo.
let cwdAgente: string | undefined
const directorioAgente = () => (cwdAgente ??= mkdtempSync(join(tmpdir(), 'analista-siem-')))

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
      env: envAgente(),
      abortController: abort,
      ...(c.sesion ? { resume: c.sesion } : {}),
    },
  })) {
    if (msg.type === 'system' && msg.subtype === 'init') {
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
      })
    }
  }
  return sesion
}
