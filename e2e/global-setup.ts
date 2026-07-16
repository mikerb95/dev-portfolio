import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { E2E } from '../playwright.config'

/**
 * Crea las dos bases desechables antes de que arranque el servidor:
 *  · main.db → hace de "producción" en los tests. Sus datos llevan el prefijo
 *    centinela, así el spec de la demo puede afirmar que nunca se filtran.
 *  · demo.db → la base de la demo, con los datos ficticios normales.
 */
export default function globalSetup() {
  const dir = join(process.cwd(), '.e2e')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const seed = (url: string, prefix: string) => {
    execFileSync('node', ['scripts/seed-demo.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SEED_TARGET_URL: url,
        SEED_TARGET_TOKEN: '',
        SEED_PREFIX: prefix,
        // La salvaguarda del seed compara contra esto; en e2e no hay base real.
        TURSO_DATABASE_URL: '',
      },
    })
  }

  seed(E2E.mainDbUrl, E2E.sentinel)
  seed(E2E.demoDbUrl, '')
}
