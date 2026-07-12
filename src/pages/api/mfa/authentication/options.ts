import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../../lib/auth'
import { hasCredentials, buildAuthenticationOptions } from '../../../../lib/webauthn'

// Paso 1 del step-up: genera el challenge de autenticación para el login de la
// sesión de GitHub ya activa. Vive fuera de /api/admin a propósito: se llama
// ANTES de que exista la cookie de MFA. Exige sesión + allowlist igual que el
// middleware exige para /admin (defensa en profundidad, mismo criterio).
export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || !isAllowedLogin(login)) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403 })
  }
  if (!(await hasCredentials(login!))) {
    return new Response(JSON.stringify({ error: 'no hay llaves registradas para este login' }), { status: 400 })
  }
  const options = await buildAuthenticationOptions(login!, cookies)
  return new Response(JSON.stringify(options), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
