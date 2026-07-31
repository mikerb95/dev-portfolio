#!/usr/bin/env node
/**
 * Espera a que uno o más servidores libSQL respondan.
 *
 *   node scripts/wait-libsql.mjs http://127.0.0.1:8080 http://127.0.0.1:8081
 *
 * La espera se hace desde el HOST y no con un `healthcheck` de compose a
 * propósito: un healthcheck tendría que ejecutar curl/wget DENTRO de la imagen
 * de sqld, y eso ata nuestra infraestructura de pruebas a qué binarios trae esa
 * imagen — un detalle que sus mantenedores pueden cambiar sin avisar y que nos
 * rompería el arranque sin que el fallo diga por qué. Node ya está aquí.
 */
const targets = process.argv.slice(2)
const TIMEOUT_MS = Number(process.env.WAIT_TIMEOUT_MS ?? 60_000)

if (targets.length === 0) {
  console.error('✗ Uso: node scripts/wait-libsql.mjs <url> [url...]')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(url) {
  const deadline = Date.now() + TIMEOUT_MS
  let lastError = 'sin respuesta'

  while (Date.now() < deadline) {
    try {
      const res = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(2_000) })
      if (res.ok) return
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err.message
    }
    await sleep(500)
  }

  throw new Error(`${url} no respondió en ${TIMEOUT_MS} ms (último error: ${lastError})`)
}

try {
  await Promise.all(targets.map(waitFor))
  console.log(`✓ libSQL listo: ${targets.join(' · ')}`)
} catch (err) {
  console.error(`✗ ${err.message}`)
  console.error('  ¿Están levantadas las bases? → npm run db:up')
  process.exit(1)
}
