import type { APIRoute } from 'astro'
import { db } from '../../../db'
import { monitors, monitorChecks, monitorIncidents, appSettings } from '../../../db/schema'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { getSession } from 'auth-astro/server'
import { probe, fetchSslExpiry } from '../../../lib/monitors'
import { domainAlertState, daysUntil, type DomainAlertState } from '../../../lib/domains'
import { sendEmail, sendPush } from '../../../lib/notify'
import { isAllowedLogin } from '../../../lib/auth'
import { sweepSessions } from '../../../lib/device-sessions'

const CRON_SECRET = import.meta.env.CRON_SECRET
const SITE_URL = import.meta.env.AUTH_URL ?? 'https://codebymike.tech'

const SEVERITY: Record<DomainAlertState, number> = { ok: 0, soon: 1, critical: 2, overdue: 3 }
const SSL_REFRESH_MS = 12 * 60 * 60 * 1000 // refresca SSL como máximo cada 12h
const CHECK_RETENTION_DAYS = 90

type Event =
  | { kind: 'down'; name: string; error: string }
  | { kind: 'recovery'; name: string; downSec: number }
  | { kind: 'ssl'; name: string; days: number }

const fmtDuration = (sec: number) => {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}min`
  if (sec < 86400) return `${Math.round((sec / 3600) * 10) / 10}h`
  return `${Math.round((sec / 86400) * 10) / 10}d`
}

async function runCheck() {
  const rows = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.active, true), eq(monitors.paused, false)))

  const events: Event[] = []
  const now = new Date()

  for (const m of rows) {
    const outcome = await probe({
      url: m.url,
      method: m.method,
      expectedStatus: m.expectedStatus,
      expectedText: m.expectedText,
      latencyThresholdMs: m.latencyThresholdMs,
    })

    // 1) Registrar el sondeo.
    await db.insert(monitorChecks).values({
      monitorId: m.id,
      at: now,
      ok: outcome.ok,
      statusCode: outcome.statusCode,
      responseMs: outcome.responseMs,
      error: outcome.error,
    })

    // 2) ¿Refrescar SSL? (caro: socket TLS) solo si toca.
    let sslExpiresAt = m.sslExpiresAt ?? null
    let sslCheckedAt = m.sslCheckedAt ?? null
    if (!sslCheckedAt || now.getTime() - sslCheckedAt.getTime() > SSL_REFRESH_MS) {
      const exp = await fetchSslExpiry(m.url)
      sslCheckedAt = now
      if (exp) sslExpiresAt = exp
    }

    // 3) Materializar estado del monitor.
    await db
      .update(monitors)
      .set({
        lastStatus: outcome.state,
        lastCheckedAt: now,
        lastResponseMs: outcome.responseMs,
        sslExpiresAt,
        sslCheckedAt,
        updatedAt: now,
      })
      .where(eq(monitors.id, m.id))

    // 4) Gestión de incidentes (un fallo abre, un éxito cierra).
    const [open] = await db
      .select()
      .from(monitorIncidents)
      .where(and(eq(monitorIncidents.monitorId, m.id), isNull(monitorIncidents.resolvedAt)))
      .limit(1)

    if (!outcome.ok) {
      if (!open) {
        await db.insert(monitorIncidents).values({
          monitorId: m.id,
          startedAt: now,
          cause: outcome.error,
          lastError: outcome.error,
          createdAt: now,
        })
        events.push({ kind: 'down', name: m.name, error: outcome.error ?? 'caída' })
      } else if (outcome.error && outcome.error !== open.lastError) {
        await db.update(monitorIncidents).set({ lastError: outcome.error }).where(eq(monitorIncidents.id, open.id))
      }
    } else if (open) {
      const durationSec = Math.round((now.getTime() - open.startedAt.getTime()) / 1000)
      await db.update(monitorIncidents).set({ resolvedAt: now, durationSec }).where(eq(monitorIncidents.id, open.id))
      events.push({ kind: 'recovery', name: m.name, downSec: durationSec })
    }

    // 5) Alerta de SSL (dedup por bucket en app_settings, igual que dominios).
    const sslState = domainAlertState(sslExpiresAt)
    const key = `ssl_alert:${m.id}`
    if (sslState && sslState !== 'ok') {
      const [prev] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
      const worsened = !prev || SEVERITY[sslState] > (SEVERITY[(prev.value as DomainAlertState) ?? 'ok'] ?? 0)
      if (worsened) events.push({ kind: 'ssl', name: m.name, days: Math.round(daysUntil(sslExpiresAt!)) })
      await db
        .insert(appSettings)
        .values({ key, value: sslState, updatedAt: now })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: sslState, updatedAt: now } })
    } else {
      await db.delete(appSettings).where(eq(appSettings.key, key))
    }
  }

  // 6) Purga de historial viejo.
  const cutoff = new Date(now.getTime() - CHECK_RETENTION_DAYS * 86_400_000)
  await db.delete(monitorChecks).where(lt(monitorChecks.at, cutoff))

  // 6b) Sesiones de admin: revoca inactivas (>24h) y purga revocadas viejas.
  // Fail-open: un fallo aquí no debe tumbar el chequeo de monitores.
  await sweepSessions(now).catch((e) => console.error('[uptime-check] sweepSessions', e))

  // 7) Notificar (solo transiciones, no cada sondeo).
  if (events.length === 0) {
    return { ok: true, monitors: rows.length, events: 0 }
  }
  await notify(events)
  return { ok: true, monitors: rows.length, events: events.length }
}

async function notify(events: Event[]) {
  const downs = events.filter((e): e is Extract<Event, { kind: 'down' }> => e.kind === 'down')
  const recoveries = events.filter((e): e is Extract<Event, { kind: 'recovery' }> => e.kind === 'recovery')
  const ssls = events.filter((e): e is Extract<Event, { kind: 'ssl' }> => e.kind === 'ssl')

  const lines: string[] = []
  for (const e of downs) lines.push(`🔴 ${e.name} CAÍDO — ${e.error}`)
  for (const e of recoveries) lines.push(`🟢 ${e.name} recuperado (caído ${fmtDuration(e.downSec)})`)
  for (const e of ssls) lines.push(`⚠ SSL de ${e.name} ${e.days < 0 ? `vencido hace ${Math.abs(e.days)}d` : `vence en ${e.days}d`}`)

  const subject =
    downs.length > 0
      ? `🔴 ${downs.length} servicio${downs.length === 1 ? '' : 's'} caído${downs.length === 1 ? '' : 's'}`
      : recoveries.length > 0
        ? `🟢 ${recoveries.length} servicio${recoveries.length === 1 ? '' : 's'} recuperado${recoveries.length === 1 ? '' : 's'}`
        : `⚠ Alerta de certificados SSL`

  const text = `${subject}\n\n${lines.join('\n')}\n\nPanel: ${SITE_URL}/admin/monitors`
  const html = `<h2 style="font-family:system-ui">Estado de servicios</h2><ul style="font-family:system-ui;font-size:14px">${lines
    .map((l) => `<li>${l}</li>`)
    .join('')}</ul><p><a href="${SITE_URL}/admin/monitors">Abrir panel →</a></p>`

  await Promise.all([
    sendEmail(subject, text, html),
    sendPush(subject, lines.join('\n'), {
      priority: downs.length > 0 ? 5 : 4,
      tags: downs.length > 0 ? 'rotating_light' : recoveries.length > 0 ? 'white_check_mark' : 'warning',
      click: `${SITE_URL}/admin/monitors`,
    }),
  ])
}

// Disparado por cron-job.org (o Vercel cron) con GET + Authorization: Bearer CRON_SECRET.
export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runCheck()), { status: 200 })
  } catch (err) {
    console.error('[uptime-check]', err)
    return new Response(JSON.stringify({ error: 'chequeo fallido' }), { status: 500 })
  }
}

// Disparo manual desde /admin/monitors (fuera del middleware de /api/admin → validamos sesión aquí).
export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || (login && !isAllowedLogin(login))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await runCheck()), { status: 200 })
  } catch (err) {
    console.error('[uptime-check]', err)
    return new Response(JSON.stringify({ error: 'chequeo fallido' }), { status: 500 })
  }
}
