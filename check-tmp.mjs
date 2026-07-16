import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
const r = await db.execute(`SELECT reference, short_code, status FROM payments WHERE description = 'VERIFY_TEST_COBRO'`)
console.log('en Turso:', JSON.stringify(r.rows))
