// Contadores de AEO: visitas de agentes de IA y referidos de asistentes.
//
// Lo que esto NO ve, para no leer de más las cifras del panel: las páginas
// prerenderizadas (las notas, /paginas-web, /docs) las sirve el CDN y nunca
// pasan por el middleware, y las SSR que la CDN responde desde caché tampoco.
// El conteo de bots es un piso, no un total. Los referidos sí son completos:
// los cuenta el navegador del visitante en cualquier página.
//
// Fail-open: un contador que falla no puede costarle la respuesta a nadie.

import { desc, gte, sql } from 'drizzle-orm'
import { waitUntil as vercelWaitUntil } from '@vercel/functions'
import { db } from '../../db'
import { aeoDiario } from '../../db/schema'
import type { FilaAeo, TipoConteo } from './resumen'

const hoy = (ahora = new Date()) => ahora.toISOString().slice(0, 10)

export const esRutaLlms = (canonicalPath: string) => canonicalPath === '/llms.txt' || canonicalPath === '/llms-full.txt'

export async function contar(input: { tipo: TipoConteo; fuente: string; llms?: boolean }, ahora = new Date()): Promise<void> {
  const llms = input.llms ? 1 : 0
  try {
    await db
      .insert(aeoDiario)
      .values({ dia: hoy(ahora), tipo: input.tipo, fuente: input.fuente, hits: 1, hitsLlms: llms })
      .onConflictDoUpdate({
        target: [aeoDiario.dia, aeoDiario.tipo, aeoDiario.fuente],
        set: { hits: sql`${aeoDiario.hits} + 1`, hitsLlms: sql`${aeoDiario.hitsLlms} + ${llms}` },
      })
  } catch {
    // Fail-open.
  }
}

/**
 * Versión sin esperar para el middleware. Como en el sensor del SIEM, el
 * adapter de Astro no da waitUntil y sin el de @vercel/functions la escritura
 * podía morir al congelarse la función tras responder.
 */
export function contarSinEsperar(input: { tipo: TipoConteo; fuente: string; llms?: boolean }): void {
  const promesa = contar(input)
  try {
    vercelWaitUntil(promesa)
  } catch {
    // Fuera de Vercel no hay contexto; la promesa sigue igual.
  }
}

/** Los últimos `dias` días. Lee como mucho dias × fuentes filas (unas decenas). */
export async function leerUltimosDias(dias = 30, ahora = new Date()): Promise<FilaAeo[]> {
  const desde = hoy(new Date(ahora.getTime() - (dias - 1) * 86_400_000))
  try {
    return await db
      .select({
        dia: aeoDiario.dia,
        tipo: aeoDiario.tipo,
        fuente: aeoDiario.fuente,
        hits: aeoDiario.hits,
        hitsLlms: aeoDiario.hitsLlms,
      })
      .from(aeoDiario)
      .where(gte(aeoDiario.dia, desde))
      .orderBy(desc(aeoDiario.dia))
  } catch {
    return []
  }
}
