import type { APIRoute } from 'astro'
import { confirmarSuscripcion } from '../../../lib/marketing/db'

// Enlace del correo de confirmación. GET porque es un enlace; el token es de
// un solo uso, así que un escáner de correo que lo abra antes que la persona
// solo puede confirmar a quien ya pidió suscribirse (lo mismo que haría ella).

export const GET: APIRoute = async ({ url, redirect }) => {
  const token = url.searchParams.get('t') ?? ''
  let ok = false
  try {
    ok = await confirmarSuscripcion(token)
  } catch (e) {
    console.error('[marketing/confirmar]', e)
  }
  return redirect(`/novedades?estado=${ok ? 'confirmado' : 'invalido'}`, 303)
}
