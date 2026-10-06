import type { APIRoute } from 'astro'
import { COTIZA_COOKIE, RUTA_ENTRADA } from '../../../lib/cotiza/acceso'

/**
 * Cierra la entrada con PIN en este navegador. Es un POST desde un formulario
 * (no un GET) para que un enlace o una imagen incrustada en otra página no
 * puedan sacarme de la sesión.
 */
export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(COTIZA_COOKIE, { path: '/' })
  return redirect(RUTA_ENTRADA, 303)
}
