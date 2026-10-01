// Tope de gasto diario del asesor público. Es un endpoint abierto a cualquiera
// que gasta créditos de la API: sin tope, un bot con paciencia vacía la cuenta
// aunque el rate limit por IP lo frene (basta con muchas IPs).
//
// Falla CERRADO, al revés que la observabilidad del sitio: si no se puede
// leer cuánto se ha gastado hoy, el asesor no responde y la burbuja ofrece
// solo WhatsApp. Perder una conversación con la IA cuesta poco; una factura
// sin techo, no.
//
// Una sola fila en app_settings (`asesor_gasto`, valor "AAAA-MM-DD|usd") y no
// una por día: diez páginas del panel leen app_settings completa, y una fila
// diaria las iría engordando para siempre.

import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appSettings } from '../../db/schema'
import { serverEnv } from '../env'

export const CLAVE_GASTO = 'asesor_gasto'
const TOPE_POR_DEFECTO_USD = 1

export function topeDiarioUsd(): number {
  const v = Number(serverEnv('ASESOR_TOPE_DIARIO_USD'))
  return Number.isFinite(v) && v >= 0 ? v : TOPE_POR_DEFECTO_USD
}

/** Fecha de hoy en Colombia: el día del tope empieza a medianoche de Bogotá, no de Londres. */
export function hoyBogota(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora)
}

/** Lee "AAAA-MM-DD|usd". Lo que no tenga esa forma, o sea de otro día, cuenta como cero. */
export function gastoDelValor(valor: string | null | undefined, hoy: string): number {
  if (!valor) return 0
  const [fecha, usd] = valor.split('|')
  const n = Number(usd)
  return fecha === hoy && Number.isFinite(n) && n >= 0 ? n : 0
}

/** USD que quedan hoy. Lanza si la base no responde (el que llama falla cerrado). */
export async function presupuestoRestante(ahora = new Date()): Promise<number> {
  const [fila] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, CLAVE_GASTO))
  return topeDiarioUsd() - gastoDelValor(fila?.value, hoyBogota(ahora))
}

/**
 * Suma un gasto de forma atómica: el día nuevo arranca de cero dentro del
 * mismo UPSERT, sin leer antes, para que dos preguntas a la vez no se pisen.
 */
export async function sumarGasto(usd: number, ahora = new Date()): Promise<void> {
  if (!(usd > 0)) return
  const hoy = hoyBogota(ahora)
  const inicial = `${hoy}|${usd}`
  await db
    .insert(appSettings)
    .values({ key: CLAVE_GASTO, value: inicial, updatedAt: ahora })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: sql`CASE WHEN substr(${appSettings.value}, 1, 10) = ${hoy}
          THEN ${hoy} || '|' || (CAST(substr(${appSettings.value}, 12) AS REAL) + ${usd})
          ELSE ${inicial} END`,
        updatedAt: ahora,
      },
    })
}
