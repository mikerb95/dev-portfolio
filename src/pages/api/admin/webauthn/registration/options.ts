import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin, isRecentAuth } from '../../../../../lib/auth'
import { buildRegistrationOptions } from '../../../../../lib/webauthn'

// Alta de una llave nueva. Vive bajo /api/admin, así que el middleware ya
// exige sesión + allowlist. Además exige que la sesión sea RECIENTE: una llave
// es una puerta de entrada permanente, y sin esto quien robara una cookie de
// sesión podía registrar la suya y conservar el acceso aunque después se
// revocaran todas las sesiones. Ver isRecentAuth en src/lib/auth.ts.
export const GET: APIRoute = async ({ request, cookies }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || !isAllowedLogin(login)) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })
  }
  if (!isRecentAuth((session as { authTime?: unknown }).authTime)) {
    return new Response(
      JSON.stringify({ error: 'Por seguridad, vuelve a iniciar sesión para añadir una llave.', reauth: true }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const options = await buildRegistrationOptions(login!, cookies, request.url)
  return new Response(JSON.stringify(options), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
