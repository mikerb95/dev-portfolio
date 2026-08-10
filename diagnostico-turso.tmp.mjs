import { createClient } from '@libsql/client'

async function probar(nombre, url, authToken) {
  const c = createClient({ url, authToken })
  try {
    const r = await c.execute('select count(*) as n from projects')
    console.log(`${nombre}: LEE ok (${r.rows[0].n} proyectos)`)
  } catch (e) {
    console.log(`${nombre}: FALLA -> ${String(e.message ?? e).slice(0, 160)}`)
  }
}

await probar('principal', process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN)
await probar('demo', process.env.TURSO_DEMO_URL, process.env.TURSO_DEMO_AUTH_TOKEN)
