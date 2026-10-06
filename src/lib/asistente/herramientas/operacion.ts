// Herramienta de lectura de la operación: páginas vigiladas, caídas y crons.
//
// El historial sale de `monitor_daily` y nunca de `monitor_checks`: Turso
// factura filas escaneadas, y una pregunta vaga ("¿cómo ha ido el mes?") sobre
// los sondeos crudos barre decenas de miles de filas (pasó en jul y ago 2026).
// Los crons reutilizan el mismo detector de silencio que avisa por ntfy, para
// que el asistente y la alerta no puedan opinar distinto.
//
// Importa `src/db`: solo servidor.

import { and, desc, eq, gt, gte, or, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { cronRuns, monitorDaily, monitorIncidents, monitors } from '../../../db/schema'
import { CRONS } from '../../../data/automatizaciones'
import { ultimasFueraDeBitacora } from '../../cron-largos'
import { ultimasCorridas } from '../../cron-runs'
import { CADENCIA_MAX_BITACORA_MIN, jobsEnSilencio, ventanaMin, vigiladosUnicos } from '../../cron-silencio'
import { dayKeyUTC, mergeHists, parseHist, quantileFromHist } from '../../monitor-rollup'
import { fecha, ok, textoSeguro, type Herramienta } from './tipos'

const VIGILADOS = CRONS.map((c) => ({ job: c.job, cadaMin: c.cadaMin, origen: c.origen }))

const fechaHora = (d: Date | null | undefined) =>
  d ? d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : null

const paginasTool: Herramienta = {
  nombre: 'paginas',
  descripcion:
    'Estado de las páginas vigiladas (último sondeo, disponibilidad y latencia p95 de los últimos días, vencimiento del certificado), caídas en la ventana y estado de los crons: los que fallaron y los que llevan callados más de lo tolerado.',
  esquema: z.object({
    dias: z.number().int().min(1).max(30).optional().describe('Días hacia atrás para disponibilidad y caídas (1-30, por defecto 7)'),
  }),
  async ejecutar(args: { dias?: number }) {
    const ahora = new Date()
    const dias = args.dias ?? 7
    const desde = new Date(ahora.getTime() - dias * 86_400_000)
    const ventanaCron = new Date(ahora.getTime() - ventanaMin(VIGILADOS) * 60_000)
    const desdeFallos = new Date(ahora.getTime() - 48 * 3_600_000)

    const [lista, diarios, caidas, ultimas, fallos] = await Promise.all([
      db
        .select({
          id: monitors.id,
          nombre: monitors.name,
          estado: monitors.lastStatus,
          ultimoSondeo: monitors.lastCheckedAt,
          ms: monitors.lastResponseMs,
          pausado: monitors.paused,
          certificadoVence: monitors.sslExpiresAt,
        })
        .from(monitors)
        .where(eq(monitors.active, true)),
      db
        .select({ monitor: monitorDaily.monitorId, total: monitorDaily.total, ok: monitorDaily.ok, hist: monitorDaily.latencyHist })
        .from(monitorDaily)
        .where(gte(monitorDaily.day, dayKeyUTC(desde.getTime()))),
      db
        .select({
          monitor: monitors.name,
          inicio: monitorIncidents.startedAt,
          fin: monitorIncidents.resolvedAt,
          segundos: monitorIncidents.durationSec,
          causa: monitorIncidents.cause,
        })
        .from(monitorIncidents)
        .innerJoin(monitors, eq(monitorIncidents.monitorId, monitors.id))
        // Las que empezaron en la ventana y las que siguen abiertas aunque empezaran antes.
        .where(or(gt(monitorIncidents.startedAt, desde), isNull(monitorIncidents.resolvedAt)))
        .orderBy(desc(monitorIncidents.startedAt))
        .limit(30),
      ultimasCorridas(ventanaCron),
      db
        .select({ job: cronRuns.job, at: cronRuns.createdAt, detalle: cronRuns.detail })
        .from(cronRuns)
        .where(and(gt(cronRuns.createdAt, desdeFallos), eq(cronRuns.ok, false)))
        .orderBy(desc(cronRuns.createdAt))
        .limit(20),
    ])

    const largos = vigiladosUnicos(VIGILADOS).filter((v) => v.cadaMin > CADENCIA_MAX_BITACORA_MIN).map((v) => v.job)
    for (const [job, d] of await ultimasFueraDeBitacora(largos)) ultimas.set(job, d)
    const silencios = jobsEnSilencio(VIGILADOS, ultimas, ahora)

    const porMonitor = new Map<number, typeof diarios>()
    for (const d of diarios) porMonitor.set(d.monitor, [...(porMonitor.get(d.monitor) ?? []), d])

    return ok({
      ventanaDias: dias,
      paginas: lista.map((m) => {
        const suyos = porMonitor.get(m.id) ?? []
        const total = suyos.reduce((s, d) => s + d.total, 0)
        const buenos = suyos.reduce((s, d) => s + d.ok, 0)
        const diasCert = m.certificadoVence ? Math.floor((m.certificadoVence.getTime() - ahora.getTime()) / 86_400_000) : null
        return {
          nombre: m.nombre,
          estado: m.pausado ? 'pausado' : m.estado,
          ultimoSondeo: fechaHora(m.ultimoSondeo),
          ultimaRespuestaMs: m.ms,
          disponibilidad: total ? `${((buenos / total) * 100).toFixed(2)} %` : 'sin datos en la ventana',
          sondeos: total,
          latenciaP95Ms: total ? quantileFromHist(mergeHists(suyos.map((d) => parseHist(d.hist)))) : null,
          certificadoVenceEnDias: diasCert,
        }
      }),
      caidas: caidas.map((c) => ({
        pagina: c.monitor,
        inicio: fechaHora(c.inicio),
        fin: fechaHora(c.fin),
        abierta: !c.fin,
        minutos: c.segundos != null ? Math.round(c.segundos / 60) : null,
        causa: textoSeguro(c.causa, 200),
      })),
      crons: {
        vigilados: vigiladosUnicos(VIGILADOS).length,
        enSilencio: silencios.map((s) => ({
          job: s.job,
          disparador: s.origen,
          debeCorrerCadaMin: s.cadaMin,
          calladoDesde: s.silencioMin === null ? 'sin registro en toda la ventana' : `${s.silencioMin} min`,
        })),
        fallosUltimas48h: fallos.map((f) => ({ job: f.job, cuando: fechaHora(f.at), detalle: textoSeguro(f.detalle, 200) })),
      },
      hoy: fecha(ahora),
    })
  },
}

export const HERRAMIENTAS_OPERACION = [paginasTool]
