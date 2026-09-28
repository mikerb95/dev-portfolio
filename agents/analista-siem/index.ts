// Analista del micro-SIEM: agente de terminal hecho con la Claude Agent SDK.
//
//   npm run analista                         # análisis de las últimas 24 h
//   npm run analista -- "¿quién sondea /admin?"
//   npm run analista -- --base demo          # contra la base de la demo
//   npm run analista -- --ips-reales         # sin seudónimos (solo local)
//
// Lee la base con las mismas consultas y módulos del sitio, pero corre en la
// máquina del administrador, no en Vercel: la SDK levanta el binario de
// Claude Code como subproceso, y eso no tiene sitio en una función serverless.

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { query, type CanUseTool } from '@anthropic-ai/claude-agent-sdk'
import { Seudonimos } from './seudonimos'

const args = process.argv.slice(2)
const flag = (nombre: string) => args.includes(nombre)
const valor = (nombre: string) => {
  const i = args.indexOf(nombre)
  return i >= 0 ? args[i + 1] : undefined
}
const base = valor('--base') === 'demo' ? 'demo' : 'real'
const pregunta =
  args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--base').join(' ') ||
  'Analiza la actividad hostil de las últimas 24 horas y dime qué merece mi atención.'

// Claves que vienen del .env del sitio (credenciales de Turso, secretos de
// cifrado…). Se anotan antes de cargarlo para no pasárselas luego al
// subproceso de Claude Code, que no las necesita.
const clavesDelSitio = new Set<string>()
try {
  for (const linea of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(linea)
    if (m && !m[1]!.startsWith('ANTHROPIC_')) clavesDelSitio.add(m[1]!)
  }
  process.loadEnvFile('.env')
} catch {
  // Sin .env: las variables pueden venir del entorno.
}

if (base === 'demo') {
  if (!process.env.TURSO_DEMO_URL) {
    console.error('Falta TURSO_DEMO_URL para usar --base demo.')
    process.exit(1)
  }
  // src/db lee la URL al importarse: hay que cambiarla antes del import().
  process.env.TURSO_DATABASE_URL = process.env.TURSO_DEMO_URL
  process.env.TURSO_AUTH_TOKEN = process.env.TURSO_DEMO_AUTH_TOKEN
}

const { crearServidorSiem, SERVIDOR, HERRAMIENTAS_LECTURA, HERRAMIENTA_BLOQUEO } = await import('./herramientas')

const seudonimos = new Seudonimos(flag('--ips-reales'))
const rl = createInterface({ input: stdin, output: stdout })

// Las lecturas van en allowedTools a propósito (no hay nada que aprobar en
// una consulta), así que el aviso de que canUseTool no las verá es esperado.
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if ((w as { code?: string }).code !== 'CLAUDE_SDK_CAN_USE_TOOL_SHADOWED') console.warn(w)
})

// Directorio de trabajo vacío: con cwd en el repo, Claude Code cargaba la
// memoria del proyecto y el agente "sabía" cosas que no salían de los datos.
// Un analista que cita fuentes que no puede mostrar no sirve para una demo.
const cwdAgente = mkdtempSync(join(tmpdir(), 'analista-siem-'))

const gris = (s: string) => `\x1b[2m${s}\x1b[0m`
const ambar = (s: string) => `\x1b[33m${s}\x1b[0m`

const SYSTEM_PROMPT = `Eres el analista de seguridad del micro-SIEM de codebymike.net, un portafolio con panel privado, portal de clientes y API desplegado en Vercel. El sitio clasifica cada request hostil (categorías alineadas con OWASP), aplica rate limit, mantiene una lista de bloqueo con TTL y detecta anomalías con z-score.

Tu trabajo es leer esos datos con tus herramientas y responder al administrador con un análisis que pueda accionar.

Cómo trabajar:
- Empieza por el panorama (resumen_actividad) y baja al detalle solo donde haya algo que investigar. Mira la línea de tiempo de un origen antes de sacar conclusiones sobre él.
- Separa el ruido de fondo de internet (scanners genéricos buscando WordPress o .env, que el sitio ya absorbe) de lo que es dirigido o persistente: sondeo de autenticación, reincidentes, orígenes que cambian de técnica, picos fuera de la línea base.
- Las IPs llegan seudonimizadas (origen-01, origen-02…). Refiérete a ellas así; no intentes deducir la IP real.
- Solo afirma lo que ves en los datos. Si una herramienta no devuelve nada, dilo.
- Puedes proponer bloqueos con bloquear_origen, uno por origen y con evidencia concreta. Un humano aprueba cada uno. No propongas bloquear orígenes marcados como protegidos ni orígenes que ya están bloqueados, y no bloquees tráfico que el sitio ya está conteniendo solo porque sí: el bloqueo es para lo persistente o peligroso.

Responde en español, en texto plano apto para una terminal (sin tablas markdown). Estructura: un veredicto de una línea, los hallazgos ordenados por importancia con sus cifras, y las acciones recomendadas.`

// Las herramientas de lectura van en allowedTools y nunca llegan aquí. Lo que
// llega es el bloqueo (o cualquier cosa inesperada): se pregunta al humano, y
// lo desconocido se niega por defecto.
const canUseTool: CanUseTool = async (toolName, input) => {
  if (toolName !== HERRAMIENTA_BLOQUEO) {
    return { behavior: 'deny', message: `Herramienta no permitida: ${toolName}` }
  }
  const { origen, motivo } = input as { origen: string; motivo: string }
  console.log(ambar(`\n  ¿Bloquear ${origen}?`))
  console.log(ambar(`  Motivo: ${motivo}`))
  const respuesta = (await rl.question(ambar('  Aprobar [s/N]: ')).catch(() => '')).trim().toLowerCase()
  if (respuesta === 's' || respuesta === 'si' || respuesta === 'sí') return { behavior: 'allow', updatedInput: input }
  return { behavior: 'deny', message: 'El administrador rechazó el bloqueo. No lo vuelvas a proponer en esta sesión.' }
}

// El subproceso de Claude Code no necesita las credenciales del sitio: las
// consultas corren en este proceso, dentro del servidor MCP.
const envAgente = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !clavesDelSitio.has(k) && !k.startsWith('TURSO_'))
)

async function turno(prompt: string, sesion?: string): Promise<string | undefined> {
  let sesionId = sesion
  for await (const msg of query({
    prompt,
    options: {
      model: 'claude-opus-5-5',
      effort: 'high',
      systemPrompt: SYSTEM_PROMPT,
      // Sin herramientas integradas (ni Bash, ni archivos, ni web): el agente
      // solo ve el micro-SIEM. Y sin settings del disco, para que el CLAUDE.md
      // del repo o la configuración personal no cambien su comportamiento.
      tools: [],
      settingSources: [],
      mcpServers: { [SERVIDOR]: crearServidorSiem(seudonimos) },
      allowedTools: HERRAMIENTAS_LECTURA,
      permissionMode: 'default',
      canUseTool,
      maxTurns: 30,
      cwd: cwdAgente,
      env: envAgente,
      ...(sesion ? { resume: sesion } : {}),
    },
  })) {
    if (msg.type === 'system' && msg.subtype === 'init') sesionId = msg.session_id
    if (msg.type === 'assistant') {
      for (const bloque of msg.message.content) {
        if (bloque.type === 'text' && bloque.text.trim()) console.log(`\n${bloque.text.trim()}`)
        if (bloque.type === 'tool_use') {
          const nombre = bloque.name.replace(`mcp__${SERVIDOR}__`, '')
          console.log(gris(`  → ${nombre} ${JSON.stringify(bloque.input)}`))
        }
      }
    }
    if (msg.type === 'result') {
      const seg = (msg.duration_ms / 1000).toFixed(0)
      console.log(gris(`\n  ${msg.num_turns} turnos · ${seg} s · US$${msg.total_cost_usd.toFixed(3)}`))
      if (msg.subtype !== 'success') console.log(ambar(`  El agente terminó con: ${msg.subtype}`))
    }
  }
  return sesionId
}

console.log(gris(`Analista del micro-SIEM · base ${base}${flag('--ips-reales') ? ' · IPs en claro' : ''}`))
console.log(`\n> ${pregunta}`)

// Con la entrada cerrada (EOF, o un pipe que se acabó) no hay a quién
// preguntar: se termina la sesión en vez de reventar.
let entradaCerrada = false
rl.on('close', () => (entradaCerrada = true))

let sesion = await turno(pregunta)
while (!entradaCerrada) {
  const siguiente = (await rl.question('\n> ').catch(() => '')).trim()
  if (!siguiente || siguiente === 'salir') break
  sesion = await turno(siguiente, sesion)
}
rl.close()
