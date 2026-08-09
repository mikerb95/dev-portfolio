#!/usr/bin/env node
/**
 * Compila el sitio como objetivo de pruebas de carga apuntando a las bases
 * libSQL locales de compose.yaml.
 *
 * Existe por un motivo concreto y caro: `src/db/index.ts` lee las credenciales
 * con `import.meta.env`, y Vite RESUELVE eso en tiempo de compilación. Es decir,
 * un `npm run build` normal deja la URL y el token rw de Turso de PRODUCCIÓN
 * incrustados en el bundle. Lanzarle mil usuarios concurrentes a ese artefacto
 * no mide el sistema: le pega a la base real, gasta cuota y escribe filas
 * verdaderas.
 *
 * La comprobación del final no es decorativa. Es la única forma de saber que la
 * sustitución funcionó, porque el fallo silencioso (compilar contra prod
 * creyendo que apuntas a local) no da ningún error: da números.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// `.env.production.local` gana sobre `.env` y sobre `.env.local` en el orden de
// Vite, que es exactamente lo que hace falta: pisar las credenciales reales sin
// tocar el `.env` del desarrollador.
const overrideFile = join(root, '.env.production.local')

const MAIN_URL = process.env.LOAD_DB_URL ?? 'http://127.0.0.1:8080'
const DEMO_URL = process.env.LOAD_DEMO_URL ?? 'http://127.0.0.1:8081'

// Secretos de juguete: el objetivo de carga necesita que existan (si faltan, el
// middleware y los módulos de cifrado se comportan distinto y medirías otra
// cosa), pero no deben ser los de producción.
const override = [
  '# Generado por scripts/build-load-target.mjs. Se borra al terminar.',
  '# Si lo encuentras suelto en el repo, una corrida se interrumpió: bórralo.',
  `TURSO_DATABASE_URL=${MAIN_URL}`,
  'TURSO_AUTH_TOKEN=',
  `TURSO_DEMO_URL=${DEMO_URL}`,
  'TURSO_DEMO_AUTH_TOKEN=',
  'AUTH_SECRET=load-testing-only-not-a-real-secret-0000',
  'ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000',
  'CRON_SECRET=load-testing-only',
  'LAB_INGEST_TOKEN=load-testing-only',
  'COBRO_HISTORY_SECRET=load-testing-only',
  'PAYMENTS_MOCK_ENABLED=true',
  // Sin estas, notify.ts y Resend hacen no-op silencioso, que es lo que
  // queremos: una prueba de carga no manda correos ni notificaciones push.
  '',
].join('\n')

if (existsSync(overrideFile)) {
  console.error(`✗ Ya existe ${overrideFile}. Bórralo antes de continuar.`)
  process.exit(1)
}

writeFileSync(overrideFile, override)
console.log(`→ Objetivo de carga: main=${MAIN_URL} demo=${DEMO_URL}`)

try {
  execFileSync('npx', ['astro', 'build'], { cwd: root, stdio: 'inherit' })
} finally {
  rmSync(overrideFile, { force: true })
}

// --- Verificación: producción no puede aparecer en el artefacto -------------

const chunksDir = join(root, '.vercel/output/functions/_render.func/dist/server/chunks')
if (!existsSync(chunksDir)) {
  console.error(`✗ No se encontró ${chunksDir}. ¿Cambió la salida del adaptador?`)
  process.exit(1)
}

const leaks = []
let sawMainUrl = false

for (const name of readdirSync(chunksDir)) {
  if (!name.endsWith('.mjs')) continue
  const body = readFileSync(join(chunksDir, name), 'utf8')
  // `turso.io` cubre tanto la base principal como la de demo, y el prefijo del
  // JWT cubre el token aunque algún día la URL deje de ser de Turso.
  if (body.includes('turso.io')) leaks.push(`${name}: URL de Turso remota`)
  if (body.includes('eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9')) leaks.push(`${name}: token JWT`)
  if (body.includes(MAIN_URL)) sawMainUrl = true
}

if (leaks.length > 0) {
  console.error('✗ El bundle todavía contiene credenciales de producción:')
  for (const leak of leaks) console.error(`   ${leak}`)
  console.error('  NO lances carga contra este artefacto.')
  process.exit(1)
}

// La ausencia de prod no basta: si la sustitución fallara hacia el otro lado
// (variable vacía), tampoco habría fuga y el servidor no arrancaría contra nada.
if (!sawMainUrl) {
  console.error(`✗ El bundle no apunta a ${MAIN_URL}. La sustitución no se aplicó.`)
  process.exit(1)
}

console.log(`✓ Bundle aislado: apunta a ${MAIN_URL}, sin rastro de producción.`)
