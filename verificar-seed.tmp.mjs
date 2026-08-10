import { createClient } from '@libsql/client'
import { renderMarkdown } from './src/lib/capacitacion/markdown.ts'
import { parseLista } from './src/lib/capacitacion/tipos.ts'

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// Se reproduce el filtro real del banco: sin pase solo salen los públicos.
const sinPase = await db.execute(
  `select slug, title from training_resources where visibility in ('publico') order by sort_order`
)
const conPase = await db.execute(
  `select slug, title, visibility from training_resources where visibility in ('publico','con_codigo') order by sort_order`
)

console.log('visitante SIN pase ve:')
for (const r of sinPase.rows) console.log(`  - ${r.title}`)
console.log('visitante CON pase ve:')
for (const r of conPase.rows) console.log(`  - ${r.title} (${r.visibility})`)

const p = (await db.execute(`select * from training_programs where is_public = 1`)).rows[0]
console.log(`\nlanding: ${p.title}`)
console.log(`  objetivos: ${parseLista(p.outcomes).length} · módulos: ${parseLista(p.modules).length}`)
console.log(`  precio: ${p.price_note}`)

// El markdown tiene que renderizar a HTML sin dejar marcado crudo ni script.
for (const row of (await db.execute('select title, body from training_resources')).rows) {
  const html = renderMarkdown(row.body)
  const problemas = []
  if (html.includes('<script')) problemas.push('emite <script>')
  if (/^\s*##\s/m.test(html)) problemas.push('quedó markdown sin renderizar')
  if (!html.includes('<h2>')) problemas.push('sin encabezados')
  console.log(
    `\n${row.title}: ${html.length} caracteres de HTML` +
      (problemas.length ? ` PROBLEMAS: ${problemas.join(', ')}` : ' ok')
  )
}
