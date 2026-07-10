import { describe, it, expect } from 'vitest'
import { parseCspReports } from '../src/lib/security/csp-report'

describe('parseCspReports · formato legacy (application/csp-report)', () => {
  it('extrae los campos relevantes', () => {
    const body = {
      'csp-report': {
        'document-uri': 'https://codebymike.tech/projects/x?ref=y',
        'violated-directive': "script-src 'self'",
        'blocked-uri': 'https://evil.example/script.js',
        disposition: 'enforce',
      },
    }
    const [r] = parseCspReports(body)
    expect(r!.documentPath).toBe('/projects/x')
    expect(r!.violatedDirective).toBe("script-src 'self'")
    expect(r!.blockedUri).toBe('https://evil.example/script.js')
    expect(r!.disposition).toBe('enforce')
  })

  it('usa effective-directive si falta violated-directive', () => {
    const body = { 'csp-report': { 'effective-directive': 'style-src' } }
    expect(parseCspReports(body)[0]!.violatedDirective).toBe('style-src')
  })
})

describe('parseCspReports · Reporting API (application/reports+json)', () => {
  it('extrae varios reportes csp-violation de un array', () => {
    const body = [
      { type: 'csp-violation', url: 'https://codebymike.tech/status', body: { effectiveDirective: 'img-src', blockedURL: 'https://x.test/a.png', disposition: 'enforce' } },
      { type: 'deprecation', url: 'https://codebymike.tech/x' }, // debe ignorarse
    ]
    const out = parseCspReports(body)
    expect(out).toHaveLength(1)
    expect(out[0]!.documentPath).toBe('/status')
    expect(out[0]!.violatedDirective).toBe('img-src')
  })
})

describe('parseCspReports · robustez', () => {
  it('body vacío o inesperado no lanza y devuelve []', () => {
    expect(parseCspReports(null)).toEqual([])
    expect(parseCspReports(undefined)).toEqual([])
    expect(parseCspReports({})).toEqual([])
    expect(parseCspReports('texto')).toEqual([])
    expect(parseCspReports(42)).toEqual([])
  })

  it('document-uri inválida no lanza (path null)', () => {
    const body = { 'csp-report': { 'document-uri': 'no-es-una-url' } }
    expect(parseCspReports(body)[0]!.documentPath).toBeNull()
  })

  it('document-uri relativa se acepta si empieza con /', () => {
    const body = { 'csp-report': { 'document-uri': '/notes/x' } }
    expect(parseCspReports(body)[0]!.documentPath).toBe('/notes/x')
  })
})
