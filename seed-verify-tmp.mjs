import { createClient } from '@libsql/client'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
const MARK = 'VERIFY_TEST_COBRO'
if (process.argv[2] === 'cleanup') {
  const r = await db.execute(`DELETE FROM payments WHERE description = '${MARK}'`)
  console.log('borradas:', r.rowsAffected); process.exit(0)
}
const now = Date.now()
const rows = [
  ['vfy_act', 'VRAAAA', 'created', now + 86400000],
  ['vfy_ven', 'VRBBBB', 'created', now - 3600000],
  ['vfy_pag', 'VRCCCC', 'approved', now + 86400000],
  ['vfy_anu', 'VRDDDD', 'voided', now + 86400000],
]
for (const [ref, code, status, exp] of rows) {
  await db.execute(`INSERT INTO payments (reference, idempotency_key, description, amount_cents, currency, status, provider, payer_phone, source, short_code, expires_at, version, created_at, updated_at)
    VALUES ('${ref}', 'k_${ref}', '${MARK}', 25000000, 'COP', '${status}', 'mock', '+573104641228', 'cobro', '${code}', ${Math.floor(exp/1000)}, 0, ${Math.floor(now/1000)}, ${Math.floor(now/1000)})`)
}
const s = env.COBRO_HISTORY_SECRET, p = '+573104641228'
const h = (d) => createHmac('sha256', s).update(d, 'utf8').digest('hex')
console.log(`LINK=r=${h(`ref:${p}`).slice(0,16)}&t=${h(`mis-pagos:${p}`).slice(0,32)}`)
