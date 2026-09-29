#!/usr/bin/env node
/**
 * Modo copia del analista: trae a la base LOCAL de desarrollo los datos de
 * seguridad reales de la última semana, para ensayar y presentar el analista
 * con ataques de verdad sin tocar producción.
 *
 *   npm run analista:copia
 *
 * - Lee de producción (credenciales de `.env`) SOLO con SELECT.
 * - Escribe en la base de `.env.development.local`, y se niega si esa URL no
 *   es local (archivo o libSQL en esta máquina): un error de configuración no
 *   puede terminar borrando la tabla de eventos de producción.
 * - Antes de copiar, vacía en la base local security_events,
 *   security_anomalies y blocked_ips, para no mezclar datos de prueba con los
 *   reales.
 *
 * Aprobar un bloqueo sobre la copia no afecta al sitio: escribe en la
 * blocked_ips local.
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'

const leer = (archivo) =>
  Object.fromEntries(
    readFileSync(archivo, 'utf8')
      .split('\n')
      .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])
  )

const prod = leer('.env')
const local = leer('.env.development.local')

const esLocal = (url) => {
  if (!url) return false
  if (url.startsWith('file:')) return true
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}
if (!esLocal(local.TURSO_DATABASE_URL)) {
  console.error('✗ La base de .env.development.local no es local. Abortado: este script solo escribe en bases de esta máquina.')
  process.exit(1)
}
if (!prod.TURSO_DATABASE_URL || esLocal(prod.TURSO_DATABASE_URL)) {
  console.error('✗ .env no apunta a la base de producción. Nada que copiar.')
  process.exit(1)
}

const origen = createClient({ url: prod.TURSO_DATABASE_URL, authToken: prod.TURSO_AUTH_TOKEN })
const destino = createClient({ url: local.TURSO_DATABASE_URL, authToken: local.TURSO_AUTH_TOKEN || undefined })

const ahora = Math.floor(Date.now() / 1000)
const semana = ahora - 7 * 86_400

// Mismas columnas en las dos bases (misma migración); se listan explícitas para
// que un cambio de esquema falle aquí y no copie a medias.
const TABLAS = [
  {
    nombre: 'security_events',
    columnas: ['at', 'ip', 'ip_hash', 'method', 'path', 'query', 'user_agent', 'country', 'asn', 'category', 'severity', 'action', 'status_code', 'rule_id', 'hits'],
    donde: 'at > ?',
    args: [semana],
  },
  {
    nombre: 'security_anomalies',
    columnas: ['at', 'kind', 'z_score', 'baseline', 'observed', 'detail', 'notified', 'acknowledged'],
    donde: 'at > ?',
    args: [semana],
  },
  {
    nombre: 'blocked_ips',
    columnas: ['ip', 'reason', 'rule_id', 'hits', 'created_at', 'expires_at', 'source'],
    donde: 'expires_at > ?',
    args: [ahora],
  },
]

for (const t of TABLAS) {
  const { rows } = await origen.execute({ sql: `SELECT ${t.columnas.join(', ')} FROM ${t.nombre} WHERE ${t.donde}`, args: t.args })
  const marcas = t.columnas.map(() => '?').join(', ')
  await destino.batch(
    [
      `DELETE FROM ${t.nombre}`,
      ...rows.map((r) => ({
        sql: `INSERT INTO ${t.nombre} (${t.columnas.join(', ')}) VALUES (${marcas})`,
        args: t.columnas.map((c) => r[c] ?? null),
      })),
    ],
    'write'
  )
  console.log(`✓ ${t.nombre}: ${rows.length} filas copiadas`)
}
console.log('\nListo. Arranca `npm run dev` y abre /admin/analista: la pantalla indica que trabaja sobre la copia.')
