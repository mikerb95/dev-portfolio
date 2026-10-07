import type Anthropic from '@anthropic-ai/sdk'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { vigiaCorridas } from '../../db/schema'
import { registrarCronRun } from '../cron-runs'
import { sendPush } from '../notify'
import { ARCHIVO_JSON, ARCHIVO_MD, MAX_MD, VIGIA_AGENT_ID, VIGIA_JOB } from './config'
import { debeAnunciar, desenlaceDe, type Desenlace, type MotivoParada } from './desenlace'
import { avisoDeInforme, leerInforme, type InformeVigia } from './informe'

// Lee una sesión del vigía en Managed Agents y deja su estado en la base.
//
// El webhook solo trae "la sesión X cambió de estado"; todo lo demás se lee de
// la API (sesión, último `session.status_idle`, archivos de salida). Así el
// resultado no depende del orden en que lleguen los avisos.

export type Pendiente = { eventId: string; nombre: string; entrada: string }

export type ResultadoProceso =
  | { ignorada: true }
  | { ignorada: false; desenlace: Desenlace; anunciado: boolean }

const BETA = ['managed-agents-2026-04-01'] as const

/** Último motivo de parada; null si la sesión nunca quedó en reposo. */
async function motivoDeParada(client: Anthropic, sessionId: string): Promise<{ motivo: MotivoParada | null; eventIds: string[] }> {
  const page = await client.beta.sessions.events.list(sessionId, { types: ['session.status_idle'], order: 'desc', limit: 1 })
  const ev = page.data[0]
  if (!ev || ev.type !== 'session.status_idle') return { motivo: null, eventIds: [] }
  const sr = ev.stop_reason
  return { motivo: sr.type, eventIds: sr.type === 'requires_action' ? sr.event_ids : [] }
}

/** Lee los archivos de salida de la sesión. Los que falten vuelven como null. */
async function leerSalidas(client: Anthropic, sessionId: string): Promise<{ json: string | null; md: string | null }> {
  const ids = new Map<string, string>()
  for await (const f of client.beta.files.list({ scope_id: sessionId, betas: [...BETA] })) {
    // Si el agente reescribió el archivo, gana el último que aparece.
    ids.set(f.filename, f.id)
  }
  const bajar = async (nombre: string) => {
    const id = ids.get(nombre)
    if (!id) return null
    const res = await client.beta.files.download(id)
    return res.ok ? await res.text() : null
  }
  return { json: await bajar(ARCHIVO_JSON), md: await bajar(ARCHIVO_MD) }
}

/** Herramientas que esperan aprobación, resumidas para el panel. */
async function leerPendientes(client: Anthropic, sessionId: string, eventIds: string[]): Promise<Pendiente[]> {
  if (eventIds.length === 0) return []
  const quiero = new Set(eventIds)
  const pendientes: Pendiente[] = []
  for await (const ev of client.beta.sessions.events.list(sessionId, { types: ['agent.tool_use', 'agent.mcp_tool_use'], order: 'desc' })) {
    if (!quiero.has(ev.id)) continue
    if (ev.type === 'agent.tool_use' || ev.type === 'agent.mcp_tool_use') {
      pendientes.push({ eventId: ev.id, nombre: ev.name, entrada: JSON.stringify(ev.input).slice(0, 1000) })
    }
    quiero.delete(ev.id)
    if (quiero.size === 0) break
  }
  return pendientes
}

export async function procesarSesion(client: Anthropic, sessionId: string, ahora = new Date()): Promise<ResultadoProceso> {
  const sesion = await client.beta.sessions.retrieve(sessionId)
  // El webhook es por workspace: llegan avisos de cualquier agente. Solo el
  // vigía se procesa aquí.
  if (sesion.agent.id !== VIGIA_AGENT_ID) return { ignorada: true }

  const { motivo, eventIds } = await motivoDeParada(client, sessionId)
  const desenlace = desenlaceDe(sesion.status, motivo)

  const [previa] = await db.select({ desenlace: vigiaCorridas.desenlace }).from(vigiaCorridas).where(eq(vigiaCorridas.sessionId, sessionId)).limit(1)
  const previo = (previa?.desenlace as Desenlace | undefined) ?? null

  let informe: InformeVigia | null = null
  let md: string | null = null
  if (desenlace === 'informe') {
    const salidas = await leerSalidas(client, sessionId)
    informe = leerInforme(salidas.json)
    md = salidas.md?.slice(0, MAX_MD) ?? null
  }
  const pendientes = desenlace === 'aprobacion' ? await leerPendientes(client, sessionId, eventIds) : []

  const costo = sesion.usage.list_cost ? Number(sesion.usage.list_cost.amount) : null
  const activo = sesion.usage.active_seconds != null ? Math.round(sesion.usage.active_seconds) : null
  const fila = {
    desenlace,
    estado: informe?.estado ?? null,
    resumen: informe?.resumen ?? null,
    informe: informe ? JSON.stringify(informe) : null,
    informeMd: md,
    pendientes: pendientes.length ? JSON.stringify(pendientes) : null,
    costoCentavos: Number.isFinite(costo) ? costo : null,
    activoSegundos: activo,
    actualizada: ahora,
  }
  // Un informe ya guardado no se pisa con un aviso posterior sin informe (por
  // ejemplo, el `terminated` que llega después del `idle`).
  const set = previo === 'informe' && desenlace !== 'informe' ? { actualizada: ahora, costoCentavos: fila.costoCentavos } : fila
  await db
    .insert(vigiaCorridas)
    .values({ sessionId, creada: new Date(sesion.created_at), ...fila })
    .onConflictDoUpdate({ target: vigiaCorridas.sessionId, set })

  const anunciado = debeAnunciar(previo, desenlace)
  if (anunciado) await anunciar(desenlace, informe, activo, pendientes)
  return { ignorada: false, desenlace, anunciado }
}

async function anunciar(desenlace: Desenlace, informe: InformeVigia | null, activo: number | null, pendientes: Pendiente[]) {
  const click = 'https://codebymike.net/admin/lab/security#vigia'
  const ms = (activo ?? 0) * 1000
  // `detail` de cron_runs lo lee una página pública: nunca lleva hallazgos.
  if (desenlace === 'informe') {
    await registrarCronRun(VIGIA_JOB, informe !== null, ms, informe ? 'informe entregado' : 'informe con forma inválida')
    const aviso = informe ? avisoDeInforme(informe) : { titulo: 'Vigía: informe ilegible', cuerpo: 'Terminó, pero el informe.json no tiene la forma acordada. El .md está en el panel.' }
    await sendPush(aviso.titulo, aviso.cuerpo, { tags: 'mag', click, priority: informe?.estado === 'rojo' ? 4 : 3 })
  } else if (desenlace === 'tope') {
    await registrarCronRun(VIGIA_JOB, false, ms, 'tope de gasto')
    await sendPush('Vigía: llegó al tope de gasto', 'La corrida quedó pausada sin terminar el informe.', { tags: 'warning', click })
  } else if (desenlace === 'error') {
    await registrarCronRun(VIGIA_JOB, false, ms, 'sesión sin turno completo')
    await sendPush('Vigía: la corrida falló', 'La sesión terminó sin informe. Revísala en la Console.', { tags: 'warning', click, priority: 4 })
  } else if (desenlace === 'aprobacion') {
    const que = pendientes.map((p) => p.nombre).join(', ') || 'una herramienta'
    await sendPush('Vigía: necesita tu aprobación', `Quiere usar ${que}. Aprueba o rechaza desde el panel.`, { tags: 'raising_hand', click, priority: 4 })
  }
}

export type CorridaPanel = typeof vigiaCorridas.$inferSelect

/** Últimas corridas para el panel. Lista vacía si la base no responde. */
export async function ultimasCorridasVigia(n = 5): Promise<CorridaPanel[]> {
  try {
    return await db.select().from(vigiaCorridas).orderBy(desc(vigiaCorridas.creada)).limit(n)
  } catch {
    return []
  }
}
