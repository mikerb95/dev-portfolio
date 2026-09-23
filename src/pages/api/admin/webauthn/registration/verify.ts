import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin, isRecentAuth } from '../../../../../lib/auth'
import { finishRegistration, notifyPasskeyChange } from '../../../../../lib/webauthn'
import { clientIp } from '../../../../../lib/device-info'

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || !isAllowedLogin(login)) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })
  }
  // Se repite aquí y no solo en /options: el challenge del alta se puede
  // conseguir con una sesión reciente y usarse después con otra que no lo es.
  if (!isRecentAuth((session as { authTime?: unknown }).authTime)) {
    return new Response(
      JSON.stringify({ error: 'Por seguridad, vuelve a iniciar sesión para añadir una llave.', reauth: true }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 })
  }
  const { response, nickname } = body as { response?: unknown; nickname?: string }
  if (!response) return new Response(JSON.stringify({ error: 'falta response' }), { status: 400 })

  const nick = typeof nickname === 'string' ? nickname : undefined
  const result = await finishRegistration(
    login!,
    response as Parameters<typeof finishRegistration>[1],
    nick,
    cookies,
    request.url
  )
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), { status: 400 })
  }

  await notifyPasskeyChange('added', {
    login: login!,
    nickname: nick?.slice(0, 60),
    ip: clientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
  })

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
