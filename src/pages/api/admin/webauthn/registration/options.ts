import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../../../lib/auth'
import { buildRegistrationOptions } from '../../../../../lib/webauthn'

// Alta de una llave nueva. Vive bajo /api/admin, así que el middleware ya
// exige sesión + allowlist (y MFA, una vez que exista al menos una llave —
// pero antes de la primera, el gate de MFA todavía está apagado, así que esto
// también sirve para el alta inicial sin quedar bloqueado a medio camino).
export const GET: APIRoute = async ({ request, cookies }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || !isAllowedLogin(login)) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })
  }
  const options = await buildRegistrationOptions(login!, cookies, request.url)
  return new Response(JSON.stringify(options), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
