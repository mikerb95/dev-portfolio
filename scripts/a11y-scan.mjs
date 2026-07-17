#!/usr/bin/env node
/**
 * Escanea las páginas públicas con axe-core y reporta las violaciones de
 * accesibilidad al panel LAB.
 *
 *   BASE_URL=http://localhost:4321 node scripts/a11y-scan.mjs
 *
 * Con INGEST_URL + LAB_INGEST_TOKEN, postea cada página al endpoint de ingesta
 * (kind: 'security_finding', source: 'axe', autoResolve) para que los hallazgos
 * que ya no aparecen se marquen resueltos solos. Sin ellos, solo imprime el
 * resumen y escribe a11y-results.json (útil en local y como artefacto de CI).
 *
 * Código de salida: 1 si hay violaciones critical/serious (para que el job de
 * CI se ponga rojo), 0 en caso contrario.
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { writeFileSync } from 'node:fs'

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4321').replace(/\/$/, '')
const INGEST_URL = process.env.INGEST_URL
const TOKEN = process.env.LAB_INGEST_TOKEN

// Páginas públicas representativas: home, listados y los dos formularios (los
// formularios son donde más suele fallar la accesibilidad).
const PAGES = ['/', '/lab', '/status', '/security', '/tools', '/notes', '/contact', '/pay', '/portal/login']

// Portal de clientes: son páginas privadas, así que no hay forma de llegar a
// ellas sin sesión. En vez de dejarlas fuera del escaneo, se entra por la demo
// pública (mismos datos ficticios que ve cualquier visitante de /tools) y se
// escanean como una sesión más — es la única forma de cubrir el área
// autenticada con este mismo escáner anónimo.
const PORTAL_DEMO_PAGES = [
  '/portal',
  '/portal/facturas',
  '/portal/mensajes',
  '/portal/documentos',
  '/portal/notificaciones',
  '/portal/cuenta',
]

const browser = await chromium.launch()
// axe-core/playwright exige un contexto explícito (falla con "please use
// browser.newContext()" si se usa browser.newPage() directo).
const context = await browser.newContext()
const page = await context.newPage()
// Sin salida a internet en CI/local: cortamos recursos de terceros para no colgar.
await context.route(
  (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
  (route) => route.abort()
)

let totalViolations = 0
let blocking = 0
const perPage = []

for (const path of PAGES) {
  try {
    // /status puede tardar bastante en cargar (query pesada contra Turso);
    // 60s da margen sin colgar el job si algo se cae de verdad.
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const violations = results.violations
    totalViolations += violations.length
    blocking += violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length

    const bySeverity = violations.reduce((acc, v) => {
      acc[v.impact ?? 'minor'] = (acc[v.impact ?? 'minor'] ?? 0) + 1
      return acc
    }, {})
    console.log(`  ${path.padEnd(12)} ${violations.length} violación(es) ${JSON.stringify(bySeverity)}`)

    perPage.push({ pageUrl: path, violations })

    if (INGEST_URL && TOKEN) {
      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({
          kind: 'security_finding',
          source: 'axe',
          pageUrl: path,
          violations,
          // autoResolve por página NO: cerraría hallazgos de otras páginas. La
          // resolución de lo que ya no aparece se hace una vez al final.
        }),
      })
      if (!res.ok) console.error(`  ⚠ ingesta falló para ${path}: ${res.status}`)
    }
  } catch (e) {
    console.error(`  ✗ ${path}: ${e.message}`)
  }
}

writeFileSync('a11y-results.json', JSON.stringify(perPage, null, 2))
await browser.close()

console.log(`\n${totalViolations} violaciones en ${PAGES.length} páginas (${blocking} bloqueantes).`)
process.exit(blocking > 0 ? 1 : 0)
