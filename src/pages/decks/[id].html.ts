import type { APIRoute } from 'astro'
import { readDeckHtml } from '../../lib/present/decks'

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
 * mínimo que permite lo único que queremos permitir — que lo enmarquemos
 * nosotros.
 */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(String(params.id ?? '').replace(/\.html$/, ''))
  if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 })

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
