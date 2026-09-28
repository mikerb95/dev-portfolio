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
// La versión para proyectar en una charla es /admin/analista (mismo motor).

import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

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

try {
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

// Las lecturas van en allowedTools a propósito (no hay nada que aprobar en
// una consulta), así que el aviso de que canUseTool no las verá es esperado.
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if ((w as { code?: string }).code !== 'CLAUDE_SDK_CAN_USE_TOOL_SHADOWED') console.warn(w)
})

const { consultar, Seudonimos } = await import('./motor')

const seudonimos = new Seudonimos(flag('--ips-reales'))
const rl = createInterface({ input: stdin, output: stdout })

// Con la entrada cerrada (EOF, o un pipe que se acabó) no hay a quién
// preguntar: se niega el bloqueo y se termina la sesión en vez de reventar.
let entradaCerrada = false
rl.on('close', () => (entradaCerrada = true))

const gris = (s: string) => `\x1b[2m${s}\x1b[0m`
const ambar = (s: string) => `\x1b[33m${s}\x1b[0m`

const turno = (prompt: string, sesion?: string) =>
  consultar({
    pregunta: prompt,
    sesion,
    seudonimos,
    formato: 'terminal',
    emitir: (e) => {
      if (e.tipo === 'texto') console.log(`\n${e.texto}`)
      if (e.tipo === 'paso') console.log(gris(`  → ${e.herramienta} ${JSON.stringify(e.entrada)}`))
      if (e.tipo === 'aprobacion') {
        console.log(ambar(`\n  ¿Bloquear ${e.origen}?`))
        console.log(ambar(`  Motivo: ${e.motivo}`))
      }
      if (e.tipo === 'fin') {
        console.log(gris(`\n  ${e.turnos} turnos · ${e.segundos} s · US$${e.costoUsd.toFixed(3)}`))
        if (!e.ok) console.log(ambar(`  El agente terminó con: ${e.motivo}`))
      }
    },
    aprobar: async () => {
      if (entradaCerrada) return false
      const r = (await rl.question(ambar('  Aprobar [s/N]: ')).catch(() => '')).trim().toLowerCase()
      return r === 's' || r === 'si' || r === 'sí'
    },
  })

console.log(gris(`Analista del micro-SIEM · base ${base}${flag('--ips-reales') ? ' · IPs en claro' : ''}`))
console.log(`\n> ${pregunta}`)

let sesion = await turno(pregunta)
while (!entradaCerrada) {
  const siguiente = (await rl.question('\n> ').catch(() => '')).trim()
  if (!siguiente || siguiente === 'salir') break
  sesion = await turno(siguiente, sesion)
}
rl.close()
