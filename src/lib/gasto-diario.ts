// Contador de gasto diario en la API de Claude, compartido por los agentes que
// tienen tope propio (el asesor público y el asistente del panel). Cada uno
// tiene su clave en app_settings y su variable de entorno para el tope.
//
// Una sola fila por agente (valor "AAAA-MM-DD|usd") y no una por día: diez
// páginas del panel leen app_settings completa, y una fila diaria las iría
// engordando para siempre.
//
// Quien lo usa decide qué hacer si la base no responde; los dos agentes de
// hoy fallan CERRADO (sin saber cuánto se gastó, no se gasta más).

import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { appSettings } from '../db/schema'
import { serverEnv } from './env'

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

export type TopeDiario = {
  clave: string
  topeDiarioUsd: () => number
  /** USD que quedan hoy. Lanza si la base no responde. */
  presupuestoRestante: (ahora?: Date) => Promise<number>
  /** Suma un gasto de forma atómica. */
  sumarGasto: (usd: number, ahora?: Date) => Promise<void>
}

export function crearTopeDiario(opciones: { clave: string; variable: string; porDefectoUsd: number }): TopeDiario {
  const { clave, variable, porDefectoUsd } = opciones

  const topeDiarioUsd = () => {
    const v = Number(serverEnv(variable))
    // Una variable vacía no es un tope de cero: Number('') es 0 y apagaría el agente sin querer.
    return serverEnv(variable)?.trim() && Number.isFinite(v) && v >= 0 ? v : porDefectoUsd
  }

  return {
    clave,
    topeDiarioUsd,
    async presupuestoRestante(ahora = new Date()) {
      const [fila] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, clave))
      return topeDiarioUsd() - gastoDelValor(fila?.value, hoyBogota(ahora))
    },
    // El día nuevo arranca de cero dentro del mismo UPSERT, sin leer antes,
    // para que dos gastos a la vez no se pisen.
    async sumarGasto(usd, ahora = new Date()) {
      if (!(usd > 0)) return
      const hoy = hoyBogota(ahora)
      const inicial = `${hoy}|${usd}`
      await db
        .insert(appSettings)
        .values({ key: clave, value: inicial, updatedAt: ahora })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: sql`CASE WHEN substr(${appSettings.value}, 1, 10) = ${hoy}
              THEN ${hoy} || '|' || (CAST(substr(${appSettings.value}, 12) AS REAL) + ${usd})
              ELSE ${inicial} END`,
            updatedAt: ahora,
          },
        })
    },
  }
}
