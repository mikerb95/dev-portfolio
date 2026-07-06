import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const now = Date.now()
const b = await client.execute({
  sql: `INSERT INTO briefings (title, status, objective, created_at, updated_at) VALUES (?, 'borrador', 'test', ?, ?) RETURNING id`,
  args: ['TEST briefing verificación', now, now],
})
const briefingId = b.rows[0].id
console.log('briefing creado id=', briefingId)

await client.execute({
  sql: `INSERT INTO briefing_items (briefing_id, kind, content, done, sort_order, created_at) VALUES (?, 'requerimiento', 'ítem de prueba', 0, 0, ?)`,
  args: [briefingId, now],
})
const items = await client.execute({ sql: 'SELECT * FROM briefing_items WHERE briefing_id = ?', args: [briefingId] })
console.log('items:', items.rows)

await client.execute({ sql: 'UPDATE briefings SET deleted_at = ? WHERE id = ?', args: [Date.now(), briefingId] })
const check = await client.execute({ sql: 'SELECT id, deleted_at FROM briefings WHERE id = ?', args: [briefingId] })
console.log('soft-deleted row:', check.rows)

// cleanup real (borra de verdad para no dejar basura de prueba)
await client.execute({ sql: 'DELETE FROM briefing_items WHERE briefing_id = ?', args: [briefingId] })
await client.execute({ sql: 'DELETE FROM briefings WHERE id = ?', args: [briefingId] })
console.log('cleanup ok')
