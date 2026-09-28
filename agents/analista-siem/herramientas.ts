// Herramientas del analista del micro-SIEM, expuestas como un servidor MCP en
// proceso. Cinco son de solo lectura y una (bloquear_origen) escribe en la
// lista de bloqueo: esa nunca se aprueba sola, la confirma el administrador en
// la terminal (ver canUseTool en index.ts).
//
// Este módulo importa `src/db`, que fija la URL de la base al importarse, así
// que index.ts lo carga con import() DESPUÉS de decidir contra qué base corre.

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { and, desc, gt, inArray, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../src/db'
import { blockedIps, securityAnomalies, securityEvents } from '../../src/db/schema'
import { AUDIT_CATEGORIES } from '../../src/lib/security/audit'
import { blockIpEscalated, isAllowlisted, listActiveBlocks } from '../../src/lib/security/blocklist'
import { severityRank, type Severity } from '../../src/lib/security/classify'
import type { Seudonimos } from './seudonimos'

export const SERVIDOR = 'siem'

// Tope de la ventana. Turso factura filas escaneadas: el agente decide la
// ventana, y sin tope una pregunta vaga ("¿qué pasó este año?") barrería la
// tabla entera.
const MAX_HORAS = 168

const horas = z
  .number()
  .int()
  .min(1)
  .max(MAX_HORAS)
  .optional()
  .describe(`Ventana hacia atrás en horas (1-${MAX_HORAS}, por defecto 24)`)

const desde = (h: number | undefined) => new Date(Date.now() - (h ?? 24) * 3_600_000)

// Solo amenazas: el rastro de auditoría (acciones del panel, cobros, alumnos)
// comparte tabla pero no es ataque, y bloquearlo sería bloquear clientes.
const soloAmenazas = notInArray(securityEvents.category, AUDIT_CATEGORIES)

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
})

const error = (texto: string) => ({
  content: [{ type: 'text' as const, text: texto }],
  isError: true,
})

const lectura = { annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }

/** Severidad más alta de una lista separada por comas (group_concat). */
function peorSeveridad(lista: string | null): Severity {
  const sevs = (lista ?? '').split(',').filter(Boolean) as Severity[]
  return sevs.reduce<Severity>((peor, s) => (severityRank(s) > severityRank(peor) ? s : peor), 'low')
}

/**
 * Recibe una copia de lo que devuelve cada herramienta. La pantalla del
 * escenario la usa para pintar cifras mientras el agente trabaja; el modelo
 * sigue recibiendo exactamente lo mismo.
 */
export type Observador = (herramienta: string, datos: unknown) => void

export function crearServidorSiem(seudonimos: Seudonimos, observar?: Observador) {
  const responder = (herramienta: string, datos: unknown) => {
    try {
      observar?.(herramienta, datos)
    } catch {
      // La vista es accesoria: si falla, el agente sigue.
    }
    return json(datos)
  }

  const resumenActividad = tool(
    'resumen_actividad',
    'Panorama de la actividad hostil en la ventana: totales, orígenes únicos y desglose por categoría, severidad y acción tomada (logged, rate_limited, blocked, honeypot). Empieza por aquí.',
    { horas },
    async (args) => {
      const inicio = desde(args.horas)
      const filtro = and(gt(securityEvents.at, inicio), soloAmenazas)
      const [totales] = await db
        .select({
          eventos: sql<number>`count(*)`,
          hits: sql<number>`coalesce(sum(${securityEvents.hits}), 0)`,
          origenes: sql<number>`count(distinct ${securityEvents.ip})`,
        })
        .from(securityEvents)
        .where(filtro)
      const desglose = await db
        .select({
          categoria: securityEvents.category,
          severidad: securityEvents.severity,
          accion: securityEvents.action,
          hits: sql<number>`sum(${securityEvents.hits})`,
          origenes: sql<number>`count(distinct ${securityEvents.ip})`,
        })
        .from(securityEvents)
        .where(filtro)
        .groupBy(securityEvents.category, securityEvents.severity, securityEvents.action)
        .orderBy(desc(sql`sum(${securityEvents.hits})`))
      return responder('resumen_actividad', { desde: inicio.toISOString(), ...totales, desglose })
    },
    lectura
  )

  const topOrigenes = tool(
    'top_origenes',
    'Orígenes (IPs seudonimizadas) con más actividad hostil en la ventana: volumen, categorías, reglas que dispararon, país, primera y última vez visto, peor severidad y si ya está bloqueado.',
    {
      horas,
      limite: z.number().int().min(1).max(25).optional().describe('Cuántos orígenes devolver (1-25, por defecto 10)'),
    },
    async (args) => {
      const inicio = desde(args.horas)
      const filas = await db
        .select({
          ip: securityEvents.ip,
          hits: sql<number>`sum(${securityEvents.hits})`,
          eventos: sql<number>`count(*)`,
          categorias: sql<string>`group_concat(distinct ${securityEvents.category})`,
          reglas: sql<string>`group_concat(distinct ${securityEvents.ruleId})`,
          severidades: sql<string>`group_concat(distinct ${securityEvents.severity})`,
          acciones: sql<string>`group_concat(distinct ${securityEvents.action})`,
          pais: sql<string | null>`max(${securityEvents.country})`,
          asn: sql<string | null>`max(${securityEvents.asn})`,
          primeraVez: sql<number>`min(${securityEvents.at})`,
          ultimaVez: sql<number>`max(${securityEvents.at})`,
        })
        .from(securityEvents)
        .where(and(gt(securityEvents.at, inicio), soloAmenazas, sql`${securityEvents.ip} is not null`))
        .groupBy(securityEvents.ip)
        .orderBy(desc(sql`sum(${securityEvents.hits})`))
        .limit(args.limite ?? 10)

      const ips = filas.map((f) => f.ip).filter((ip): ip is string => !!ip)
      const vigentes = ips.length
        ? await db
            .select({ ip: blockedIps.ip, expira: blockedIps.expiresAt })
            .from(blockedIps)
            .where(and(inArray(blockedIps.ip, ips), gt(blockedIps.expiresAt, new Date())))
        : []
      const bloqueo = new Map(vigentes.map((b) => [b.ip, b.expira]))

      return responder(
        'top_origenes',
        filas.map(({ ip, severidades, primeraVez, ultimaVez, ...resto }) => ({
          origen: seudonimos.alias(ip),
          ...resto,
          peorSeveridad: peorSeveridad(severidades),
          primeraVez: new Date(primeraVez * 1000).toISOString(),
          ultimaVez: new Date(ultimaVez * 1000).toISOString(),
          bloqueadoHasta: bloqueo.get(ip!)?.toISOString() ?? null,
          protegido: isAllowlisted(ip),
        }))
      )
    },
    lectura
  )

  const eventosDeOrigen = tool(
    'eventos_de_origen',
    'Línea de tiempo de un origen concreto: cada request hostil con ruta, método, user-agent, categoría, regla y respuesta. Úsala para confirmar la intención de un origen antes de proponer bloquearlo.',
    {
      origen: z.string().describe('Alias del origen tal como lo devolvió otra herramienta (p. ej. origen-03)'),
      horas,
      limite: z.number().int().min(1).max(100).optional().describe('Máximo de eventos (1-100, por defecto 40)'),
    },
    async (args) => {
      const ip = seudonimos.ip(args.origen)
      if (!ip) return error(`"${args.origen}" no es un origen visto en esta sesión. Consulta top_origenes primero.`)
      const eventos = await db
        .select({
          at: securityEvents.at,
          metodo: securityEvents.method,
          ruta: securityEvents.path,
          query: securityEvents.query,
          userAgent: securityEvents.userAgent,
          categoria: securityEvents.category,
          severidad: securityEvents.severity,
          accion: securityEvents.action,
          status: securityEvents.statusCode,
          regla: securityEvents.ruleId,
          hits: securityEvents.hits,
        })
        .from(securityEvents)
        .where(and(gt(securityEvents.at, desde(args.horas)), sql`${securityEvents.ip} = ${ip}`))
        .orderBy(desc(securityEvents.at))
        .limit(args.limite ?? 40)
      return responder('eventos_de_origen', { origen: args.origen, protegido: isAllowlisted(ip), eventos })
    },
    lectura
  )

  const anomalias = tool(
    'anomalias',
    'Anomalías que ya detectó el micro-SIEM (z-score sobre una línea base de 30 días): picos, patrones nuevos, anomalías geográficas, sondeo de autenticación y ráfagas de errores.',
    { horas },
    async (args) => {
      const filas = await db
        .select({
          at: securityAnomalies.at,
          tipo: securityAnomalies.kind,
          zScore: securityAnomalies.zScore,
          lineaBase: securityAnomalies.baseline,
          observado: securityAnomalies.observed,
          detalle: securityAnomalies.detail,
          reconocida: securityAnomalies.acknowledged,
        })
        .from(securityAnomalies)
        .where(gt(securityAnomalies.at, desde(args.horas)))
        .orderBy(desc(securityAnomalies.at))
        .limit(50)
      return responder('anomalias', filas)
    },
    lectura
  )

  const bloqueosVigentes = tool(
    'bloqueos_vigentes',
    'Orígenes bloqueados ahora mismo, con motivo, reincidencias, fecha de expiración y si el bloqueo fue automático o manual.',
    {},
    async () => {
      const filas = await listActiveBlocks()
      return responder(
        'bloqueos_vigentes',
        filas.map((b) => ({
          origen: seudonimos.alias(b.ip),
          motivo: b.reason,
          regla: b.ruleId,
          reincidencias: b.hits,
          desde: b.createdAt.toISOString(),
          hasta: b.expiresAt.toISOString(),
          fuente: b.source,
        }))
      )
    },
    lectura
  )

  const bloquearOrigen = tool(
    'bloquear_origen',
    'Propone bloquear un origen. El administrador humano aprueba o rechaza cada llamada; si la rechaza, no insistas. El TTL escala solo por reincidencia (1 h, 24 h, 7 d): nunca hay bloqueos permanentes. Justifica el motivo con evidencia concreta de los datos.',
    {
      origen: z.string().describe('Alias del origen (p. ej. origen-03)'),
      motivo: z.string().min(10).max(200).describe('Motivo breve y verificable, basado en los eventos observados'),
    },
    async (args) => {
      const ip = seudonimos.ip(args.origen)
      if (!ip) return error(`"${args.origen}" no es un origen visto en esta sesión.`)
      if (isAllowlisted(ip)) return error(`${args.origen} está en la allowlist y nunca se bloquea.`)
      const ok = await blockIpEscalated({ ip, reason: args.motivo, ruleId: 'analista.propuesta', source: 'manual' })
      if (!ok) return error(`No se pudo bloquear ${args.origen}.`)
      // Rastro de auditoría. Se inserta directo y no con recordSecurityEvent
      // porque events.ts lee import.meta.env al importarse, y fuera de Vite
      // (este script corre con tsx) eso no existe.
      await db.insert(securityEvents).values({
        at: new Date(),
        method: 'CLI',
        path: '/agente/analista-siem',
        category: 'admin_action',
        severity: 'low',
        action: 'logged',
        ruleId: 'blocklist.manual_block',
        hits: 1,
      })
      const [fila] = await db
        .select({ hasta: blockedIps.expiresAt, reincidencias: blockedIps.hits })
        .from(blockedIps)
        .where(sql`${blockedIps.ip} = ${ip}`)
      return responder('bloquear_origen', { origen: args.origen, bloqueado: true, hasta: fila?.hasta.toISOString(), reincidencias: fila?.reincidencias })
    },
    { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }
  )

  return createSdkMcpServer({
    name: SERVIDOR,
    version: '1.0.0',
    // Son seis herramientas: cargarlas de entrada sale más barato que una
    // búsqueda de herramientas en cada sesión.
    alwaysLoad: true,
    tools: [resumenActividad, topOrigenes, eventosDeOrigen, anomalias, bloqueosVigentes, bloquearOrigen],
  })
}

export const HERRAMIENTAS_LECTURA = [
  'resumen_actividad',
  'top_origenes',
  'eventos_de_origen',
  'anomalias',
  'bloqueos_vigentes',
].map((h) => `mcp__${SERVIDOR}__${h}`)

export const HERRAMIENTA_BLOQUEO = `mcp__${SERVIDOR}__bloquear_origen`
