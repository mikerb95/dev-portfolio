import type { APIRoute } from 'astro'
import { consumeDownloadToken } from '../../../lib/cv-downloads'

const CV_FILENAME = 'CV_Michael_Rodriguez_2026.pdf'

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token')
  if (!token) return new Response('token requerido', { status: 400 })

  // Tokens "bypass-*" vienen de un fallo de DB en /api/cv/capture: no hay fila
  // que consumir, pero fail-open significa que igual se sirve el archivo.
  const ok = token.startsWith('bypass-') || (await consumeDownloadToken(token).catch(() => true))
  if (!ok) return new Response('enlace inválido o expirado', { status: 410 })

  // El PDF vive en public/ y se sirve por fetch interno en vez de node:fs:
  // el trazador de archivos de Vercel (@vercel/nft) no sigue rutas construidas
  // en runtime vía import.meta.url, así que el binario nunca llegaba a la
  // función serverless y el readFile fallaba con ENOENT en prod (nunca en dev).
  const pdfRes = await fetch(new URL(`/cv/${CV_FILENAME}`, url.origin))
  if (!pdfRes.ok) return new Response('CV no disponible por el momento', { status: 500 })
  const pdf = await pdfRes.arrayBuffer()

  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${CV_FILENAME}"`,
      'Cache-Control': 'no-store',
    },
  })
}
