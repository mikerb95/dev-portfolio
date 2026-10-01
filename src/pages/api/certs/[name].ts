import type { APIRoute } from 'astro'
import { get } from '@vercel/blob'
import { serverEnv } from '../../../lib/env'
import { certBlobPath, certImageMime } from '../../../lib/cert-images'

// Imágenes de certificaciones: el store de Blob es privado, así que se sirven
// por aquí. Son públicas por naturaleza (salen en /certifications), y el nombre
// lleva marca de tiempo y no se reescribe nunca, por eso el caché es inmutable.
export const GET: APIRoute = async ({ params }) => {
  const name = params.name ?? ''
  const mime = certImageMime(name)
  const token = serverEnv('BLOB_READ_WRITE_TOKEN')
  if (!mime || !token) return new Response('Not found', { status: 404 })

  try {
    const result = await get(certBlobPath(name), { access: 'private', token })
    if (!result?.stream) return new Response('Not found', { status: 404 })
    return new Response(result.stream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
