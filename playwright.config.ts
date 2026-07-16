import { defineConfig, devices } from '@playwright/test'
import { join } from 'node:path'

// Tests e2e: ejercen el sitio real en un navegador, no la lógica aislada (de eso
// se encargan los 300+ tests de Vitest en tests/).
//
// Dos decisiones que conviene entender antes de tocar esto:
//
// 1. **Bases de datos desechables.** El servidor de pruebas apunta a dos bases
//    libsql en archivo (`.e2e/`), sembradas por globalSetup. Nunca a Turso: los
//    e2e escriben (formulario de contacto, checkout) y no deben tocar datos
//    reales ni gastar cuota. La base "principal" se siembra con nombres
//    marcados (SEED_PREFIX) para poder afirmar que la demo no los filtra.
//
// 2. **`astro dev`, no `astro preview`.** El adaptador de Vercel no soporta
//    `astro preview`; levantar el build requeriría `vercel dev`. El middleware
//    —que es lo que estos tests verifican— corre igual en dev.
const PORT = 4331
const E2E_DIR = join(process.cwd(), '.e2e')

export const E2E = {
  baseURL: `http://localhost:${PORT}`,
  mainDbUrl: `file:${join(E2E_DIR, 'main.db')}`,
  demoDbUrl: `file:${join(E2E_DIR, 'demo.db')}`,
  /** Prefijo de los datos de la base "principal": jamás debe verse en la demo. */
  sentinel: 'CENTINELA-REAL ',
  authSecret: 'e2e-auth-secret-no-usado-en-produccion-0123456789',
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,

  use: {
    baseURL: E2E.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // La siembra va aquí y no en globalSetup a propósito: Playwright levanta el
    // webServer ANTES de ejecutar globalSetup, así que sembrar allí llegaría
    // tarde y el servidor arrancaría contra una base que no existe.
    command: `node scripts/seed-e2e.mjs && npm run dev -- --port ${PORT}`,
    url: E2E.baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      TURSO_DATABASE_URL: E2E.mainDbUrl,
      TURSO_AUTH_TOKEN: '',
      TURSO_DEMO_URL: E2E.demoDbUrl,
      TURSO_DEMO_AUTH_TOKEN: '',
      E2E_SENTINEL: E2E.sentinel,
      AUTH_SECRET: E2E.authSecret,
      // Sin allowlist real: ningún login de GitHub pasa el gate en los e2e.
      ALLOWED_GITHUB_LOGINS: 'nadie-e2e',
      // La bóveda necesita una clave válida (64 hex) o el módulo revienta al importarse.
      ENCRYPTION_KEY: 'e2e'.padEnd(64, '0'),
    },
  },
})
