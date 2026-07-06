import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const { rows } = await client.execute(
  'SELECT id, requirements, deliverables FROM briefings'
)

let inserted = 0
for (const row of rows) {
  const briefingId = row.id
  const groups = [
    ['requerimiento', row.requirements],
    ['entregable', row.deliverables],
  ]
  for (const [kind, text] of groups) {
    if (!text) continue
    const lines = String(text)
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim())
      .filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      await client.execute({
        sql: 'INSERT INTO briefing_items (briefing_id, kind, content, done, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?)',
        args: [briefingId, kind, lines[i], i, Date.now()],
      })
      inserted++
    }
  }
}

console.log(`Migrated ${rows.length} briefings, inserted ${inserted} items`)
