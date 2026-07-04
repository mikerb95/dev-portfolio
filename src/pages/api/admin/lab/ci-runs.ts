import type { APIRoute } from 'astro'
import { desc } from 'drizzle-orm'
import { db } from '../../../../db'
import { ciRuns } from '../../../../db/schema'

/** Últimos runs del pipeline para el panel LAB (protegido por el middleware admin). */
export const GET: APIRoute = async () => {
  const rows = await db.select().from(ciRuns).orderBy(desc(ciRuns.createdAt)).limit(50)
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
