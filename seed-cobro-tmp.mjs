// Inserta un cobro de prueba, imprime su código, y permite borrarlo después.
// Uso: node seed-cobro.mjs insert | node seed-cobro.mjs cleanup
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
const MARK = 'SMOKE_TEST_COBRO'

if (process.argv[2] === 'cleanup') {
  const r = await db.execute(`DELETE FROM payments WHERE description = '${MARK}'`)
  console.log('filas borradas:', r.rowsAffected)
  process.exit(0)
}

const codes = { activo: 'SMOKEA', vencido: 'SMOKEB', pagado: 'SMOKEC', anulado: 'SMOKED' }
const now = Date.now()
const rows = [
  ['smoke_act', codes.activo, 'created', now + 86400000],
  ['smoke_ven', codes.vencido, 'created', now - 3600000],
  ['smoke_pag', codes.pagado, 'approved', now + 86400000],
  ['smoke_anu', codes.anulado, 'voided', now + 86400000],
]

for (const [ref, code, status, exp] of rows) {
  await db.execute(
    `INSERT INTO payments (reference, idempotency_key, description, amount_cents, currency,
       status, provider, payer_phone, source, short_code, expires_at, version, created_at, updated_at)
     VALUES ('${ref}', 'k_${ref}', '${MARK}', 15000000, 'COP', '${status}', 'mock',
       '+573104641228', 'cobro', '${code}', ${Math.floor(exp / 1000)}, 0, ${Math.floor(now / 1000)}, ${Math.floor(now / 1000)})`,
  )
}
console.log('cobros de prueba creados:', JSON.stringify(codes))
