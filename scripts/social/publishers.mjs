// Publicadores por plataforma. Cada función recibe la nota ya parseada y
// devuelve { platform, status: 'ok'|'skip'|'error', detail, url? }.
// Si faltan los secrets de una plataforma, devuelve 'skip' sin lanzar: así el
// pipeline degrada con gracia igual que el CI (mismo patrón que ci.yml).

import crypto from 'node:crypto'
import { buildTweet, buildLinkedIn, buildArticleBody, tagSlug, SITE } from './lib.mjs'

const skip = (platform, why) => ({ platform, status: 'skip', detail: why })
const ok = (platform, detail, url) => ({ platform, status: 'ok', detail, url })
const err = (platform, detail) => ({ platform, status: 'error', detail })

// ── dev.to ────────────────────────────────────────────────────────────────
// Cross-post del artículo completo con canonical_url → sin penalización por
// duplicado y ganamos un backlink de dominio con autoridad.
export async function toDevTo(note) {
  const key = process.env.DEVTO_API_KEY
  if (!key) return skip('dev.to', 'sin DEVTO_API_KEY')
  const res = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      article: {
        title: note.title,
        body_markdown: buildArticleBody(note),
        description: note.description,
        published: true,
        canonical_url: note.url,
        tags: note.tags.slice(0, 4).map(tagSlug).filter(Boolean),
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return err('dev.to', `${res.status} ${JSON.stringify(data).slice(0, 180)}`)
  return ok('dev.to', 'publicado', data.url)
}

// ── Hashnode ────────────────────────────────────────────────────────────────
export async function toHashnode(note) {
  const token = process.env.HASHNODE_TOKEN
  const publicationId = process.env.HASHNODE_PUBLICATION_ID
  if (!token || !publicationId) return skip('Hashnode', 'sin HASHNODE_TOKEN/PUBLICATION_ID')
  const query = `mutation Publish($input: PublishPostInput!) {
    publishPost(input: $input) { post { url } }
  }`
  const input = {
    title: note.title,
    contentMarkdown: buildArticleBody(note),
    publicationId,
    originalArticleURL: note.url, // canonical
    tags: note.tags.slice(0, 5).map((t) => ({ slug: tagSlug(t), name: t })),
  }
  const res = await fetch('https://gql.hashnode.com/', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { input } }),
  })
  const data = await res.json().catch(() => ({}))
  if (data.errors) return err('Hashnode', JSON.stringify(data.errors).slice(0, 180))
  const url = data?.data?.publishPost?.post?.url
  if (!url) return err('Hashnode', `respuesta inesperada: ${JSON.stringify(data).slice(0, 180)}`)
  return ok('Hashnode', 'publicado', url)
}

// ── X (Twitter) ─────────────────────────────────────────────────────────────
// POST /2/tweets con firma OAuth 1.0a. El cuerpo JSON no entra en la firma;
// solo los parámetros oauth_*. HMAC-SHA1 sobre method&url&params ordenados.
function oauthHeader(method, url, consumerKey, consumerSecret, token, tokenSecret) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  }
  const enc = encodeURIComponent
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${enc(k)}=${enc(oauth[k])}`)
    .join('&')
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(paramString)}`
  const signingKey = `${enc(consumerSecret)}&${enc(tokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64')
  const header = { ...oauth, oauth_signature: signature }
  return (
    'OAuth ' +
    Object.keys(header)
      .sort()
      .map((k) => `${enc(k)}="${enc(header[k])}"`)
      .join(', ')
  )
}

export async function toX(note) {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET)
    return skip('X', 'sin X_API_KEY/SECRET/ACCESS_TOKEN/ACCESS_SECRET')
  const url = 'https://api.x.com/2/tweets'
  const auth = oauthHeader('POST', url, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET)
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: buildTweet(note) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return err('X', `${res.status} ${JSON.stringify(data).slice(0, 180)}`)
  const id = data?.data?.id
  return ok('X', 'publicado', id ? `https://x.com/i/web/status/${id}` : undefined)
}

// ── LinkedIn ────────────────────────────────────────────────────────────────
// ugcPosts con media ARTICLE: LinkedIn genera el preview desde las og tags del
// enlace. LINKEDIN_AUTHOR_URN p.ej. "urn:li:person:xxxx".
export async function toLinkedIn(note) {
  const token = process.env.LINKEDIN_TOKEN
  const author = process.env.LINKEDIN_AUTHOR_URN
  if (!token || !author) return skip('LinkedIn', 'sin LINKEDIN_TOKEN/AUTHOR_URN')
  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: buildLinkedIn(note) },
        shareMediaCategory: 'ARTICLE',
        media: [{ status: 'READY', originalUrl: note.url }],
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return err('LinkedIn', `${res.status} ${JSON.stringify(data).slice(0, 180)}`)
  const id = data?.id ?? res.headers.get('x-restli-id')
  return ok('LinkedIn', 'publicado', id ? `https://www.linkedin.com/feed/update/${id}` : undefined)
}

// ── Instagram ───────────────────────────────────────────────────────────────
// Instagram no admite posts de solo texto: requiere una imagen. Usamos la OG
// image de la nota (o la por defecto). Flujo en dos pasos: crear contenedor y
// publicarlo. Requiere cuenta Business + app de Meta + token de larga duración.
export async function toInstagram(note) {
  const igUser = process.env.IG_USER_ID
  const token = process.env.IG_ACCESS_TOKEN
  if (!igUser || !token) return skip('Instagram', 'sin IG_USER_ID/IG_ACCESS_TOKEN')
  const imageUrl = note.image ?? `${SITE}/og-default.png`
  const caption = buildLinkedIn(note) // mismo tono largo + hashtags

  const createRes = await fetch(`https://graph.facebook.com/v21.0/${igUser}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  })
  const created = await createRes.json().catch(() => ({}))
  if (!createRes.ok || !created.id)
    return err('Instagram', `contenedor: ${createRes.status} ${JSON.stringify(created).slice(0, 160)}`)

  const pubRes = await fetch(`https://graph.facebook.com/v21.0/${igUser}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: token }),
  })
  const published = await pubRes.json().catch(() => ({}))
  if (!pubRes.ok) return err('Instagram', `publish: ${pubRes.status} ${JSON.stringify(published).slice(0, 160)}`)
  return ok('Instagram', 'publicado', published.id ? `https://www.instagram.com/p/${published.id}` : undefined)
}

export const PUBLISHERS = [toDevTo, toHashnode, toX, toLinkedIn, toInstagram]
