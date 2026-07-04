import type { APIRoute } from 'astro'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { chaosFlags } from '../../../../../db/schema'
import { CHAOS_KINDS, MAX_LATENCY_MS, clampExpiry, invalidateChaosCache, isProtectedRoute, type ChaosKind } from '../../../../../lib/chaos'

// Gestión de flags de caos (protegido por el middleware admin).
// GET: lista · POST: crear · DELETE: PÁNICO (apaga todo) o ?id= apaga uno.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const GET: APIRoute = async () => {
  const rows = await db.select().from(chaosFlags).orderBy(desc(chaosFlags.createdAt)).limit(30)
  return json(200, rows)
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }

  const kind = String(body.kind ?? '') as ChaosKind
  if (!CHAOS_KINDS.includes(kind)) return json(400, { error: `kind debe ser uno de: ${CHAOS_KINDS.join(', ')}` })

  const targetRoute = String(body.targetRoute ?? '').trim()
  if (!targetRoute.startsWith('/')) return json(400, { error: 'targetRoute debe empezar con /' })
  if (isProtectedRoute(targetRoute.replace(/\*$/, ''))) {
    return json(400, { error: 'las rutas de admin/auth están protegidas contra caos' })
  }

  const param = kind === 'latency' ? Math.min(Math.max(Number(body.param) || 2000, 100), MAX_LATENCY_MS) : null
  const expiresAt = clampExpiry(Number(body.ttlSeconds) || 300)

  const [row] = await db
    .insert(chaosFlags)
    .values({ kind, targetRoute, param, active: true, expiresAt, createdAt: new Date() })
    .returning()

  invalidateChaosCache()
  return json(201, row)
}

export const DELETE: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id')
  if (id) {
    await db.update(chaosFlags).set({ active: false }).where(eq(chaosFlags.id, Number(id)))
  } else {
    // PÁNICO: apaga todos los flags de un golpe.
    await db.update(chaosFlags).set({ active: false }).where(eq(chaosFlags.active, true))
  }
  invalidateChaosCache()
  return json(200, { ok: true, panic: !id })
}
