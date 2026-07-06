import type { APIRoute } from 'astro'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return new Response(JSON.stringify({ error: 'Tipo de archivo no permitido' }), { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Archivo demasiado grande (máx. 5 MB)' }), { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const destDir = join(process.cwd(), 'public', 'assets', 'certs')
  const destPath = join(destDir, safeName)

  await mkdir(destDir, { recursive: true })
  await writeFile(destPath, Buffer.from(await file.arrayBuffer()))

  return new Response(
    JSON.stringify({ url: `/assets/certs/${safeName}` }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  )
}
