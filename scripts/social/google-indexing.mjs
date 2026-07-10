#!/usr/bin/env node
// Notifica a Google la URL nueva/actualizada vía Indexing API (indexación en
// horas en vez de días). Complementa a IndexNow, que Google NO usa.
//
// Requiere una service account con acceso a la propiedad de Search Console:
//   GOOGLE_INDEXING_SA = JSON completo de la clave de la service account.
// Sin ese secret, sale con gracia (exit 0).
//
// Uso: node scripts/social/google-indexing.mjs https://codebymike.tech/notes/x [...]

import crypto from 'node:crypto'

const sa = process.env.GOOGLE_INDEXING_SA
const urls = process.argv.slice(2).filter((u) => u.startsWith('http'))

if (!sa) {
  console.log('Sin GOOGLE_INDEXING_SA: se omite la indexación en Google.')
  process.exit(0)
}
if (urls.length === 0) {
  console.log('Sin URLs para indexar en Google.')
  process.exit(0)
}

const key = JSON.parse(sa)
const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// JWT firmado RS256 → token de acceso con scope indexing.
function signJwt() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/indexing',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claim}`)
    .sign(key.private_key)
  return `${header}.${claim}.${b64url(signature)}`
}

async function getToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signJwt(),
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`token: ${JSON.stringify(data).slice(0, 180)}`)
  return data.access_token
}

const token = await getToken()
for (const url of urls) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  })
  console.log(`Google Indexing → ${res.status} · ${url}`)
}
