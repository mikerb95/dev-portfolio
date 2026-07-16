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

if (!mainUrl?.startsWith('file:') || !demoUrl?.startsWith('file:')) {
  console.error('✗ seed-e2e espera URLs file: en TURSO_DATABASE_URL y TURSO_DEMO_URL.')
  process.exit(1)
}

const dir = join(root, '.e2e')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

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
