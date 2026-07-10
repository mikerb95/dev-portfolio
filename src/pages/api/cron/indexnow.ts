import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../lib/auth'
import { submitSitemapToIndexNow } from '../../../lib/indexnow'

const CRON_SECRET = import.meta.env.CRON_SECRET
const SITE_URL = import.meta.env.AUTH_URL ?? 'https://codebymike.tech'

// Reenvía diariamente el sitemap a IndexNow (Bing, Yandex, Seznam, Naver, Yep).
// Como no hay deploy-hook, el cron garantiza que el contenido nuevo se anuncie
// dentro de 24h. Fetch del propio sitemap → POST a IndexNow. Barato e idempotente.

// Disparado por Vercel cron (GET con Authorization: Bearer CRON_SECRET).
export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    const result = await submitSitemapToIndexNow(SITE_URL)
    return new Response(JSON.stringify(result), { status: 200 })
  } catch (err) {
    console.error('[indexnow]', err)
    return new Response(JSON.stringify({ error: 'envío fallido' }), { status: 500 })
  }
}

// Disparo manual desde el admin. Fuera del middleware de /api/admin, así que
// validamos la sesión aquí mismo.
export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || (login && !isAllowedLogin(login))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    const result = await submitSitemapToIndexNow(SITE_URL)
    return new Response(JSON.stringify(result), { status: 200 })
  } catch (err) {
    console.error('[indexnow]', err)
    return new Response(JSON.stringify({ error: 'envío fallido' }), { status: 500 })
  }
}
