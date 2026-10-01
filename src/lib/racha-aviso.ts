// Aviso de racha en riesgo del tracker de aprendizaje (/admin/aprendizaje).
//
// Si ayer hubo sesión y hoy todavía no, la racha sigue viva pero se corta a
// medianoche (ver `atRisk` en lib/skills.ts). A las 8 de la noche llega un
// empujón al celular, una sola vez por día.
//
// Va colgado del sondeo de uptime (cada 5 min) para no gastar un cron más,
// así que lo caro tiene que ser raro: fuera de la franja no se toca la base,
// y dentro de ella la primera lectura es una fila por clave primaria que dice
// si ya se avisó hoy. Fail-open: un fallo aquí nunca afecta al sondeo.
import { and, eq, gte } from 'drizzle-orm'
import { db } from '../db'
import { appSettings, skillSessions, skillTracks } from '../db/schema'
import { sendPush } from './notify'
import { addDays, computeStreak, dayKeyOf, type DayKey } from './skills'
import { siteUrl } from './site'

export const CLAVE_AVISO = 'aviso_racha'
const DESDE_HORA = 20
const HASTA_HORA = 23

/** Hora (0-23) en Bogotá. */
export function horaBogota(ahora: Date): number {
  return (ahora.getUTCHours() + 24 - 5) % 24
}

export function enFranja(ahora: Date): boolean {
  const h = horaBogota(ahora)
  return h >= DESDE_HORA && h < HASTA_HORA
}

/** Pura: ¿toca avisar? Solo con la racha viva sin sesión hoy, y una vez por día. */
export function debeAvisar(atRisk: boolean, hoy: DayKey, ultimoAviso: string | null | undefined): boolean {
  return atRisk && ultimoAviso !== hoy
}

export function mensajeRacha(nombre: string, dias: number): { titulo: string; cuerpo: string } {
  return {
    titulo: `Racha de ${dias} ${dias === 1 ? 'día' : 'días'} en riesgo`,
    cuerpo: `Hoy no hay sesión de ${nombre}. Con 15 minutos antes de medianoche, la racha sigue.`,
  }
}

export async function avisarRachaSiToca(ahora = new Date()): Promise<boolean> {
  if (!enFranja(ahora)) return false
  try {
    const hoy = dayKeyOf(ahora)
    const [fila] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, CLAVE_AVISO)).limit(1)
    if (fila?.value === hoy) return false

    const tracks = await db.select().from(skillTracks).where(eq(skillTracks.isActive, true))
    // Se marca el día aunque no haya nada que avisar: así el resto de la
    // franja no repite estas lecturas cada 5 minutos.
    await db
      .insert(appSettings)
      .values({ key: CLAVE_AVISO, value: hoy, updatedAt: ahora })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: hoy, updatedAt: ahora } })

    let avisados = 0
    for (const track of tracks) {
      // Un año basta para medir la racha actual sin leer el historial entero.
      const sesiones = await db
        .select({ day: skillSessions.day, minutes: skillSessions.minutes })
        .from(skillSessions)
        .where(and(eq(skillSessions.trackId, track.id), gte(skillSessions.day, addDays(hoy, -366))))
      const racha = computeStreak(sesiones, hoy)
      if (!debeAvisar(racha.atRisk, hoy, fila?.value)) continue
      const m = mensajeRacha(track.name, racha.current)
      await sendPush(m.titulo, m.cuerpo, { tags: 'fire', click: `${siteUrl()}/admin/aprendizaje?track=${track.slug}` })
      avisados++
    }
    return avisados > 0
  } catch (err) {
    console.error('[racha-aviso]', err instanceof Error ? err.message : err)
    return false
  }
}
