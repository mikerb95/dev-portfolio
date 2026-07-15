#!/usr/bin/env node
/**
 * Puebla la base de la DEMO del panel con datos ficticios.
 *
 *   node scripts/seed-demo.mjs
 *
 * Lee TURSO_DEMO_URL / TURSO_DEMO_AUTH_TOKEN de .env. Aplica las migraciones de
 * drizzle/ y siembra clientes, proyectos, costos, finanzas, seguimiento,
 * monitores con 90 días de historial, corridas de CI y experimentos del LAB.
 *
 * Es IDEMPOTENTE: vacía las tablas que siembra antes de insertar, así que se
 * puede correr las veces que haga falta.
 *
 * Salvaguarda: se niega a correr si la URL destino coincide con TURSO_DATABASE_URL
 * (la base real). El aislamiento de la demo depende de que sean bases distintas.
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate as drizzleMigrate } from 'drizzle-orm/libsql/migrator'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const url = process.env.TURSO_DEMO_URL || env.TURSO_DEMO_URL
const authToken = process.env.TURSO_DEMO_AUTH_TOKEN || env.TURSO_DEMO_AUTH_TOKEN

if (!url) {
  console.error('✗ Falta TURSO_DEMO_URL (en .env o el entorno).')
  process.exit(1)
}
if (url === (process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL)) {
  console.error('✗ TURSO_DEMO_URL apunta a la base REAL. Abortado.')
  process.exit(1)
}

const db = createClient({ url, authToken })

const DAY = 86_400_000
const now = Date.now()
const sec = (ms) => Math.floor(ms / 1000)
const daysAgo = (d) => sec(now - d * DAY)
const daysAhead = (d) => sec(now + d * DAY)

// ── Esquema ─────────────────────────────────────────────────────────────────
/**
 * Deja la base como recién creada y aplica las migraciones con el migrador de
 * drizzle (el mismo de producción), que lleva su propio registro de lo aplicado.
 *
 * Se arrasa en vez de migrar incremental a propósito: algunas migraciones
 * incluyen pasos de datos que no toleran re-ejecución, y esta base es
 * desechable por definición. La salvaguarda de arriba ya garantizó que no es
 * la real.
 */
async function resetSchema() {
  const { rows } = await db.execute(
    `select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like 'libsql_%'`
  )
  if (rows.length) {
    await db.execute('pragma foreign_keys = off')
    for (const { name } of rows) await db.execute(`drop table if exists "${name}"`)
    await db.execute('pragma foreign_keys = on')
  }

  await drizzleMigrate(drizzle(db), { migrationsFolder: join(root, 'drizzle') })
  console.log(`✓ Esquema recreado y migrado (${rows.length} tablas previas eliminadas)`)
}

// ── Datos ficticios ─────────────────────────────────────────────────────────
const CLIENTS = [
  ['Cafetería Altiplano', 'gerencia@altiplano.example', 'Altiplano SAS', 'Cliente desde 2024. Pago puntual, decide rápido.'],
  ['Clínica Dental Nova', 'admin@dentalnova.example', 'Dental Nova IPS', 'Requiere facturación electrónica y reportes mensuales.'],
  ['Logística Andes', 'ti@andes.example', 'Andes Cargo Ltda', 'Equipo técnico propio; integramos con su ERP.'],
  ['Estudio Mora', 'hola@estudiomora.example', 'Estudio Mora', 'Proyecto pequeño, alcance cerrado.'],
]

const PROJECTS = [
  ['pedidos-altiplano', 'Portal de pedidos Altiplano', 'Tienda en línea con pagos y despacho por zonas.', 'Astro, Turso, Tailwind, Wompi', 'activo', 1, 120],
  ['agenda-nova', 'Agenda clínica Nova', 'Agendamiento con recordatorios por WhatsApp e historia clínica.', 'Next.js, Postgres, Twilio', 'activo', 2, 200],
  ['rutas-andes', 'Optimizador de rutas Andes', 'Planeación de rutas y seguimiento de flota en tiempo real.', 'Node, PostGIS, Mapbox', 'activo', 3, 90],
  ['portafolio-mora', 'Sitio de Estudio Mora', 'Portafolio con CMS liviano.', 'Astro, Sanity', 'completado', 4, 300],
]

const SERVICES = [
  [1, 1, 'Vercel Pro', 'hosting', 'vercel', 20, 'USD', 'monthly', 'me', 35, 18],
  [1, 1, 'Turso Scaler', 'database', 'turso', 9, 'USD', 'monthly', 'me', 15, 40],
  [1, 1, 'Dominio altiplano.co', 'domain', 'namecheap', 42000, 'COP', 'annual', 'client_reimbursable', null, 210],
  [2, 2, 'Neon Postgres', 'database', 'neon', 19, 'USD', 'monthly', 'me', 30, 12],
  [2, 2, 'Twilio WhatsApp', 'email', 'twilio', 25, 'USD', 'usage', 'client_direct', null, 5],
  [3, 3, 'Mapbox', 'cdn', 'mapbox', 50, 'USD', 'monthly', 'client_reimbursable', 50, 25],
  [3, 3, 'AWS EC2 t3.small', 'hosting', 'aws', 15, 'USD', 'monthly', 'me', 28, 60],
  [null, null, 'GitHub Team', 'repository', 'github', 4, 'USD', 'monthly', 'me', null, 150],
]

const FINANCES = [
  [1, 1, 'Anticipo 50% portal de pedidos', 4_500_000, 'cobrado', -60],
  [1, 1, 'Saldo final portal de pedidos', 4_500_000, 'pendiente', 12],
  [2, 2, 'Mensualidad soporte agenda', 1_200_000, 'cobrado', -20],
  [2, 2, 'Mensualidad soporte agenda', 1_200_000, 'pendiente', 8],
  [3, 3, 'Fase 1 optimizador de rutas', 6_800_000, 'cobrado', -35],
  [3, 3, 'Fase 2 optimizador de rutas', 7_500_000, 'proyectado', 45],
  [4, 4, 'Sitio Estudio Mora (cierre)', 2_100_000, 'cobrado', -90],
]

const INTERACTIONS = [
  ['meeting', 1, 1, 'Revisión de despacho por zonas', 'Piden agregar zona norte y franja horaria de entrega.', -3, 'Cotizar zona norte', 4, false],
  ['call', 2, 2, 'Recordatorios por WhatsApp', 'Confirman plantilla aprobada por Meta. Arrancamos el lunes.', -5, 'Configurar plantilla en Twilio', -1, false],
  ['note', 3, 3, 'Integración con ERP', 'Su ERP expone SOAP; evaluamos capa de traducción a REST.', -8, null, null, true],
  ['email', 1, 1, 'Envío de factura de anticipo', 'Factura enviada y radicada.', -60, null, null, true],
  ['task', 3, 3, 'Renovar certificado del staging', 'Vence pronto; renovar antes de la demo con el cliente.', -1, 'Renovar TLS staging', 2, false],
  ['meeting', 4, 4, 'Cierre de proyecto', 'Entregado y aceptado. Pendiente caso de estudio.', -88, null, null, true],
]

const MONITORS = [
  ['Portal Altiplano', 'https://pedidos.altiplano.example', 1, 'up', 180],
  ['Agenda Nova', 'https://agenda.dentalnova.example', 2, 'up', 240],
  ['API Rutas Andes', 'https://api.andes.example/health', 3, 'degraded', 1400],
  ['Estudio Mora', 'https://estudiomora.example', 4, 'up', 120],
]

async function seed() {
  await db.batch(
    CLIENTS.map((c) => ({
      sql: 'insert into clients (name, email, company, notes, created_at) values (?, ?, ?, ?, ?)',
      args: [...c, daysAgo(400)],
    }))
  )

  await db.batch(
    PROJECTS.map(([slug, title, description, stack, status, clientId, startedDaysAgo]) => ({
      sql: `insert into projects
        (slug, title, description, tech_stack, status, client_id, visible, start_date, created_at, internal_notes)
        values (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      args: [slug, title, description, stack, status, clientId, daysAgo(startedDaysAgo), daysAgo(startedDaysAgo), 'Datos de demostración.'],
    }))
  )

  await db.batch(
    SERVICES.map(([projectId, clientId, name, category, provider, cost, currency, cycle, payer, billed, renewIn]) => ({
      sql: `insert into project_services
        (project_id, client_id, name, category, provider, cost, currency, billing_cycle, payer,
         billed_to_client, renewal_date, active, auto_renew, created_at, notes)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      args: [projectId, clientId, name, category, provider, cost, currency, cycle, payer, billed,
             renewIn ? daysAhead(renewIn) : null, daysAgo(300), 'Servicio ficticio de la demo.'],
    }))
  )

  await db.batch(
    FINANCES.map(([projectId, clientId, description, amount, status, dueInDays]) => ({
      sql: 'insert into finances (project_id, client_id, description, amount, status, due_date, created_at) values (?, ?, ?, ?, ?, ?, ?)',
      args: [projectId, clientId, description, amount, status, daysAhead(dueInDays), daysAgo(Math.abs(dueInDays) + 5)],
    }))
  )

  await db.batch(
    INTERACTIONS.map(([type, clientId, projectId, title, body, occurredDaysAgo, nextAction, dueInDays, done]) => ({
      sql: `insert into interactions
        (type, client_id, project_id, title, body, occurred_at, next_action, due_date, done, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [type, clientId, projectId, title, body, daysAgo(Math.abs(occurredDaysAgo)), nextAction,
             dueInDays === null ? null : daysAhead(dueInDays), done ? 1 : 0, daysAgo(Math.abs(occurredDaysAgo))],
    }))
  )

  await db.batch(
    MONITORS.map(([name, url, projectId, status, ms]) => ({
      sql: `insert into monitors
        (name, url, project_id, last_status, last_response_ms, last_checked_at, ssl_expires_at,
         active, paused, created_at)
        values (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
      args: [name, url, projectId, status, ms, sec(now - 120_000), daysAhead(60), daysAgo(120)],
    }))
  )

  // 90 días × 24 checks por monitor. Uptime alto con una caída sembrada en el
  // monitor 3 para que el error budget y los incidentes no salgan vacíos.
  const checks = []
  for (let m = 1; m <= MONITORS.length; m++) {
    const baseMs = MONITORS[m - 1][4]
    for (let d = 89; d >= 0; d--) {
      for (let h = 0; h < 24; h += 2) {
        const at = sec(now - d * DAY - h * 3_600_000)
        const downtime = m === 3 && d === 12 && h >= 6 && h <= 10
        const ok = !downtime && Math.random() > 0.004
        checks.push({
          sql: 'insert into monitor_checks (monitor_id, at, ok, status_code, response_ms, error) values (?, ?, ?, ?, ?, ?)',
          args: [m, at, ok ? 1 : 0, ok ? 200 : 503, ok ? Math.round(baseMs * (0.7 + Math.random() * 0.8)) : null,
                 ok ? null : 'connection timeout'],
        })
      }
    }
  }
  for (let i = 0; i < checks.length; i += 200) await db.batch(checks.slice(i, i + 200))

  await db.execute({
    sql: `insert into monitor_incidents (monitor_id, started_at, resolved_at, duration_sec, cause, created_at)
          values (?, ?, ?, ?, ?, ?)`,
    args: [3, sec(now - 12 * DAY - 10 * 3_600_000), sec(now - 12 * DAY - 6 * 3_600_000), 4 * 3600,
           'Timeout del proveedor de mapas', sec(now - 12 * DAY)],
  })

  const shas = ['a1b2c3d', '4e5f6a7', '8b9c0d1', '2e3f4a5', '6b7c8d9', '0e1f2a3', '4b5c6d7']
  await db.batch(
    shas.map((sha, i) => ({
      sql: `insert into ci_runs (sha, branch, conclusion, tests_passed, tests_failed, coverage_pct,
            duration_ms, health_ok, created_at)
            values (?, 'main', ?, ?, ?, ?, ?, ?, ?)`,
      args: [sha + 'e8f9a0b1c2d3', i === 4 ? 'rolled_back' : 'success', 286, i === 4 ? 2 : 0,
             55 + i * 0.2, 90_000 + i * 12_000, i === 4 ? 0 : 1, daysAgo(i * 2 + 1)],
    }))
  )

  await db.batch([
    ['chaos:db_fail_midtx', 1, -1],
    ['payments:double_click', 1, -3],
    ['payments:duplicate_webhook', 1, -3],
    ['payments:out_of_order', 1, -3],
    ['payments:race_condition', 1, -3],
  ].map(([kind, ok, d]) => ({
    sql: 'insert into lab_experiments (kind, ok, result, ran_at) values (?, ?, ?, ?)',
    args: [kind, ok, JSON.stringify({ demo: true }), daysAgo(Math.abs(d))],
  })))

  await db.batch([
    { sql: 'insert into app_settings (key, value, updated_at) values (?, ?, ?)', args: ['fx_COP_per_USD', '3401.62', sec(now)] },
    { sql: 'insert into app_settings (key, value, updated_at) values (?, ?, ?)', args: ['fx_EUR_per_USD', '0.8783', sec(now)] },
  ])

  console.log(`✓ Datos sembrados: ${CLIENTS.length} clientes · ${PROJECTS.length} proyectos · ` +
              `${SERVICES.length} servicios · ${MONITORS.length} monitores · ${checks.length} checks`)
}

await resetSchema()
await seed()
console.log(`✓ Demo lista en ${url.replace(/\/\/.*@/, '//')}`)
db.close()
