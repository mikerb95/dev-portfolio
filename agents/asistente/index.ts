// Asistente del panel: agente de terminal hecho con la Claude Agent SDK.
// Fase 2 de docs/plan-asistente.md: SOLO CONSULTA.
//
//   npm run asistente                          # conversación libre
//   npm run asistente -- "¿quién me debe?"
//   npm run asistente -- --base demo           # contra la base de la demo
//
// Ojo: sin --base demo lee el .env, que apunta a PRODUCCIÓN. En esta fase no
// escribe nada, pero las consultas cuentan en la cuota de lecturas de Turso.
//
// Corre en la máquina del administrador y no en Vercel: la SDK levanta el
// binario de Claude Code como subproceso, y eso no cabe en una función. La
// pantalla del panel (fase 7) usará el motor de la API.

import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import type { EventoAsistente } from './motor'

const args = process.argv.slice(2)
const valor = (nombre: string) => {
  const i = args.indexOf(nombre)
  return i >= 0 ? args[i + 1] : undefined
}
const base = valor('--base') === 'demo' ? 'demo' : 'real'
const primera = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--base').join(' ')

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

// Las consultas van en allowedTools a propósito (no hay nada que aprobar), así
// que el aviso de que canUseTool no las verá es esperado.
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if ((w as { code?: string }).code !== 'CLAUDE_SDK_CAN_USE_TOOL_SHADOWED') console.warn(w)
})

const { consultar, nuevaSesion } = await import('./motor')

const gris = (s: string) => `\x1b[2m${s}\x1b[0m`
const ambar = (s: string) => `\x1b[33m${s}\x1b[0m`

const rl = createInterface({ input: stdin, output: stdout })
let entradaCerrada = false
rl.on('close', () => (entradaCerrada = true))

const sesion = nuevaSesion()

function pintar(e: EventoAsistente) {
  if (e.tipo === 'facturacion') console.log(gris(`  Pagado con: ${e.fuente}`))
  if (e.tipo === 'paso') console.log(gris(`  ${e.deAnalista ? '  ↳ analista:' : '→'} ${e.herramienta} ${JSON.stringify(e.entrada)}`))
  if (e.tipo === 'texto') console.log(`\n${e.texto}`)
  if (e.tipo === 'cifrasDudosas')
    console.log(ambar(`\n  Ojo: ${e.cifras.join(', ')} no sale de ninguna consulta de esta conversación. Compruébalo en el panel.`))
  if (e.tipo === 'fin') {
    const hoy = e.restanteHoyUsd === null ? 'no se pudo leer el gasto de hoy' : `quedan US$${Math.max(0, e.restanteHoyUsd).toFixed(2)} hoy`
    console.log(gris(`\n  ${e.turnos} turnos · ${e.segundos} s · US$${e.costoUsd.toFixed(3)} · ${hoy}`))
    if (!e.ok) console.log(ambar(`  El asistente terminó con: ${e.motivo}`))
  }
}

async function turno(pregunta: string): Promise<boolean> {
  try {
    await consultar(pregunta, sesion, pintar)
    return true
  } catch (err) {
    // Sin API key, con otra credencial o sin presupuesto no hay respuesta: se explica y se sigue.
    console.error(ambar(`\n  ${err instanceof Error ? err.message : String(err)}`))
    return false
  }
}

console.log(gris(`Asistente del panel · solo consulta · base ${base}${base === 'real' ? ' (producción)' : ''}`))
console.log(gris('Escribe "salir" o deja la línea vacía para terminar.'))

let pregunta = primera
while (!entradaCerrada) {
  if (!pregunta) pregunta = (await rl.question('\n> ').catch(() => '')).trim()
  else console.log(`\n> ${pregunta}`)
  if (!pregunta || pregunta === 'salir') break
  const sigue = await turno(pregunta)
  pregunta = ''
  // Sin API key no tiene sentido seguir preguntando.
  if (!sigue && !sesion.id) break
}
rl.close()
