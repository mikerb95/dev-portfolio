#!/usr/bin/env node
/**
 * Crea y siembra las dos bases desechables de los tests e2e.
 *
 * Corre como parte del arranque del servidor de pruebas (ver el `webServer` de
 * playwright.config.ts) y NO desde globalSetup: Playwright levanta el servidor
 * ANTES de ejecutar globalSetup, así que sembrar allí llega tarde y el servidor
 * arranca contra una base inexistente.
 *
 * Lee del entorno (se lo pasa playwright.config.ts):
 *   TURSO_DATABASE_URL → base "principal", hace de producción en los tests.
 *   TURSO_DEMO_URL     → base de la demo.
 *   E2E_SENTINEL       → prefijo de los datos de la principal, para que el spec
 *                        de la demo pueda afirmar que nunca los filtra.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mainUrl = process.env.TURSO_DATABASE_URL
const demoUrl = process.env.TURSO_DEMO_URL
const sentinel = process.env.E2E_SENTINEL ?? ''

// Se aceptan bases en archivo (default) y servidores libSQL locales
// (E2E_DB_MODE=server, ver compose.yaml). Lo que NO se acepta es nada remoto:
// este script arrasa el esquema del destino antes de sembrarlo, así que un
// error de configuración aquí no degrada un test, borra una base. La lista es
// blanca a propósito - enumerar lo permitido falla cerrado, enumerar lo
// prohibido falla abierto en cuanto aparece un host que nadie previó.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'libsql-main', 'libsql-demo'])

const assertDisposable = (url, name) => {
  if (url?.startsWith('file:')) return
  let parsed
  try {
    parsed = new URL(url ?? '')
  } catch {
    console.error(`✗ ${name} no es una URL válida: ${url}`)
    process.exit(1)
  }
  const esLocal =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    LOCAL_HOSTS.has(parsed.hostname)
  if (!esLocal) {
    console.error(`✗ ${name} apunta fuera de la máquina (${parsed.host}). Abortado.`)
    console.error('  seed-e2e solo siembra bases desechables: file: o libSQL local.')
    process.exit(1)
  }
}

assertDisposable(mainUrl, 'TURSO_DATABASE_URL')
assertDisposable(demoUrl, 'TURSO_DEMO_URL')

// El directorio solo existe en modo archivo. En modo servidor no hay nada que
// limpiar: seed-demo.mjs recrea el esquema desde cero en cada corrida.
if (mainUrl.startsWith('file:') || demoUrl.startsWith('file:')) {
  const dir = join(root, '.e2e')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

const seed = (url, prefix) =>
  execFileSync('node', [join(root, 'scripts', 'seed-demo.mjs')], {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      SEED_TARGET_URL: url,
      SEED_TARGET_TOKEN: '',
      SEED_PREFIX: prefix,
      // La salvaguarda de seed-demo aborta si el destino es la base real; aquí
      // no hay base real que proteger y el destino ES TURSO_DATABASE_URL.
      TURSO_DATABASE_URL: '',
      TURSO_DEMO_URL: '',
    },
  })

seed(mainUrl, sentinel)
seed(demoUrl, '')
console.log('✓ Bases e2e listas')
