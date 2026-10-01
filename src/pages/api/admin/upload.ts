import type { APIRoute } from 'astro'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { put } from '@vercel/blob'
import { serverEnv } from '../../../lib/env'
import { certBlobPath, certPublicUrl } from '../../../lib/cert-images'

// SVG queda fuera: puede contener <script> y se serviría como HTML/XSS almacenado.
const ALLOWED_EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 })
  }

  const ext = ALLOWED_EXT_BY_TYPE[file.type]
  if (!ext) {
    return new Response(JSON.stringify({ error: 'Tipo de archivo no permitido' }), { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Archivo demasiado grande (máx. 5 MB)' }), { status: 400 })
  }

  // Extensión derivada del MIME validado arriba, nunca del nombre que envía el cliente.
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}.${ext}`

  // En Vercel el disco es de solo lectura: escribir en public/ fallaba siempre.
  // El store de Blob conectado es privado (el público de los mazos no lo está),
  // así que la imagen se guarda privada y la sirve /api/certs/[name]. Sin token
  // (desarrollo local) se conserva el disco, que ahí sí funciona.
  const token = serverEnv('BLOB_READ_WRITE_TOKEN')
  if (token) {
    try {
      await put(certBlobPath(safeName), file, {
        access: 'private',
        contentType: file.type,
        addRandomSuffix: false,
        token,
      })
    } catch (err) {
      console.error('[upload] Blob', err)
      return new Response(JSON.stringify({ error: 'No se pudo guardar la imagen' }), { status: 502 })
    }
    return new Response(JSON.stringify({ url: certPublicUrl(safeName) }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const destDir = join(process.cwd(), 'public', 'assets', 'certs')
  await mkdir(destDir, { recursive: true })
  await writeFile(join(destDir, safeName), Buffer.from(await file.arrayBuffer()))

  return new Response(
    JSON.stringify({ url: `/assets/certs/${safeName}` }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  )
}
