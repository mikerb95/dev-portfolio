// Parte con base de datos del acceso por PIN a Cotiza. Las decisiones viven en
// `acceso.ts` (puro y probado); aquí solo se lee y se escribe.
//
// A diferencia del resto de la seguridad del repo, estas funciones LANZAN si la
// base no responde, y quien las llama trata el error como "no abre". Es la
// misma excepción que la revocación de sesiones: esto es autorización.
//
// Los contadores van en `rate_limit_buckets` (la tabla del limitador durable)
// con claves propias, y no en `enforceLimit`, porque ese limitador es fail-open
// por diseño: si la base falla, deja pasar. Para un PIN de cuatro dígitos eso
// convertiría una caída de Turso en intentos ilimitados.

import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appSettings, rateLimitBuckets } from '../../db/schema'
import { hashPassword, verifyPassword } from '../portal/passwords'
import {
  CIERRE_MS,
  CLAVE_PIN,
  VENTANA_GLOBAL_MS,
  VENTANA_IP_MS,
  verificarAccesoCotiza,
  versionDePin,
  type EstadoFrenos,
} from './acceso'

export type PinGuardado = { hash: string; version: string; actualizado: Date | null }

const claveIp = (ip: string) => `cotiza-pin:ip:${ip}`
const CLAVE_GLOBAL = 'cotiza-pin:global'
const CLAVE_CIERRE = 'cotiza-pin:cierre'

/**
 * El middleware consulta el PIN en cada request de Cotiza para validar la
 * cookie. Treinta segundos de caché por instancia evitan una lectura por
 * clic; el precio es que un PIN recién cambiado tarda hasta eso en invalidar
 * las cookies viejas en otras instancias.
 */
const CACHE_MS = 30_000
let cache: { valor: PinGuardado | null; hasta: number } | null = null

export async function leerPin(): Promise<PinGuardado | null> {
  const [fila] = await db
    .select({ value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(eq(appSettings.key, CLAVE_PIN))
    .limit(1)
  if (!fila?.value) return null
  return { hash: fila.value, version: versionDePin(fila.value), actualizado: fila.updatedAt ?? null }
}

export async function leerPinCacheado(ahoraMs = Date.now()): Promise<PinGuardado | null> {
  if (cache && cache.hasta > ahoraMs) return cache.valor
  const valor = await leerPin()
  cache = { valor, hasta: ahoraMs + CACHE_MS }
  return valor
}

export function olvidarCachePin(): void {
  cache = null
}

/**
 * Lo que pregunta el middleware. Sin cookie no toca la base. Si la base no
 * responde, `false`: la puerta del PIN falla cerrada.
 */
export async function accesoCotizaVigente(
  token: string | null | undefined,
  secreto: string | null | undefined
): Promise<boolean> {
  if (!token || !secreto) return false
  try {
    const pin = await leerPinCacheado()
    return verificarAccesoCotiza(token, secreto, pin?.version)
  } catch {
    return false
  }
}

export async function guardarPin(pin: string): Promise<void> {
  const hash = await hashPassword(pin)
  const ahora = new Date()
  await db
    .insert(appSettings)
    .values({ key: CLAVE_PIN, value: hash, updatedAt: ahora })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: hash, updatedAt: ahora } })
  olvidarCachePin()
}

/** Quitar el PIN apaga la puerta: sin hash guardado, ninguna cookie vale. */
export async function borrarPin(): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, CLAVE_PIN))
  olvidarCachePin()
}

/** Nunca lanza: un hash corrupto es un PIN incorrecto. */
export function pinCorrecto(pin: string, guardado: PinGuardado): Promise<boolean> {
  return verifyPassword(pin, guardado.hash)
}

export async function leerFrenos(ip: string, ahoraMs = Date.now()): Promise<EstadoFrenos> {
  const filas = await db
    .select({ key: rateLimitBuckets.key, count: rateLimitBuckets.count, resetAt: rateLimitBuckets.resetAt })
    .from(rateLimitBuckets)
    .where(inArray(rateLimitBuckets.key, [claveIp(ip), CLAVE_CIERRE]))
  const vigente = (k: string) => filas.find((f) => f.key === k && f.resetAt.getTime() > ahoraMs)
  const ipFila = vigente(claveIp(ip))
  const cierre = vigente(CLAVE_CIERRE)
  return { fallosIp: ipFila?.count ?? 0, cerradaHastaMs: cierre ? cierre.resetAt.getTime() : null }
}

/** Incremento atómico con reinicio de ventana, mismo UPSERT que el limitador durable. */
async function sumar(key: string, ventanaMs: number, ahoraMs: number): Promise<number> {
  const ahoraSeg = Math.floor(ahoraMs / 1000)
  const resetSeg = ahoraSeg + Math.ceil(ventanaMs / 1000)
  const filas = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, resetAt: new Date(resetSeg * 1000) })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`case when ${rateLimitBuckets.resetAt} <= ${ahoraSeg} then 1 else ${rateLimitBuckets.count} + 1 end`,
        resetAt: sql`case when ${rateLimitBuckets.resetAt} <= ${ahoraSeg} then ${resetSeg} else ${rateLimitBuckets.resetAt} end`,
      },
    })
    .returning({ count: rateLimitBuckets.count })
  return filas[0]?.count ?? 1
}

/** Suma un fallo a la IP y al contador general; devuelve el total general. */
export async function registrarFallo(ip: string, ahoraMs = Date.now()): Promise<number> {
  await sumar(claveIp(ip), VENTANA_IP_MS, ahoraMs)
  return sumar(CLAVE_GLOBAL, VENTANA_GLOBAL_MS, ahoraMs)
}

export async function cerrarPuerta(ahoraMs = Date.now()): Promise<void> {
  const hasta = new Date(Math.floor((ahoraMs + CIERRE_MS) / 1000) * 1000)
  await db
    .insert(rateLimitBuckets)
    .values({ key: CLAVE_CIERRE, count: 1, resetAt: hasta })
    .onConflictDoUpdate({ target: rateLimitBuckets.key, set: { count: 1, resetAt: hasta } })
}

/**
 * Un acierto limpia los fallos de esa IP (los dedos torpes no deberían
 * acercarte al freno la próxima vez). El contador general no se toca: un
 * acierto mío no debe borrar los intentos de otro.
 */
export async function limpiarFallosIp(ip: string): Promise<void> {
  await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, claveIp(ip)))
}

/** Para Ajustes: reabrir la puerta antes de tiempo, con sesión completa. */
export async function reabrirPuerta(): Promise<void> {
  await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.key, [CLAVE_CIERRE, CLAVE_GLOBAL]))
}

export type EstadoPuerta = { configurado: boolean; actualizado: Date | null; cerradaHasta: Date | null }

/** Lo que enseña Ajustes. Nunca devuelve el hash. */
export async function estadoPuerta(ahoraMs = Date.now()): Promise<EstadoPuerta> {
  const [pin, filas] = await Promise.all([
    leerPin(),
    db
      .select({ resetAt: rateLimitBuckets.resetAt })
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, CLAVE_CIERRE))
      .limit(1),
  ])
  const cierre = filas[0]?.resetAt
  return {
    configurado: pin !== null,
    actualizado: pin?.actualizado ?? null,
    cerradaHasta: cierre && cierre.getTime() > ahoraMs ? cierre : null,
  }
}
