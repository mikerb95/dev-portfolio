import type { APIRoute } from 'astro'
import { db } from '../../../db'
import { projectServices, appSettings } from '../../../db/schema'
import { and, eq, isNotNull } from 'drizzle-orm'
import { getSession } from 'auth-astro/server'
import { domainAlertState, daysUntil, type DomainAlertState } from '../../../lib/domains'
import { sendEmail, sendPush } from '../../../lib/notify'
import { isAllowedLogin } from '../../../lib/auth'

const CRON_SECRET = import.meta.env.CRON_SECRET
const SITE_URL = import.meta.env.AUTH_URL ?? 'https://codebymike.tech'

// Orden de severidad para decidir si un dominio "empeoró" desde el último aviso.
const SEVERITY: Record<DomainAlertState, number> = { ok: 0, soon: 1, critical: 2, overdue: 3 }

type Alert = { id: number; name: string; date: Date; state: DomainAlertState; days: number }

async function buildAlerts(): Promise<Alert[]> {
  const rows = await db
    .select({
      id: projectServices.id,
      name: projectServices.name,
      renewalDate: projectServices.renewalDate,
    })
    .from(projectServices)
    .where(and(eq(projectServices.category, 'domain'), eq(projectServices.active, true), isNotNull(projectServices.renewalDate)))

  const alerts: Alert[] = []
  for (const r of rows) {
    if (!r.renewalDate) continue
    const state = domainAlertState(r.renewalDate)
    if (state && state !== 'ok') {
      alerts.push({ id: r.id, name: r.name, date: r.renewalDate, state, days: Math.round(daysUntil(r.renewalDate)) })
    }
  }
  return alerts.sort((a, b) => a.date.getTime() - b.date.getTime())
}

const fmtDate = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const stateLabel = (a: Alert) =>
  a.state === 'overdue' ? `vencido hace ${Math.abs(a.days)}d` : `vence en ${a.days}d (${fmtDate(a.date)})`

/**
 * Revisa dominios y notifica. `force` ignora la deduplicación (para pruebas manuales).
 * Deduplica guardando el último estado notificado por dominio en app_settings:
 * solo avisa cuando el dominio entra en alerta o empeora de bucket.
 */
async function runCheck(force = false) {
  const alerts = await buildAlerts()
  const settings = await db.select().from(appSettings)
  const lastByKey = new Map(settings.map((s) => [s.key, s.value]))

  const toNotify: Alert[] = []
  for (const a of alerts) {
    const key = `domain_alert:${a.id}`
    const prev = lastByKey.get(key) as DomainAlertState | undefined
    const worsened = !prev || SEVERITY[a.state] > (SEVERITY[prev] ?? 0)
    if (force || worsened) toNotify.push(a)
  }

  // Persistir el estado actual de cada dominio en alerta (también resetea los que mejoraron).
  const seen = new Set(alerts.map((a) => `domain_alert:${a.id}`))
  for (const a of alerts) {
    const key = `domain_alert:${a.id}`
    await db
      .insert(appSettings)
      .values({ key, value: a.state, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: a.state, updatedAt: new Date() } })
  }
  // Limpia marcas de dominios que ya no están en alerta.
  for (const s of settings) {
    if (s.key.startsWith('domain_alert:') && !seen.has(s.key)) {
      await db.delete(appSettings).where(eq(appSettings.key, s.key))
    }
  }

  if (toNotify.length === 0) {
    return { ok: true, total: alerts.length, notified: 0, results: [] as unknown[] }
  }

  const critical = toNotify.filter((a) => a.state === 'overdue' || a.state === 'critical').length
  const subject = `⚠ ${toNotify.length} dominio${toNotify.length === 1 ? '' : 's'} por vencer`
  const lines = toNotify.map((a) => `• ${a.name} — ${stateLabel(a)}`)
  const text = `${subject}\n\n${lines.join('\n')}\n\nRevisa: ${SITE_URL}/admin/domains`
  const html = `<h2 style="font-family:system-ui">Vencimiento de dominios</h2><ul style="font-family:system-ui;font-size:14px">${toNotify
    .map((a) => `<li><strong>${a.name}</strong> — ${stateLabel(a)}</li>`)
    .join('')}</ul><p><a href="${SITE_URL}/admin/domains">Abrir panel de dominios →</a></p>`

  const [email, push] = await Promise.all([
    sendEmail(subject, text, html),
    sendPush(subject, lines.join('\n'), {
      priority: critical > 0 ? 5 : 4,
      tags: 'warning,calendar',
      click: `${SITE_URL}/admin/domains`,
    }),
  ])

  return { ok: true, total: alerts.length, notified: toNotify.length, results: [email, push] }
}

// Disparado por Vercel cron (Authorization: Bearer CRON_SECRET).
export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runCheck(false)), { status: 200 })
  } catch (err) {
    console.error('[domain-check]', err)
    return new Response(JSON.stringify({ error: 'chequeo fallido' }), { status: 500 })
  }
}

// Disparo manual desde /admin/domains. Esta ruta queda fuera del middleware de /api/admin,
// así que validamos la sesión aquí mismo. `force` envía aunque no haya empeorado.
export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || (login && !isAllowedLogin(login))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runCheck(true)), { status: 200 })
  } catch (err) {
    console.error('[domain-check]', err)
    return new Response(JSON.stringify({ error: 'chequeo fallido' }), { status: 500 })
  }
}
