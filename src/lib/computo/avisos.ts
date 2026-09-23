// Avisos de cuota gratis por ntfy. Capa con BD y red: la decisión de qué avisar
// es pura y vive en `cuota.ts`; aquí solo se lee, se envía y se recuerda.

import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { appSettings } from '../../db/schema'
import { sendPush } from '../notify'
import { decidirAvisos, estadoCuota, mensajeAvisos, parseAvisos } from './cuota'
import { consumoDelMes } from './store'

/** Mismo patrón que el detector de crons en silencio: estado en una fila de `app_settings`. */
const CLAVE_ESTADO = 'computo_cuota_avisos'

export interface ResultadoAvisos {
  avisos: number
  enviado: boolean
}

/**
 * Revisa la cuota del mes y avisa lo que toque.
 *
 * Fail-open: nunca lanza. Es observabilidad dentro del cron de cómputo, y que
 * el vigilante falle no puede tumbar la consolidación que lo hospeda.
 *
 * El estado se guarda DESPUÉS de intentar el envío y aunque ntfy no esté
 * configurado: sin `NTFY_TOPIC` el aviso es un no-op, y repetirlo cada día
 * tampoco llegaría a nadie. Si ntfy falla de verdad, se pierde ese aviso, no
 * los siguientes umbrales.
 */
export async function avisarCuota(ahora: number): Promise<ResultadoAvisos> {
  try {
    const [fila] = await db.select().from(appSettings).where(eq(appSettings.key, CLAVE_ESTADO)).limit(1)
    const estado = estadoCuota(await consumoDelMes(ahora), ahora)
    const { avisos, estado: siguiente } = decidirAvisos(estado, parseAvisos(fila?.value))

    let enviado = false
    if (avisos.length > 0) {
      const { titulo, cuerpo, prioridad } = mensajeAvisos(avisos)
      const r = await sendPush(titulo, cuerpo, { priority: prioridad, tags: 'warning', click: 'https://codebymike.net/admin/computo' })
      enviado = r.ok === true
    }

    const valor = JSON.stringify(siguiente)
    const fecha = new Date(ahora)
    await db
      .insert(appSettings)
      .values({ key: CLAVE_ESTADO, value: valor, updatedAt: fecha })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: valor, updatedAt: fecha } })

    return { avisos: avisos.length, enviado }
  } catch (e) {
    console.error('[computo-avisos]', e)
    return { avisos: 0, enviado: false }
  }
}
