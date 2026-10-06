import type { APIRoute } from 'astro'
import { guardarHoras, propuesta, snapshotDe, version } from '../../../../../lib/plano/db'

// Horas reales por componente de una propuesta aceptada (fase "aprende"). El
// estimado se copia de la versión ACEPTADA, no se recibe del navegador: es la
// mitad de la comparación y no puede venir de quien anota la otra mitad.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const POST: APIRoute = async ({ params, request }) => {
  const id = Number(params.id)
  const p = Number.isInteger(id) ? await propuesta(id) : null
  if (!p) return json(404, { error: 'propuesta no encontrada' })
  if (!p.aceptadaVersion) return json(409, { error: 'solo se anotan horas de una propuesta aceptada' })
  const v = await version(p.id, p.aceptadaVersion)
  if (!v) return json(409, { error: 'no se encontró la versión aceptada' })
  const s = snapshotDe(v)

  let data: { filas?: unknown }
  try {
    data = (await request.json()) as { filas?: unknown }
  } catch {
    return json(400, { error: 'JSON inválido' })
  }
  const filas = (Array.isArray(data.filas) ? data.filas : [])
    .map((f) => f as { componenteId?: unknown; reales?: unknown })
    .map((f) => {
      const linea = s.lineas.find((l) => l.incluida && l.id === f.componenteId)
      const reales = Number(f.reales)
      return linea && Number.isFinite(reales) && reales >= 0 && reales <= 2000 ? { componenteId: linea.id, estimadas: linea.horas[1], reales } : null
    })
    .filter((f): f is { componenteId: string; estimadas: number; reales: number } => f !== null)

  await guardarHoras(p.id, filas)
  return json(200, { ok: true, guardadas: filas.length })
}
