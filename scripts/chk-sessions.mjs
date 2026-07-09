import { createClient } from '@libsql/client'
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
const info = await c.execute('PRAGMA table_info(admin_sessions)')
console.log('columnas:', info.rows.map((x) => x.name).join(', ') || 'NINGUNA (tabla no existe)')
process.exit(0)
