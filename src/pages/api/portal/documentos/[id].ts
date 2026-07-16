import type { APIRoute } from 'astro'
import { clientDocument, downloadFilename, openDocument } from '../../../../lib/portal/documents'
import { requirePortalSession } from '../../../../lib/portal/session'
import { audit } from '../../../../lib/portal/audit'
import { clientIp } from '../../../../lib/device-info'

/**
 * Descarga de un documento.
 *
 * El orden importa y es siempre el mismo: sesión → propiedad → auditoría →
 * contenido. El archivo se sirve desde aquí (ver openDocument): la URL del blob
 * no sale nunca, así que no hay enlace que reenviar ni que un proxy pueda
 * cachear y servir a otro.
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

  // Se audita ANTES de servir: si el registro fallara después de entregar el
  // archivo, tendría una descarga sin rastro. Al revés, como mucho sobra una
  // línea en el log, que es el error barato de los dos.
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
    const stream = await openDocument(doc)
    if (!stream) return new Response('El archivo ya no está disponible.', { status: 404 })

    return new Response(stream, {
      headers: {
        'Content-Type': doc.mimeType ?? 'application/octet-stream',
        // `attachment` fuerza la descarga en vez de abrirlo en el navegador:
        // un PDF o un HTML renderizado en mi dominio podría ejecutar cosas con
        // mi origen. El filename va saneado (ver downloadFilename).
        'Content-Disposition': `attachment; filename="${downloadFilename(doc)}"`,
        ...(doc.sizeBytes ? { 'Content-Length': String(doc.sizeBytes) } : {}),
        // Documento privado: ni la CDN de Vercel ni un proxy corporativo deben
        // guardarlo y servírselo luego a otra sesión.
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    // Blob caído o fila huérfana: no es culpa del cliente y no puede hacer
    // nada, así que se le dice claro en vez de un 404 confuso.
    return new Response('El archivo no está disponible ahora mismo. Inténtalo en unos minutos.', { status: 503 })
  }
}
