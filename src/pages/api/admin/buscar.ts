import type { APIRoute } from 'astro'
import { buscarEnPanel } from '../../../lib/asistente/buscar-db'

// Búsqueda instantánea de la caja del dashboard y de Ctrl+K: páginas del panel
// y fichas de la base, sin IA y sin costo. Protegido por el middleware de
// /api/admin; en la demo responde con la base de la demo.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Nombres de clientes y números de cuentas: nunca en caché.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  if (q.length < 2) return json(200, { resultados: [] })
  try {
    const resultados = await buscarEnPanel(q, 8)
    return json(200, { resultados: resultados.map(({ puntaje: _, ...r }) => r) })
  } catch {
    // Accesorio: si la base no responde, la caja sigue sirviendo para preguntar.
    return json(200, { resultados: [], error: true })
  }
}
