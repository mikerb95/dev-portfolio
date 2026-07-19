import type { APIRoute } from 'astro'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { consumeDownloadToken } from '../../../lib/cv-downloads'

const CV_PATH = fileURLToPath(new URL('../../../assets/cv/CV_Michael_Rodriguez_2026.pdf', import.meta.url))
const CV_FILENAME = 'CV_Michael_Rodriguez_2026.pdf'

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token')
  if (!token) return new Response('token requerido', { status: 400 })

  // Tokens "bypass-*" vienen de un fallo de DB en /api/cv/capture: no hay fila
  // que consumir, pero fail-open significa que igual se sirve el archivo.
  const ok = token.startsWith('bypass-') || (await consumeDownloadToken(token).catch(() => true))
  if (!ok) return new Response('enlace inválido o expirado', { status: 410 })

  const pdf = await readFile(CV_PATH)
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${CV_FILENAME}"`,
      'Cache-Control': 'no-store',
    },
  })
}
