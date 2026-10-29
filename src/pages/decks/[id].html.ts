import type { APIRoute } from 'astro'
import { getSession as getAuthSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../lib/auth'
import { readDeckHtml } from '../../lib/present/decks'
import { motivoParaLeerDeck, sesionDeConsulta } from '../../lib/present/deck-acceso'
import { getSession as getPresentSession } from '../../lib/present/session'
import { tienePaseCapacitacion } from '../../lib/capacitacion/pase'
import { deckVisibleEnBanco } from '../../lib/capacitacion/repo'

/**
 * Sirve el HTML del deck desde NUESTRO origen.
 *
 * Es el detalle que hace posible todo lo demás. El contrato de integración
 * (`iframe.contentDocument.querySelector('deck-stage')`) exige mismo origen, y
 * el blob vive en `*.public.blob.vercel-storage.com`. Servido desde ahí, el
 * navegador bloquearía el acceso al DOM y las tres vistas quedarían con un
 * iframe que no responde a nada.
 *
 * Y por eso `frame-ancestors 'self'` explícito: el middleware pone
 * `frame-ancestors 'none'` + `X-Frame-Options: DENY` en las rutas privadas, y
 * heredarlo aquí dejaría el iframe en blanco. Se sobrescribe con el valor
 * mínimo que permite lo único que queremos permitir - que lo enmarquemos
 * nosotros.
 */
export const GET: APIRoute = async ({ params, request, url, cookies }) => {
  const id = Number(String(params.id ?? '').replace(/\.html$/, ''))
  if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 })

  // 404 y no 403 sin permiso: un 403 confirmaría qué ids tienen deck.
  if (!(await puedeLeer(id, request, url, cookies))) return new Response('Not found', { status: 404 })

  const stream = await readDeckHtml(id)
  if (!stream) return new Response('Not found', { status: 404 })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // El deck cambia solo cuando se reemplaza el archivo, y entonces cambia
      // también su blob. Cachear en el navegador evita releerlo en cada
      // reconexión del proyector; `private` lo mantiene fuera de la CDN
      // compartida, que es donde no queremos decks de clientes.
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

/**
 * Las pruebas van de la más barata a la más cara (cookie, Redis, Turso) y se
 * corta en la primera que sirve. Cada una que falla por su backend cuenta como
 * "no": esto es autorización, así que falla cerrada.
 */
async function puedeLeer(
  deckId: number,
  request: Request,
  url: URL,
  cookies: Parameters<APIRoute>[0]['cookies']
): Promise<boolean> {
  let admin = false
  try {
    const sesion = await getAuthSession(request)
    admin = Boolean(sesion) && isAllowedLogin((sesion?.user as { login?: string } | undefined)?.login)
  } catch {
    // Cookie corrupta o Auth.js sin configurar: se sigue con las otras pruebas.
  }
  if (admin) return true

  let deckDeLaSesion: number | null = null
  const sessionId = sesionDeConsulta(url.searchParams.get('s'))
  if (sessionId) {
    deckDeLaSesion = (await getPresentSession(sessionId).catch(() => null))?.deckId ?? null
  }
  if (motivoParaLeerDeck({ deckId, admin, deckDeLaSesion, enBancoVisible: false })) return true

  const conPase = await tienePaseCapacitacion(cookies).catch(() => false)
  const enBancoVisible = await deckVisibleEnBanco(deckId, { conPase }).catch(() => false)
  return motivoParaLeerDeck({ deckId, admin, deckDeLaSesion, enBancoVisible }) !== null
}
