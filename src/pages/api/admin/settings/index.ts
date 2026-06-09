import type { APIRoute } from 'astro'
import { db } from '../../../../db'
import { appSettings } from '../../../../db/schema'

// Upsert de configuración clave-valor (tasas FX, moneda base, etc.)
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const settings = body?.settings ?? body ?? {}
  if (typeof settings !== 'object') {
    return new Response(JSON.stringify({ error: 'settings inválido' }), { status: 400 })
  }

  for (const [key, raw] of Object.entries(settings)) {
    if (typeof key !== 'string' || !key) continue
    const value = raw == null || String(raw).trim() === '' ? null : String(raw).trim()
    await db.insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
