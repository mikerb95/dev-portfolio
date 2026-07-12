import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../../../lib/auth'
import { finishRegistration } from '../../../../../lib/webauthn'

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || !isAllowedLogin(login)) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 })
  }
  const { response, nickname } = body as { response?: unknown; nickname?: string }
  if (!response) return new Response(JSON.stringify({ error: 'falta response' }), { status: 400 })

  const result = await finishRegistration(
    login!,
    response as Parameters<typeof finishRegistration>[1],
    typeof nickname === 'string' ? nickname : undefined,
    cookies,
    request.url
  )
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), { status: 400 })
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
