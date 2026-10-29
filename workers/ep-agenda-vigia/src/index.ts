// Vigía de cada minuto de la agenda del instructor de etapa productiva.
//
// POR QUÉ VIVE EN CLOUDFLARE Y NO EN VERCEL: revisar Bookings cada minuto desde
// Vercel son ~43.000 ejecuciones al mes que pasan por el middleware y por Turso,
// y la cuota gratis de CPU de Vercel ya va justa. Aquí el cron de un minuto es
// gratis y el tiempo esperando a Bookings (~11 s) no cuenta como CPU. El Worker
// solo pregunta "¿cambiaron las citas libres?" y, si cambiaron, llama al
// endpoint de Vercel, que hace la corrida completa (bitácora, avisos, estado)
// con su propia consulta. Eso pasa unas pocas veces por semana.
//
// El job de 10 min de cron-job.org sigue llamando a Vercel: es el respaldo si
// este Worker se cae, y el que alimenta la bitácora de crons y el detector de
// silencio.
//
// Toda la lógica de decisión es la del módulo puro del sitio, importada tal
// cual: un solo criterio de "libre" para el Worker y para Vercel.
import {
  CLAVE_VIGIA,
  URL_DISPONIBILIDAD,
  cambiaronLibres,
  citasLibres,
  cuerpoDisponibilidad,
  parseDisponibilidad,
  type EstadoAgenda,
} from '../../../src/lib/ep-agenda'

type Env = {
  TURSO_URL: string
  TURSO_TOKEN: string
  CRON_SECRET: string
  ENDPOINT_VERCEL: string
}

// Tipos mínimos del runtime de Workers, para no arrastrar @cloudflare/workers-types
// al type-check del sitio (el tsconfig raíz incluye todo el repo).
type Ctx = { waitUntil(p: Promise<unknown>): void }

const TIMEOUT_BOOKINGS_MS = 25_000
const TIMEOUT_VERCEL_MS = 30_000

/** Una sentencia contra la API HTTP de Turso (v2/pipeline), sin cliente. */
async function turso(env: Env, sql: string, args: string[] = []): Promise<string | null> {
  const base = env.TURSO_URL.replace(/^libsql:\/\//, 'https://')
  const res = await fetch(`${base}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map((value) => ({ type: 'text', value })) } },
        { type: 'close' },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}`)
  const json = (await res.json()) as {
    results?: { type: string; error?: { message?: string }; response?: { result?: { rows?: { value?: string }[][] } } }[]
  }
  const r = json.results?.[0]
  if (r?.type !== 'ok') throw new Error(`Turso: ${r?.error?.message ?? 'respuesta inesperada'}`)
  return r.response?.result?.rows?.[0]?.[0]?.value ?? null
}

async function llamarVercel(env: Env): Promise<void> {
  const res = await fetch(env.ENDPOINT_VERCEL, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(TIMEOUT_VERCEL_MS),
  })
  console.log('vercel', res.status, await res.text().catch(() => ''))
}

async function vigilar(env: Env, ahora: number): Promise<void> {
  const raw = await turso(env, 'SELECT value FROM app_settings WHERE key = ?', ['ep_agenda_estado'])
  const estado = raw ? (JSON.parse(raw) as EstadoAgenda) : null
  if (!estado?.config || typeof estado.libres !== 'object') {
    // Sin estado no hay con qué comparar: que lo resuelva Vercel.
    await llamarVercel(env)
    return
  }

  const res = await fetch(URL_DISPONIBILIDAD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpoDisponibilidad(ahora, ahora + estado.config.anticipacionMaxMin * 60_000),
    signal: AbortSignal.timeout(TIMEOUT_BOOKINGS_MS),
  })
  if (!res.ok) throw new Error(`Bookings HTTP ${res.status}`)
  const tramos = parseDisponibilidad(await res.json())
  // Respuesta rara: no se anota la revisión, para que /ep muestre que lleva
  // rato sin una buena en vez de presumir de una que no lo fue.
  if (!tramos) throw new Error('Bookings: respuesta sin tramos')

  const libres = citasLibres(tramos, estado.config, ahora)
  if (cambiaronLibres(estado.libres, libres)) await llamarVercel(env)

  // updated_at va en segundos, como lo escribe Drizzle (mode: 'timestamp').
  await turso(
    env,
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [CLAVE_VIGIA, JSON.stringify({ revisadoEn: ahora, libres: libres.length })]
  )
}

export default {
  async scheduled(controller: { scheduledTime: number }, env: Env, ctx: Ctx) {
    ctx.waitUntil(
      vigilar(env, controller.scheduledTime).catch((e) => {
        // Fail-open: un minuto fallido no avisa a nadie; el de 10 min de Vercel sigue.
        console.error('vigía', e instanceof Error ? e.message : e)
      })
    )
  },
}
