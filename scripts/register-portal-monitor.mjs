#!/usr/bin/env node
/**
 * Da de alta (o actualiza) el monitor del portal de clientes en la tabla
 * `monitors`, para que el portal aparezca en /status como un servicio más.
 *
 *   node scripts/register-portal-monitor.mjs            # → TURSO_DATABASE_URL
 *   MONITOR_TARGET_URL=file:/tmp/x.db node scripts/register-portal-monitor.mjs
 *
 * IMPORTANTE — orden de operaciones: correr esto ANTES de desplegar el endpoint
 * `/api/portal/health` crea un monitor que sondea una ruta que todavía no
 * existe. El primer chequeo daría 404 → caída → incidente abierto y push a
 * ntfy. Desplegar primero, dar de alta después.
 *
 * Es IDEMPOTENTE: identifica el monitor por su URL. Si ya existe, actualiza sus
 * parámetros en vez de duplicarlo.
 *
 * Alternativa sin script: el mismo alta se puede hacer desde /admin/monitors
 * rellenando el formulario con estos mismos valores.
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let env = {}
try {
  env = Object.fromEntries(
    readFileSync(join(root, '.env'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
} catch {
  // Sin .env local; se usa solo el entorno.
}

const url = process.env.MONITOR_TARGET_URL || process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL
const authToken =
  process.env.MONITOR_TARGET_TOKEN || process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN

if (!url) {
  console.error('✗ Falta TURSO_DATABASE_URL (o MONITOR_TARGET_URL).')
  process.exit(1)
}

const SITE = process.env.MONITOR_SITE_URL || 'https://codebymike.tech'

const MONITOR = {
  name: 'Portal de clientes',
  url: `${SITE}/api/portal/health`,
  method: 'GET',
  expected_status: 200,
  // Un 200 con el cuerpo equivocado (una página de error servida por el borde,
  // un rewrite mal puesto) contaría como "arriba" sin este texto. El endpoint
  // devuelve `"ok":true` solo cuando todos sus chequeos pasan; si alguno falla
  // responde 503, que ya se detecta por status.
  expected_text: '"ok":true',
  // El endpoint hace dos consultas a Turso: 2 s es holgado para eso y estrecho
  // para un cliente esperando su factura.
  latency_threshold_ms: 2000,
  interval_min: 5,
}

const client = createClient(authToken ? { url, authToken } : { url })

try {
  const existing = await client.execute({
    sql: 'select id, name from monitors where url = ? limit 1',
    args: [MONITOR.url],
  })

  const now = Math.floor(Date.now() / 1000)

  if (existing.rows.length > 0) {
    const id = existing.rows[0].id
    await client.execute({
      sql: `update monitors
              set name = ?, method = ?, expected_status = ?, expected_text = ?,
                  latency_threshold_ms = ?, interval_min = ?, active = 1, paused = 0,
                  updated_at = ?
            where id = ?`,
      args: [
        MONITOR.name,
        MONITOR.method,
        MONITOR.expected_status,
        MONITOR.expected_text,
        MONITOR.latency_threshold_ms,
        MONITOR.interval_min,
        now,
        id,
      ],
    })
    console.log(`✓ Monitor actualizado (id ${id}): ${MONITOR.name} → ${MONITOR.url}`)
  } else {
    await client.execute({
      sql: `insert into monitors
              (project_id, name, url, method, expected_status, expected_text,
               latency_threshold_ms, interval_min, active, paused, last_status,
               created_at, updated_at)
            values (null, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'unknown', ?, ?)`,
      args: [
        MONITOR.name,
        MONITOR.url,
        MONITOR.method,
        MONITOR.expected_status,
        MONITOR.expected_text,
        MONITOR.latency_threshold_ms,
        MONITOR.interval_min,
        now,
        now,
      ],
    })
    console.log(`✓ Monitor creado: ${MONITOR.name} → ${MONITOR.url}`)
  }

  console.log('  El primer chequeo llega con el próximo disparo del cron (~5 min).')
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
} finally {
  client.close()
}
