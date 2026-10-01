// Nombres de las imágenes de certificaciones guardadas en Blob. Módulo puro:
// lo comparten la subida (admin) y la ruta pública que las sirve.

// Solo nombres que genera el propio servidor: marca de tiempo, seis caracteres
// y una extensión de imagen. Nada de barras ni puntos sueltos, así que la ruta
// pública no puede pedir otra cosa del store (respaldos, documentos del portal).
const NAME_RE = /^\d{10,16}-[a-z0-9]{6}\.(png|jpg|webp|gif)$/

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export function isCertImageName(name: string): boolean {
  return NAME_RE.test(name)
}

export function certImageMime(name: string): string | null {
  const m = NAME_RE.exec(name)
  return m ? MIME_BY_EXT[m[1]] : null
}

export function certBlobPath(name: string): string {
  return `certs/${name}`
}

export function certPublicUrl(name: string): string {
  return `/api/certs/${name}`
}
