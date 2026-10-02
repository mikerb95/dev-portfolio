// Analista del micro-SIEM: agente de terminal hecho con la Claude Agent SDK.
//
//   npm run analista                         # análisis de las últimas 24 h
//   npm run analista -- "¿quién sondea /admin?"
//   npm run analista -- --base demo          # contra la base de la demo
//   npm run analista -- --ips-reales         # sin seudónimos (solo local)
//
// Cada turno queda en el historial de /admin/analista (marcado "Terminal"),
// para revisarlo después desde el panel. Con --ips-reales no se guarda: el
// historial se proyecta en charlas y nunca debe mostrar una IP.
//
// Lee la base con las mismas consultas y módulos del sitio, pero corre en la
// máquina del administrador, no en Vercel: la SDK levanta el binario de
// Claude Code como subproceso, y eso no tiene sitio en una función serverless.
// La versión para proyectar en una charla es /admin/analista (mismo motor).

import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import type { EventoAnalista } from './motor'

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
const { registrarTurnoTerminal } = await import('../../src/lib/analista/ejecuciones')
const { detalleOrigen, DIAS_DETALLE } = await import('../../src/lib/analista/detalle-origen')
const guardarEnHistorial = !flag('--ips-reales')

const seudonimos = new Seudonimos(flag('--ips-reales'))
const rl = createInterface({ input: stdin, output: stdout })

// Con la entrada cerrada (EOF, o un pipe que se acabó) no hay a quién
// preguntar: se niega el bloqueo y se termina la sesión en vez de reventar.
let entradaCerrada = false
rl.on('close', () => (entradaCerrada = true))

const gris = (s: string) => `\x1b[2m${s}\x1b[0m`
const ambar = (s: string) => `\x1b[33m${s}\x1b[0m`
const hora = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// La IP real se imprime aquí y en ningún otro sitio: la traducción del alias
// ocurre en este proceso y el resultado no vuelve al agente. Fail-open: si la
// base no responde, se decide con el argumento del agente, como antes.
async function mostrarDetalle(alias: string) {
  const ip = seudonimos.ip(alias)
  if (!ip) {
    console.log(ambar(`  ${alias} no salió de los datos de esta sesión: no hay IP que mostrar.`))
    return
  }
  try {
    const d = await detalleOrigen(ip)
    const red = [d.pais, d.asn].filter(Boolean).join(' · ')
    console.log(`  IP real: ${d.ip}${red ? ` · ${red}` : ''}  ${gris('(solo en esta terminal; el agente no la ve)')}`)
    console.log(`  ${DIAS_DETALLE} días: ${d.eventos} eventos (${d.hits} hits)${d.categorias.length ? ` · ${d.categorias.join(', ')}` : ''}`)
    if (d.primeraVez && d.ultimaVez) console.log(`  Visto: ${hora.format(new Date(d.primeraVez))} → ${hora.format(new Date(d.ultimaVez))}`)
    const estado = d.bloqueadoHasta ? `bloqueado hasta ${hora.format(new Date(d.bloqueadoHasta))}` : 'sin bloqueo vigente'
    console.log(`  Bloqueos previos: ${d.bloqueosPrevios} · ${estado}`)
    if (d.protegido) console.log(ambar('  Está en la allowlist: el bloqueo se rechazará aunque lo apruebes.'))
  } catch (err) {
    console.log(ambar(`  IP real: ${ip} (no se pudo leer su detalle: ${err instanceof Error ? err.message : String(err)})`))
  }
}

async function turno(prompt: string, sesion?: string) {
  let fin: Extract<EventoAnalista, { tipo: 'fin' }> | undefined
  const decisiones: string[] = []
  const siguiente = await consultar({
    pregunta: prompt,
    sesion,
    seudonimos,
    formato: 'terminal',
    emitir: (e) => {
      if (e.tipo === 'facturacion') console.log(gris(`  Pagado con: ${e.fuente}`))
      if (e.tipo === 'texto') console.log(`\n${e.texto}`)
      if (e.tipo === 'paso') console.log(gris(`  → ${e.herramienta} ${JSON.stringify(e.entrada)}`))
      if (e.tipo === 'aprobacion') {
        console.log(ambar(`\n  ¿Bloquear ${e.origen}?`))
        console.log(ambar(`  Motivo: ${e.motivo}`))
      }
      if (e.tipo === 'decision') decisiones.push(`- ${e.origen}: ${e.aprobado ? 'aprobado' : 'rechazado'}`)
      if (e.tipo === 'fin') {
        fin = e
        console.log(gris(`\n  ${e.turnos} turnos · ${e.segundos} s · US$${e.costoUsd.toFixed(3)}`))
        if (!e.ok) console.log(ambar(`  El agente terminó con: ${e.motivo}`))
      }
    },
    aprobar: async ({ origen }) => {
      if (entradaCerrada) return false
      await mostrarDetalle(origen)
      const r = (await rl.question(ambar('  Aprobar [s/N]: ')).catch(() => '')).trim().toLowerCase()
      return r === 's' || r === 'si' || r === 'sí'
    },
  })
  if (fin && guardarEnHistorial) await guardarTurno(prompt, fin, decisiones)
  return siguiente
}

// Fail-open: si la base no responde, el análisis ya se vio en la terminal y
// no se pierde nada más que la copia en el historial.
async function guardarTurno(prompt: string, fin: Extract<EventoAnalista, { tipo: 'fin' }>, decisiones: string[]) {
  const respuesta = [fin.resultado, decisiones.length ? `Bloqueos propuestos en la terminal:\n${decisiones.join('\n')}` : null]
    .filter(Boolean)
    .join('\n\n')
  try {
    await registrarTurnoTerminal({
      id: randomUUID(),
      pregunta: prompt,
      respuesta: respuesta || null,
      error: fin.ok ? null : `El agente terminó con: ${fin.motivo}`,
      iteraciones: fin.turnos,
      uso: fin.uso,
      costoUsd: fin.costoUsd,
    })
    console.log(gris(`  Guardado en el historial de /admin/analista (base ${base})`))
  } catch (err) {
    console.log(ambar(`  No se pudo guardar en el historial: ${err instanceof Error ? err.message : String(err)}`))
  }
}

console.log(gris(`Analista del micro-SIEM · base ${base}${flag('--ips-reales') ? ' · IPs en claro' : ''}`))
console.log(`\n> ${pregunta}`)

let sesion: string | undefined
try {
  sesion = await turno(pregunta)
} catch (err) {
  // Sin API key (o con otra credencial) no hay análisis: se explica y se sale.
  console.error(ambar(`\n  ${err instanceof Error ? err.message : String(err)}`))
  rl.close()
  process.exit(1)
}
while (!entradaCerrada) {
  const siguiente = (await rl.question('\n> ').catch(() => '')).trim()
  if (!siguiente || siguiente === 'salir') break
  sesion = await turno(siguiente, sesion)
}
rl.close()
