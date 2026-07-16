import type { APIRoute } from 'astro'
import { clientDocument, signedDownloadUrl } from '../../../../lib/portal/documents'
import { requirePortalSession } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'

/**
 * Descarga de un documento.
 *
 * El orden importa y es siempre el mismo: sesión → propiedad → auditoría →
 * firma. La URL del blob no sale nunca de aquí en claro; lo que recibe el
 * navegador es un 302 a una URL firmada que caduca en 5 minutos, así que
 * reenviar el enlace a un tercero no le sirve de gran cosa.
 *
 * Un documento ajeno o inexistente da el MISMO 404: distinguirlos con un 403
 * confirmaría que ese id existe, que es justo lo que no quiero decirle a quien
 * está probando ids.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requirePortalSession(context)
  if (auth.response) return auth.response
  const { session } = auth

  // `billing` no ve documentos (mismo reparto de roles que el menú).
  if (session.user.role === 'billing') {
    return new Response('No encontrado', { status: 404 })
  }

  const id = Number(context.params.id)
  if (!Number.isInteger(id)) return new Response('No encontrado', { status: 404 })

  const doc = await clientDocument(session.client.id, id)
  if (!doc || !doc.visibleToClient) return new Response('No encontrado', { status: 404 })

  // Se audita ANTES de firmar: si el registro fallara después de entregar la
  // URL, tendría una descarga sin rastro. Al revés, como mucho sobra una línea.
  audit({
    clientId: session.client.id,
    clientUserId: session.user.id,
    action: 'document.download',
    entity: 'document',
    entityId: doc.id,
    detail: doc.title,
    ip: clientIp(context.request.headers),
  })

  try {
    const url = await signedDownloadUrl(doc)
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // La URL firmada caduca; que un proxy intermedio la cachee y la sirva
        // luego a otro sería exactamente el agujero que se está evitando.
        'Cache-Control': 'no-store, private',
      },
    })
  } catch {
    // El blob no existe o Blob está caído: no es culpa del cliente y no hay
    // nada que pueda hacer, así que se le dice claro en vez de un 404 confuso.
    return new Response('El archivo no está disponible ahora mismo. Inténtalo en unos minutos.', { status: 503 })
  }
}
