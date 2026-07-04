import type { APIRoute } from 'astro'
import { sql } from 'drizzle-orm'
import { db } from '../../db'

// Health check público: lo consume el pipeline de CI tras cada deploy para
// decidir si la versión nueva está sana o hay que hacer rollback.
// Devuelve el sha del commit desplegado (VERCEL_GIT_COMMIT_SHA) para que el
// pipeline pueda esperar a que SU deploy esté activo antes de evaluar.
export const GET: APIRoute = async () => {
  const started = Date.now()
  let dbOk = false
  let dbError: string | null = null
  try {
    await db.run(sql`select 1`)
    dbOk = true
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'error'
  }

  const ok = dbOk
  const body = {
    ok,
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    env: process.env.VERCEL_ENV ?? 'local',
    region: process.env.VERCEL_REGION ?? null,
    checks: {
      db: { ok: dbOk, ms: Date.now() - started, error: dbError },
    },
    ts: new Date().toISOString(),
  }

  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
