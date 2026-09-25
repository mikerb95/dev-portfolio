// Agregados públicos de /security, calculados como mucho una vez cada unas
// horas.
//
// Turso factura filas ESCANEADAS, no consultas: cada render de /security
// sumaba 30 días de security_events crudo en cuatro consultas, y el CDN no lo
// acota (revalida por región). Aquí el cálculo se guarda como una foto en
// app_settings, una fila por clave primaria, igual que el estado del detector
// de silencio (cron-runs.ts): un render lee esa fila y solo recalcula cuando
// la foto venció. Encima, cada instancia la guarda en memoria, así que las
// visitas seguidas a una instancia caliente no leen ni esa fila.
//
// Fail-open, pero sin mentir: si recalcular falla, se sirve la foto vieja (la
// página dice de cuándo es); si no hay ninguna, la página pinta sus estados
// vacíos, como antes con safeQuery. Nunca se guarda un cálculo fallido como si
// fueran ceros, que se quedarían publicados horas.
//
// OPSEC: la foto contiene solo lo que la página ya publicaba (agregados por
// categoría, país y día). Ninguna IP, ruta ni regla.

import { and, eq, gte, notInArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appSettings, blockedIps, securityEvents } from '../../db/schema'
import { AUDIT_CATEGORIES } from './audit'

export const VITRINA_CLAVE = 'cache_security_vitrina'
export const VITRINA_TTL_MS = 3 * 3_600_000
export const VENTANA_DIAS = 30
export const TENDENCIA_DIAS = 14
const DAY_MS = 86_400_000

export type FotoVitrina = {
  /** Instante del cálculo, en ms. */
  calculadaEn: number
  total: number
  porCategoria: { category: string; count: number }[]
  porPais: { country: string; count: number }[]
  bloqueosAuto: number
  /** Un punto por día, los últimos TENDENCIA_DIAS días hasta `calculadaEn`. */
  tendencia: { day: string; count: number }[]
}

export type OrigenFoto = 'memoria' | 'base' | 'calculada' | 'vieja' | 'vacia'

const esConteo = (x: unknown): x is { count: number } =>
  typeof x === 'object' && x !== null && Number.isFinite((x as { count: unknown }).count)

/** Lee una foto guardada; cualquier cosa que no tenga su forma exacta es null. */
export function parsearFoto(texto: string | null | undefined): FotoVitrina | null {
  if (!texto) return null
  try {
    const f = JSON.parse(texto) as FotoVitrina
    const ok =
      Number.isFinite(f.calculadaEn) &&
      Number.isFinite(f.total) &&
      Number.isFinite(f.bloqueosAuto) &&
      Array.isArray(f.porCategoria) &&
      f.porCategoria.every((c) => esConteo(c) && typeof c.category === 'string') &&
      Array.isArray(f.porPais) &&
      f.porPais.every((c) => esConteo(c) && typeof c.country === 'string') &&
      Array.isArray(f.tendencia) &&
      f.tendencia.every((d) => esConteo(d) && typeof d.day === 'string')
    return ok ? f : null
  } catch {
    return null
  }
}

/**
 * ¿Sigue valiendo la foto? Una fecha en el futuro (reloj corrido en otra
 * instancia) no se da por buena: una foto "del futuro" no vencería nunca.
 */
export function fotoVigente(f: FotoVitrina, ahora: number, ttl = VITRINA_TTL_MS): boolean {
  return f.calculadaEn <= ahora + 60_000 && ahora - f.calculadaEn < ttl
}

/** Rellena con ceros los días sin eventos, del más viejo al más reciente. */
export function tendenciaCompleta(filas: { day: string; count: number }[], ahora: number, dias = TENDENCIA_DIAS) {
  const mapa = new Map(filas.map((r) => [r.day, Number(r.count)]))
  return Array.from({ length: dias }, (_, i) => {
    const day = new Date(ahora - (dias - 1 - i) * DAY_MS).toISOString().slice(0, 10)
    return { day, count: mapa.get(day) ?? 0 }
  })
}

// Solo amenazas. La tabla guarda también rastro de acciones legítimas (mis
// entradas al panel, clientes consultando sus pagos, alumnos canjeando un
// código): contarlas aquí las publicaba como ataques, y el gráfico diario
// habría enseñado qué días entro al panel. Ver lib/security/audit.ts.
const soloAmenazas = notInArray(securityEvents.category, AUDIT_CATEGORIES)
const sumHits = sql<number>`coalesce(sum(${securityEvents.hits}), 0)`

/** Las consultas caras. Sin safeQuery a propósito: si una falla, falla todo. */
async function calcular(ahora: number): Promise<FotoVitrina> {
  const desde = new Date(ahora - VENTANA_DIAS * DAY_MS)
  const desdeTendencia = new Date(ahora - TENDENCIA_DIAS * DAY_MS)
  const ventana = and(gte(securityEvents.at, desde), soloAmenazas)
  const dia = sql<string>`date(${securityEvents.at}, 'unixepoch')`

  const [[total], porCategoria, porPais, [bloqueos], diario] = await Promise.all([
    db.select({ v: sumHits }).from(securityEvents).where(ventana),
    db
      .select({ category: securityEvents.category, count: sumHits })
      .from(securityEvents)
      .where(ventana)
      .groupBy(securityEvents.category)
      .orderBy(sql`2 desc`)
      // Hay 10 categorías posibles: con un tope de 8 el señuelo, que suele ser
      // la más pequeña, desaparecía del desglose y del hero.
      .limit(12),
    db
      .select({ country: securityEvents.country, count: sumHits })
      .from(securityEvents)
      .where(and(ventana, sql`${securityEvents.country} is not null`))
      .groupBy(securityEvents.country)
      .orderBy(sql`2 desc`)
      .limit(6),
    db
      .select({ n: sql<number>`count(*)` })
      .from(blockedIps)
      .where(and(gte(blockedIps.createdAt, desde), sql`${blockedIps.source} = 'auto'`)),
    db
      .select({ day: dia, count: sumHits })
      .from(securityEvents)
      .where(and(gte(securityEvents.at, desdeTendencia), soloAmenazas))
      .groupBy(dia),
  ])

  return {
    calculadaEn: ahora,
    total: Number(total?.v ?? 0),
    porCategoria: porCategoria.map((c) => ({ category: c.category, count: Number(c.count) })),
    porPais: porPais.map((c) => ({ country: c.country ?? '', count: Number(c.count) })),
    bloqueosAuto: Number(bloqueos?.n ?? 0),
    tendencia: tendenciaCompleta(diario, ahora),
  }
}

let enMemoria: FotoVitrina | null = null
// Varias visitas que llegan justo al vencer comparten un solo recálculo por
// instancia, en vez de lanzar cada una sus cinco consultas.
let enCurso: Promise<FotoVitrina> | null = null

/** Solo para tests: olvida la foto de esta instancia. */
export function olvidarVitrinaEnMemoria() {
  enMemoria = null
  enCurso = null
}

export async function leerVitrina(ahora = Date.now()): Promise<{ foto: FotoVitrina | null; origen: OrigenFoto }> {
  if (enMemoria && fotoVigente(enMemoria, ahora)) return { foto: enMemoria, origen: 'memoria' }

  let guardada: FotoVitrina | null = null
  try {
    const [fila] = await db.select().from(appSettings).where(eq(appSettings.key, VITRINA_CLAVE)).limit(1)
    guardada = parsearFoto(fila?.value)
  } catch (err) {
    console.error('[security/vitrina] leer foto:', err instanceof Error ? err.message : err)
  }
  if (guardada && fotoVigente(guardada, ahora)) {
    enMemoria = guardada
    return { foto: guardada, origen: 'base' }
  }

  try {
    enCurso ??= calcular(ahora).finally(() => {
      enCurso = null
    })
    const foto = await enCurso
    enMemoria = foto
    try {
      const valor = JSON.stringify(foto)
      const cuando = new Date(foto.calculadaEn)
      await db
        .insert(appSettings)
        .values({ key: VITRINA_CLAVE, value: valor, updatedAt: cuando })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: valor, updatedAt: cuando } })
    } catch (err) {
      // Sin guardar, la próxima instancia fría recalcula: más caro, no roto.
      console.error('[security/vitrina] guardar foto:', err instanceof Error ? err.message : err)
    }
    return { foto, origen: 'calculada' }
  } catch (err) {
    console.error('[security/vitrina] calcular:', err instanceof Error ? err.message : err)
    const vieja = guardada ?? enMemoria
    return vieja ? { foto: vieja, origen: 'vieja' } : { foto: null, origen: 'vacia' }
  }
}
