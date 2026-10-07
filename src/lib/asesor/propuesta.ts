// Del asesor público a Plano: cuando el visitante toca "Enviarle esto a Mike",
// su conversación queda como propuesta en BORRADOR en Plano, para que Mike
// llegue a WhatsApp con el trabajo empezado (el "Opcional (después)" de la
// capacidad 3 en docs/plan-asistente.md).
//
// El plan decía guardarla en `briefings`. Desde el 6 oct 2026 las cotizaciones
// viven en Plano (decisión de Mike para el asistente del panel), así que el
// asesor deja ahí lo suyo: un solo lugar para cotizar.
//
// Tres cuidados, porque el que dispara esto es un visitante anónimo:
//  - La conversación sale de la BASE (asesor_conversaciones), nunca del
//    navegador: el token solo dice cuál es. Sin token válido y vigente, nada.
//  - Una propuesta por conversación: la marca vive en app_settings y se
//    reclama con su llave primaria antes de crear nada, así que dos clics, dos
//    pestañas o un bot insistente dan una sola propuesta.
//  - La IA de Plano NO corre aquí. Cuesta centavos de Opus por lectura y un
//    endpoint público que la dispare sería una forma de gastar a nombre de
//    Mike. La conversación queda guardada y Mike la lee con un clic en Plano.
//
// Correos, teléfonos y documentos se tapan antes de guardar: la propuesta es
// un borrador interno y no necesita los datos que el visitante haya escrito.
//
// Importa `src/db`: solo servidor.

import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { appSettings } from '../../db/schema'
import { isUniqueViolation } from '../db-unique'
import { sendPush } from '../notify'
import { crearPropuesta, guardarConversacion, hoyCO } from '../plano/db'
import { configVacia } from '../plano/propuesta'
import { limpiarDatosPersonales } from '../asistente/limpieza'
import type { Conversacion, MensajeVivo } from './vivo-db'

const QUIEN: Record<MensajeVivo['autor'], string> = { visitante: 'Cliente', asesor: 'Asesor del sitio', mike: 'Mike' }

/** Lo mismo que acepta el "Leer el chat" de Plano. */
const MAX_CONVERSACION = 40_000

export const claveMarca = (conversacionId: number) => `asesor_propuesta_${conversacionId}`

/** La conversación como la lee Plano, sin datos personales. Pura. */
export function conversacionParaPlano(mensajes: Pick<MensajeVivo, 'autor' | 'texto'>[]): string {
  const texto = mensajes
    .map((m) => `${QUIEN[m.autor]}: ${limpiarDatosPersonales(m.texto).texto.trim()}`)
    .filter((l) => !l.endsWith(':'))
    .join('\n')
  return texto.length > MAX_CONVERSACION ? texto.slice(0, MAX_CONVERSACION) : texto
}

/** Título del borrador: la primera idea del visitante, corta y sin datos personales. Pura. */
export function tituloDesde(mensajes: Pick<MensajeVivo, 'autor' | 'texto'>[]): string {
  const primera = mensajes.find((m) => m.autor === 'visitante')?.texto ?? ''
  const limpia = limpiarDatosPersonales(primera).texto.replace(/\s+/g, ' ').trim()
  const corta = limpia.length > 70 ? `${limpia.slice(0, 70).trimEnd()}…` : limpia
  return corta ? `Del asesor: ${corta}` : 'Del asesor del sitio'
}

export type ResultadoEnvio = { propuestaId: number; nueva: boolean } | null

/**
 * Crea la propuesta de esta conversación, o devuelve la que ya existe.
 * null si no hay nada que guardar. Lanza solo si falla la base: el endpoint
 * responde igual (fail-open), el visitante sigue a WhatsApp sin enterarse.
 */
export async function enviarAPlano(conv: Conversacion, mensajes: MensajeVivo[], ahora = new Date()): Promise<ResultadoEnvio> {
  const conversacion = conversacionParaPlano(mensajes)
  if (!conversacion) return null
  const clave = claveMarca(conv.id)

  // Reclamar antes de crear: si la fila ya existe, otra petición llegó primero.
  try {
    await db.insert(appSettings).values({ key: clave, value: 'creando', updatedAt: ahora })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const [marca] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, clave)).limit(1)
    const id = Number(marca?.value)
    return Number.isInteger(id) && id > 0 ? { propuestaId: id, nueva: false } : null
  }

  try {
    const config = configVacia(hoyCO())
    config.titulo = tituloDesde(mensajes)
    // El asesor en inglés atiende a gente de fuera: Plano cotiza en dólares.
    config.moneda = conv.locale === 'en' ? 'USD' : 'COP'
    const p = await crearPropuesta(config)
    await guardarConversacion(p.id, conversacion)
    await db.update(appSettings).set({ value: String(p.id), updatedAt: new Date() }).where(eq(appSettings.key, clave))
    await sendPush('Pidió seguir por WhatsApp', 'Su conversación con el asesor quedó como propuesta en borrador en Plano.', {
      priority: 3,
      tags: 'memo',
      click: `https://codebymike.net/admin/plano/${p.id}`,
    }).catch(() => {})
    return { propuestaId: p.id, nueva: true }
  } catch (e) {
    // Se suelta la marca: el siguiente clic lo vuelve a intentar.
    await db.delete(appSettings).where(eq(appSettings.key, clave)).catch(() => {})
    throw e
  }
}
