import type { APIRoute } from 'astro'
import { listCvDownloads } from '../../../../lib/cv-downloads'

// Historial de descargas del CV para el panel LAB (protegido por el
// middleware admin, igual que security.ts).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const GET: APIRoute = async () => {
  const rows = await listCvDownloads()
  return json(200, { downloads: rows })
}
