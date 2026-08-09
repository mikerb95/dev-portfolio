#!/usr/bin/env node
/**
 * Sirve el artefacto de `scripts/build-load-target.mjs` sobre Node, para poder
 * medirlo con k6.
 *
 * Por qué no `astro dev`: el dev server compila bajo demanda, no minifica y
 * mantiene el grafo de HMR en memoria. Medir ahí da el rendimiento del
 * compilador, no el del sitio. Por qué no `astro preview`: el adaptador de
 * Vercel no lo soporta.
 *
 * Lo que queda es el propio bundle de producción. El adaptador lo emite como un
 * handler web estándar (`{ async fetch(request) }`), así que envolverlo son
 * treinta líneas de conversión entre `node:http` y `fetch`, sin dependencias.
 *
 * Esto NO reproduce Vercel: falta el edge, el CDN y el arranque en frío de
 * Fluid Compute. Reproduce la parte que este proyecto sí controla: el
 * middleware, el render SSR y las consultas a libSQL. Las cifras que salgan de
 * aquí son de esa capa, y el informe tiene que decirlo.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { Readable } from 'node:stream'

const OUT = new URL('../.vercel/output/', import.meta.url)
const STATIC_DIR = new URL('static/', OUT).pathname
const ENTRY = new URL('functions/_render.func/dist/server/entry.mjs', OUT)

const PORT = Number(process.env.LOAD_PORT ?? 4400)
const HOST = process.env.LOAD_HOST ?? '127.0.0.1'

// El bundle resolvió sus credenciales de BD en tiempo de compilación, pero
// varios módulos (auth, notify, pagos) siguen leyendo `process.env` en runtime.
// Sin estos, el middleware toma ramas distintas y medirías otro código.
process.env.NODE_ENV ??= 'production'
process.env.AUTH_SECRET ??= 'load-testing-only-not-a-real-secret-0000'
process.env.PAYMENTS_MOCK_ENABLED ??= 'true'

if (!existsSync(ENTRY.pathname)) {
  console.error('✗ No hay artefacto. Corre antes: node scripts/build-load-target.mjs')
  process.exit(1)
}

const { default: handler } = await import(ENTRY.href)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
}

/** Resuelve un archivo estático dentro de STATIC_DIR, o null. */
function resolveStatic(pathname) {
  // `normalize` sobre el pathname decodificado corta el `..`: sin esto, un
  // `GET /../../.env` saldría del directorio servido. Es un servidor de
  // laboratorio, pero uno que atiende en un puerto es un servidor.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const candidates = [join(STATIC_DIR, rel)]
  if (!extname(rel)) candidates.push(join(STATIC_DIR, rel, 'index.html'))

  for (const file of candidates) {
    if (!file.startsWith(STATIC_DIR)) continue
    if (existsSync(file) && statSync(file).isFile()) return file
  }
  return null
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? `${HOST}:${PORT}`}`)

  const file = resolveStatic(url.pathname)
  if (file) {
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    })
    createReadStream(file).pipe(res)
    return
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
  })

  try {
    const response = await handler.fetch(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res)
    } else {
      res.end()
    }
  } catch (error) {
    // Fail-loud a propósito, al revés que el resto del proyecto: aquí un error
    // tragado se convierte en una métrica de latencia bonita sobre una página
    // que nunca se renderizó.
    console.error(`✗ ${req.method} ${url.pathname}`, error)
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end('load-server: unhandled error')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`objetivo de carga en http://${HOST}:${PORT}`)
})
