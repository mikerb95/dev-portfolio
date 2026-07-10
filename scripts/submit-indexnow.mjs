#!/usr/bin/env node
// Envío manual/CI a IndexNow (Bing, Yandex, Seznam, Naver, Yep). Para el uso
// automático diario existe el cron /api/cron/indexnow. Google no usa IndexNow.
//
// Uso:
//   node scripts/submit-indexnow.mjs                 → todas las URLs del sitemap
//   node scripts/submit-indexnow.mjs /notes/mi-nota  → solo esas rutas
//
// Reutiliza la lógica de src/lib/indexnow.ts (una sola fuente de verdad para la
// clave). Se importa como TS vía el loader nativo de Node (v22+ con --experimental
// no hace falta para .ts si el runtime lo soporta); aquí replicamos el POST para
// no depender del transpilado.

const SITE = 'https://codebymike.tech'
const KEY = 'eec9c30b0348b882cba9349b7fb125f2' // debe coincidir con public/<key>.txt y src/lib/indexnow.ts

const args = process.argv.slice(2)

let urls
if (args.length > 0) {
  urls = args.map((p) => (p.startsWith('http') ? p : `${SITE}${p}`))
} else {
  const res = await fetch(`${SITE}/sitemap.xml`)
  if (!res.ok) {
    console.error(`No se pudo leer el sitemap: ${res.status}`)
    process.exit(1)
  }
  const xml = await res.text()
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

if (urls.length === 0) {
  console.error('Sin URLs para enviar.')
  process.exit(1)
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: urls,
  }),
})

// 200 = procesado, 202 = aceptado (clave pendiente de validación)
console.log(`IndexNow → ${res.status} ${res.statusText} · ${urls.length} URLs enviadas`)
if (!res.ok && res.status !== 202) process.exit(1)
