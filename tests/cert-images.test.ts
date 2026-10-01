import { describe, expect, it } from 'vitest'
import { certBlobPath, certImageMime, certPublicUrl, isCertImageName } from '../src/lib/cert-images'

describe('nombres de imágenes de certificaciones', () => {
  it('acepta los nombres que genera la subida', () => {
    expect(isCertImageName('1790870000000-ab12cd.png')).toBe(true)
    expect(certImageMime('1790870000000-ab12cd.jpg')).toBe('image/jpeg')
    expect(certImageMime('1790870000000-ab12cd.webp')).toBe('image/webp')
  })

  it('rechaza cualquier cosa que pueda alcanzar otra parte del store', () => {
    for (const name of [
      '../backups/portfolio.json',
      'backups/portfolio-2026-10-01.json',
      '1790870000000-ab12cd.svg',
      '1790870000000-ab12cd.png/../x',
      '1790870000000-AB12CD.png',
      '1790870000000-ab12cd.png.html',
      '',
    ]) {
      expect(isCertImageName(name)).toBe(false)
      expect(certImageMime(name)).toBeNull()
    }
  })

  it('guarda bajo certs/ y se sirve por la ruta pública', () => {
    expect(certBlobPath('1790870000000-ab12cd.png')).toBe('certs/1790870000000-ab12cd.png')
    expect(certPublicUrl('1790870000000-ab12cd.png')).toBe('/api/certs/1790870000000-ab12cd.png')
  })
})
