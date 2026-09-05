import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).replace(/^["']|["']$/g,'')]))
const c = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
console.log(await c.execute("select sql from sqlite_master where name='project_services'").then(r=>r.rows[0].sql))
const m = await c.execute("select id,project_id,category,name,provider,active,renewal_date from project_services where category='domain' order by id")
console.table(m.rows)
