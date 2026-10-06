// Persistencia de Plano. Este módulo SÍ toca la base; el cálculo vive en los
// módulos puros de esta carpeta. Misma separación que cobros.ts / cobros-db.ts.
// Ver docs/plan-plano.md.

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appSettings, propuestaHoras, propuestas, propuestaVersiones } from '../../db/schema'
import { CLAVE_REGLAS, REGLAS_DEFAULT, type ReglasPlano } from '../../data/plano'
import { isUniqueViolation } from '../db-unique'
import { fechaISOEnColombia } from '../fecha-co'
import { huellaSnapshot, nuevoToken } from './hash'
import { parseReglas, validarReglas } from './pagos'
import { armarPropuesta, normalizarConfig } from './propuesta'
import type { ConfigPropuesta, Snapshot } from './tipos'

export type Propuesta = typeof propuestas.$inferSelect
export type VersionPropuesta = typeof propuestaVersiones.$inferSelect

/** El día de hoy en Colombia ('YYYY-MM-DD'): las propuestas se fechan en hora de Bogotá. */
export const hoyCO = (): string => fechaISOEnColombia(new Date())

// ── Reglas ──────────────────────────────────────────────────────────────────

export async function cargarReglas(): Promise<ReglasPlano> {
  try {
    const [fila] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, CLAVE_REGLAS)).limit(1)
    return parseReglas(fila?.value, REGLAS_DEFAULT)
  } catch {
    // Sin base no hay propuesta que guardar, pero el constructor puede seguir
    // calculando con las reglas de fábrica.
    return REGLAS_DEFAULT
  }
}

export async function guardarReglas(r: ReglasPlano): Promise<string[]> {
  const errores = validarReglas(r)
  if (errores.length) return errores
  const valor = JSON.stringify(r)
  const ahora = new Date()
  await db
    .insert(appSettings)
    .values({ key: CLAVE_REGLAS, value: valor, updatedAt: ahora })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: valor, updatedAt: ahora } })
  return []
}

// ── Propuestas ──────────────────────────────────────────────────────────────

export function configDe(p: Pick<Propuesta, 'config'>): ConfigPropuesta {
  let raw: unknown = null
  try {
    raw = JSON.parse(p.config)
  } catch {
    raw = null
  }
  return normalizarConfig(raw, hoyCO())
}

export async function crearPropuesta(config: ConfigPropuesta, clientId: number | null = null): Promise<Propuesta> {
  const ahora = new Date()
  // El token tiene 128 bits: una colisión no va a pasar, pero si pasara el
  // UNIQUE la para y se reintenta en vez de devolver un 500.
  for (let i = 0; i < 3; i++) {
    try {
      const [fila] = await db
        .insert(propuestas)
        .values({
          token: nuevoToken(),
          clientId,
          titulo: config.titulo || 'Propuesta sin título',
          config: JSON.stringify(config),
          moneda: config.moneda,
          creadaEl: ahora,
          actualizadaEl: ahora,
        })
        .returning()
      return fila
    } catch (e) {
      if (!isUniqueViolation(e) || i === 2) throw e
    }
  }
  throw new Error('no se pudo crear la propuesta')
}

export async function propuesta(id: number): Promise<Propuesta | null> {
  const [fila] = await db.select().from(propuestas).where(eq(propuestas.id, id)).limit(1)
  return fila ?? null
}

export async function propuestaPorToken(token: string): Promise<Propuesta | null> {
  const [fila] = await db.select().from(propuestas).where(eq(propuestas.token, token)).limit(1)
  return fila ?? null
}

/** Listado del panel: sin config ni conversación, que son lo pesado. */
export async function listarPropuestas() {
  return db
    .select({
      id: propuestas.id,
      titulo: propuestas.titulo,
      estado: propuestas.estado,
      precio: propuestas.precio,
      moneda: propuestas.moneda,
      versionActual: propuestas.versionActual,
      vistas: propuestas.vistas,
      vistaPrimera: propuestas.vistaPrimera,
      enviadaEl: propuestas.enviadaEl,
      aceptadaEl: propuestas.aceptadaEl,
      aceptadaPor: propuestas.aceptadaPor,
      projectId: propuestas.projectId,
      iaUsd: propuestas.iaUsd,
      actualizadaEl: propuestas.actualizadaEl,
    })
    .from(propuestas)
    .orderBy(desc(propuestas.actualizadaEl))
    .limit(200)
}

/** Una propuesta aceptada o convertida ya no se edita: es un acuerdo. */
export const esEditable = (p: Pick<Propuesta, 'estado'>): boolean => p.estado === 'borrador' || p.estado === 'enviada'

export class PropuestaCerrada extends Error {
  constructor() {
    super('la propuesta ya fue aceptada y no se puede editar')
    this.name = 'PropuestaCerrada'
  }
}

export async function guardarConfig(id: number, config: ConfigPropuesta): Promise<void> {
  const p = await propuesta(id)
  if (!p) throw new Error('propuesta no encontrada')
  if (!esEditable(p)) throw new PropuestaCerrada()
  await db
    .update(propuestas)
    .set({ config: JSON.stringify(config), titulo: config.titulo || p.titulo, moneda: config.moneda, actualizadaEl: new Date() })
    .where(eq(propuestas.id, id))
}

export async function guardarConversacion(id: number, conversacion: string): Promise<void> {
  await db.update(propuestas).set({ conversacion: conversacion.slice(0, 40_000), actualizadaEl: new Date() }).where(eq(propuestas.id, id))
}

export async function guardarRevision(id: number, revision: unknown): Promise<void> {
  await db.update(propuestas).set({ revision: JSON.stringify(revision), actualizadaEl: new Date() }).where(eq(propuestas.id, id))
}

export async function sumarGastoIa(id: number, usd: number): Promise<void> {
  if (!(usd > 0)) return
  await db
    .update(propuestas)
    .set({ iaUsd: sql`${propuestas.iaUsd} + ${usd}` })
    .where(eq(propuestas.id, id))
}

// ── Versiones ───────────────────────────────────────────────────────────────

export async function versiones(propuestaId: number): Promise<VersionPropuesta[]> {
  return db.select().from(propuestaVersiones).where(eq(propuestaVersiones.propuestaId, propuestaId)).orderBy(desc(propuestaVersiones.version))
}

export async function version(propuestaId: number, n: number): Promise<VersionPropuesta | null> {
  const [fila] = await db
    .select()
    .from(propuestaVersiones)
    .where(and(eq(propuestaVersiones.propuestaId, propuestaId), eq(propuestaVersiones.version, n)))
    .limit(1)
  return fila ?? null
}

export function snapshotDe(v: Pick<VersionPropuesta, 'snapshot'>): Snapshot {
  return JSON.parse(v.snapshot) as Snapshot
}

/**
 * Congela una versión. Si es idéntica a la última (misma huella), no crea otra:
 * guardar dos veces sin cambios no debe inflar el historial que ve el cliente.
 * El número sale de la última versión + 1 y el UNIQUE (propuesta, versión)
 * detiene a un segundo guardado simultáneo, que reintenta con el siguiente.
 */
export async function congelarVersion(propuestaId: number, snapshot: Snapshot, origen: 'panel' | 'cliente', config: ConfigPropuesta): Promise<VersionPropuesta> {
  const huella = huellaSnapshot(snapshot)
  for (let intento = 0; intento < 4; intento++) {
    const [ultima] = await db
      .select()
      .from(propuestaVersiones)
      .where(eq(propuestaVersiones.propuestaId, propuestaId))
      .orderBy(desc(propuestaVersiones.version))
      .limit(1)
    if (ultima && ultima.huella === huella) return ultima
    const n = (ultima?.version ?? 0) + 1
    try {
      const [fila] = await db
        .insert(propuestaVersiones)
        .values({ propuestaId, version: n, snapshot: JSON.stringify(snapshot), huella, origen, config: JSON.stringify(config), creadaEl: new Date() })
        .returning()
      await db
        .update(propuestas)
        .set({ versionActual: n, precio: snapshot.precio, moneda: snapshot.moneda, actualizadaEl: new Date() })
        .where(eq(propuestas.id, propuestaId))
      return fila
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
    }
  }
  throw new Error('no se pudo numerar la versión (demasiados guardados simultáneos)')
}

/** Recalcula en el servidor y congela. El navegador nunca manda el snapshot. */
export async function congelarDesdeConfig(p: Propuesta, config: ConfigPropuesta, origen: 'panel' | 'cliente'): Promise<{ version: VersionPropuesta; snapshot: Snapshot }> {
  const reglas = await cargarReglas()
  const snapshot = armarPropuesta(config, reglas, hoyCO())
  const v = await congelarVersion(p.id, snapshot, origen, config)
  return { version: v, snapshot }
}

/** Configuración de una versión congelada (la de la propuesta si la versión es anterior a la columna). */
export function configDeVersion(v: Pick<VersionPropuesta, 'config'>, p: Pick<Propuesta, 'config'>): ConfigPropuesta {
  if (v.config) {
    try {
      return normalizarConfig(JSON.parse(v.config), hoyCO())
    } catch {
      // cae a la de la propuesta
    }
  }
  return configDe(p)
}

export async function marcarEnviada(id: number): Promise<void> {
  await db
    .update(propuestas)
    .set({ estado: 'enviada', enviadaEl: new Date(), actualizadaEl: new Date() })
    .where(and(eq(propuestas.id, id), inArray(propuestas.estado, ['borrador', 'enviada'])))
}

export async function descartar(id: number): Promise<boolean> {
  const r = await db
    .update(propuestas)
    .set({ estado: 'descartada', actualizadaEl: new Date() })
    .where(and(eq(propuestas.id, id), inArray(propuestas.estado, ['borrador', 'enviada'])))
  return r.rowsAffected > 0
}

export async function reabrir(id: number): Promise<boolean> {
  const r = await db
    .update(propuestas)
    .set({ estado: 'borrador', actualizadaEl: new Date() })
    .where(and(eq(propuestas.id, id), eq(propuestas.estado, 'descartada')))
  return r.rowsAffected > 0
}

/** Cuenta una apertura del enlace. Fail-open: ver la propuesta no depende de esto. */
export async function registrarVista(p: Propuesta): Promise<void> {
  try {
    await db
      .update(propuestas)
      .set({ vistas: sql`${propuestas.vistas} + 1`, vistaPrimera: p.vistaPrimera ?? new Date() })
      .where(eq(propuestas.id, p.id))
  } catch {
    // Sin conteo esta vez.
  }
}

// ── Horas reales (aprende) ──────────────────────────────────────────────────

export async function horasDe(propuestaId: number) {
  return db.select().from(propuestaHoras).where(eq(propuestaHoras.propuestaId, propuestaId))
}

export async function guardarHoras(propuestaId: number, filas: { componenteId: string; estimadas: number; reales: number }[]): Promise<void> {
  const ahora = new Date()
  for (const f of filas) {
    await db
      .insert(propuestaHoras)
      .values({ propuestaId, componenteId: f.componenteId, estimadas: f.estimadas, reales: f.reales, actualizadaEl: ahora })
      .onConflictDoUpdate({
        target: [propuestaHoras.propuestaId, propuestaHoras.componenteId],
        set: { estimadas: f.estimadas, reales: f.reales, actualizadaEl: ahora },
      })
  }
}

export async function todasLasHoras() {
  return db
    .select({ componenteId: propuestaHoras.componenteId, estimadas: propuestaHoras.estimadas, reales: propuestaHoras.reales })
    .from(propuestaHoras)
    .limit(2000)
}
