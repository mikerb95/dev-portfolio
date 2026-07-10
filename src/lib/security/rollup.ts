// Agregación de eventos crudos en rollups horarios/diarios. Los rollups
// alimentan los dashboards (sin escanear millones de filas crudas) y son la
// baseline para la detección de anomalías. Ver docs/plan-security-observability.

import { and, gte, lt, sql } from 'drizzle-orm'
import { db } from '../../db'
import { securityEvents, securityRollups } from '../../db/schema'

export type RawEvent = {
  ip: string | null
  path: string
  category: string
  country: string | null
  hits: number
}

export type CategoryAgg = {
  category: string
  count: number
  uniqueIps: number
  topPath: string | null
  topCountry: string | null
}

/** Devuelve la clave más frecuente de un mapa de pesos (o null si vacío). */
function topKey(weights: Map<string, number>): string | null {
  let best: string | null = null
  let bestW = -1
  for (const [k, w] of weights) {
    if (w > bestW) {
      best = k
      bestW = w
    }
  }
  return best
}

/**
 * Agrega eventos crudos por categoría (puro y testeable). `count` suma `hits`
 * (respetando la deduplicación de ráfagas); `uniqueIps` cuenta IPs distintas;
 * `topPath`/`topCountry` son los más frecuentes ponderados por hits.
 */
export function aggregateByCategory(events: RawEvent[]): CategoryAgg[] {
  const byCat = new Map<
    string,
    { count: number; ips: Set<string>; paths: Map<string, number>; countries: Map<string, number> }
  >()
  for (const e of events) {
    let g = byCat.get(e.category)
    if (!g) {
      g = { count: 0, ips: new Set(), paths: new Map(), countries: new Map() }
      byCat.set(e.category, g)
    }
    const hits = e.hits > 0 ? e.hits : 1
    g.count += hits
    if (e.ip) g.ips.add(e.ip)
    g.paths.set(e.path, (g.paths.get(e.path) ?? 0) + hits)
    if (e.country) g.countries.set(e.country, (g.countries.get(e.country) ?? 0) + hits)
  }
  return [...byCat.entries()].map(([category, g]) => ({
    category,
    count: g.count,
    uniqueIps: g.ips.size,
    topPath: topKey(g.paths),
    topCountry: topKey(g.countries),
  }))
}

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Inicio de la hora que contiene `t` (ms). */
export const floorHour = (t: number): number => Math.floor(t / HOUR_MS) * HOUR_MS
/** Inicio del día (UTC) que contiene `t` (ms). */
export const floorDay = (t: number): number => Math.floor(t / DAY_MS) * DAY_MS

async function readRawWindow(fromMs: number, toMs: number): Promise<RawEvent[]> {
  const rows = await db
    .select({
      ip: securityEvents.ip,
      path: securityEvents.path,
      category: securityEvents.category,
      country: securityEvents.country,
      hits: securityEvents.hits,
    })
    .from(securityEvents)
    .where(and(gte(securityEvents.at, new Date(fromMs)), lt(securityEvents.at, new Date(toMs))))
  return rows.map((r) => ({ ...r, hits: r.hits ?? 1 }))
}

/** Reescribe (idempotente) los rollups de un bucket para un instante `at`. */
async function writeRollups(bucket: 'hour' | 'day', atMs: number, aggs: CategoryAgg[]): Promise<void> {
  const at = new Date(atMs)
  await db
    .delete(securityRollups)
    .where(and(sql`${securityRollups.bucket} = ${bucket}`, sql`${securityRollups.at} = ${Math.floor(atMs / 1000)}`))
  if (aggs.length === 0) return
  await db.insert(securityRollups).values(
    aggs.map((a) => ({
      bucket,
      at,
      category: a.category,
      count: a.count,
      uniqueIps: a.uniqueIps,
      topPath: a.topPath,
      topCountry: a.topCountry,
    }))
  )
}

/**
 * Materializa el rollup de la hora ya cerrada (la anterior a `now`) y del día
 * en curso. Devuelve los agregados por categoría de esa hora (para anomalías).
 */
export async function storeRollups(now = Date.now()): Promise<CategoryAgg[]> {
  const hourStart = floorHour(now) - HOUR_MS
  const hourAggs = aggregateByCategory(await readRawWindow(hourStart, hourStart + HOUR_MS))
  await writeRollups('hour', hourStart, hourAggs)

  const dayStart = floorDay(now)
  const dayAggs = aggregateByCategory(await readRawWindow(dayStart, dayStart + DAY_MS))
  await writeRollups('day', dayStart, dayAggs)

  return hourAggs
}

/**
 * Baseline por categoría: cuenta de eventos en la MISMA hora-del-día durante los
 * últimos `days`, leída de los rollups horarios. Devuelve Map<categoría, series>.
 */
export async function hourlyBaselines(
  hourOfDayUtc: number,
  now = Date.now(),
  days = 30
): Promise<Map<string, number[]>> {
  const from = new Date(floorHour(now) - days * DAY_MS)
  const before = new Date(floorHour(now)) // excluye la hora en curso
  const rows = await db
    .select({ category: securityRollups.category, count: securityRollups.count, at: securityRollups.at })
    .from(securityRollups)
    .where(
      and(
        sql`${securityRollups.bucket} = 'hour'`,
        gte(securityRollups.at, from),
        lt(securityRollups.at, before),
        sql`cast(strftime('%H', ${securityRollups.at}, 'unixepoch') as integer) = ${hourOfDayUtc}`
      )
    )
  const map = new Map<string, number[]>()
  for (const r of rows) {
    const arr = map.get(r.category) ?? []
    arr.push(r.count)
    map.set(r.category, arr)
  }
  return map
}

/** Países vistos históricamente como top de un rollup (para geo-anomalías). */
export async function knownCountries(now = Date.now(), days = 30): Promise<Set<string>> {
  const from = new Date(floorHour(now) - days * DAY_MS)
  const before = new Date(floorHour(now))
  const rows = await db
    .select({ c: securityRollups.topCountry })
    .from(securityRollups)
    .where(and(gte(securityRollups.at, from), lt(securityRollups.at, before), sql`${securityRollups.topCountry} is not null`))
  return new Set(rows.map((r) => r.c).filter((c): c is string => !!c))
}

/** Rutas más sondeadas en la hora ya cerrada (para patrones nuevos). */
export async function currentTopPaths(now = Date.now(), limit = 20): Promise<{ path: string; count: number }[]> {
  const hourStart = floorHour(now) - HOUR_MS
  const rows = await db
    .select({ path: securityEvents.path, count: sql<number>`coalesce(sum(${securityEvents.hits}), 0)` })
    .from(securityEvents)
    .where(and(gte(securityEvents.at, new Date(hourStart)), lt(securityEvents.at, new Date(hourStart + HOUR_MS))))
    .groupBy(securityEvents.path)
    .orderBy(sql`2 desc`)
    .limit(limit)
  return rows.map((r) => ({ path: r.path, count: Number(r.count) }))
}

/** Rutas vistas como top histórico (baseline acotada para patrones nuevos). */
export async function knownTopPaths(now = Date.now(), days = 30): Promise<Set<string>> {
  const from = new Date(floorHour(now) - days * DAY_MS)
  const before = new Date(floorHour(now))
  const rows = await db
    .select({ p: securityRollups.topPath })
    .from(securityRollups)
    .where(and(gte(securityRollups.at, from), lt(securityRollups.at, before), sql`${securityRollups.topPath} is not null`))
  return new Set(rows.map((r) => r.p).filter((p): p is string => !!p))
}

/** Top de países por eventos high/critical en la hora ya cerrada (para geo). */
export async function currentGeoTop(now = Date.now()): Promise<{ country: string; count: number }[]> {
  const hourStart = floorHour(now) - HOUR_MS
  const rows = await db
    .select({ country: securityEvents.country, count: sql<number>`coalesce(sum(${securityEvents.hits}), 0)` })
    .from(securityEvents)
    .where(
      and(
        gte(securityEvents.at, new Date(hourStart)),
        lt(securityEvents.at, new Date(hourStart + HOUR_MS)),
        sql`${securityEvents.severity} in ('high','critical')`,
        sql`${securityEvents.country} is not null`
      )
    )
    .groupBy(securityEvents.country)
    .orderBy(sql`2 desc`)
  return rows
    .filter((r): r is { country: string; count: number } => !!r.country)
    .map((r) => ({ country: r.country, count: Number(r.count) }))
}
