import type { APIRoute } from 'astro'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { senaEpRecordatorios } from '../../../db/schema'
import type { TipoPrograma } from '../../../lib/sena-ep'

// Suscripción a recordatorios de la calculadora de etapa productiva SENA
// (/ep). Personal: envía siempre al `ALERT_EMAIL_TO` de `notify.ts`, no
// recolecta el email de nadie más. Por eso vive bajo /api/admin/ - el
// middleware ya exige sesión aquí.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const isTipo = (v: unknown): v is TipoPrograma => v === 'tecnico' || v === 'tecnologo'
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Suscripción activa más reciente, si hay alguna. */
export const GET: APIRoute = async () => {
  const [row] = await db
    .select()
    .from(senaEpRecordatorios)
    .where(eq(senaEpRecordatorios.active, true))
    .orderBy(desc(senaEpRecordatorios.id))
    .limit(1)
  return json(200, row ?? null)
}

/** Crea o reemplaza la suscripción activa (`{ tipo, inicio, diasAntes? }`). */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  if (!isTipo(body?.tipo) || !isIsoDate(body?.inicio)) {
    return json(400, { error: 'tipo o inicio inválidos' })
  }
  const diasAntes = Number.isInteger(body?.diasAntes) && body.diasAntes > 0 ? body.diasAntes : 3

  // Solo una suscripción activa a la vez: desactivar cualquier otra evita que
  // el cron mande el mismo aviso duplicado por dos filas.
  await db.update(senaEpRecordatorios).set({ active: false }).where(eq(senaEpRecordatorios.active, true))
  await db.insert(senaEpRecordatorios).values({
    tipo: body.tipo,
    inicio: body.inicio,
    diasAntes,
    notifiedKeys: '[]',
    active: true,
    createdAt: new Date(),
  })
  return json(200, { ok: true })
}

/** Cancela la suscripción activa. */
export const DELETE: APIRoute = async () => {
  await db.update(senaEpRecordatorios).set({ active: false }).where(eq(senaEpRecordatorios.active, true))
  return json(200, { ok: true })
}
