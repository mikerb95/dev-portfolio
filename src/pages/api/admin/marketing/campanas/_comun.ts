import type { CampanaContenido } from '../../../../../lib/marketing/contenido'

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Lee el cuerpo de la campaña del request; null si no es un objeto JSON. */
export async function leerContenido(request: Request): Promise<CampanaContenido | null> {
  let d: unknown
  try {
    d = await request.json()
  } catch {
    return null
  }
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>
  return {
    asunto: texto(o.asunto),
    preheader: texto(o.preheader),
    titulo: texto(o.titulo),
    cuerpo: texto(o.cuerpo),
    botonTexto: texto(o.botonTexto),
    botonUrl: texto(o.botonUrl),
  }
}
