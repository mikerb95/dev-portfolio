import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../../lib/auth'
import { listCredentials, deleteCredential } from '../../../../lib/webauthn'

async function currentLogin(request: Request): Promise<string | null> {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  return session && isAllowedLogin(login) ? login! : null
}

export const GET: APIRoute = async ({ request }) => {
  const login = await currentLogin(request)
  if (!login) return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })

  const rows = await listCredentials(login)
  const items = rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    deviceType: r.deviceType,
    createdAt: r.createdAt?.getTime() ?? null,
    lastUsedAt: r.lastUsedAt?.getTime() ?? null,
  }))
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const DELETE: APIRoute = async ({ request }) => {
  const login = await currentLogin(request)
  if (!login) return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })

  const body = await request.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400 })

  const ok = await deleteCredential(login, id)
  return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 404 })
}
