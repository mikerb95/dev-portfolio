import { describe, expect, it } from 'vitest'
import {
  canSetStatus,
  countOpenBySeverity,
  fingerprint,
  normalizeFinding,
  normalizeSeverity,
  parseAxeViolations,
  parseZapReport,
  parseNpmAudit,
} from '../src/lib/lab/findings'

describe('fingerprint', () => {
  it('es estable para la misma fuente/regla/ruta', () => {
    expect(fingerprint('axe', 'color-contrast', '/')).toBe(fingerprint('axe', 'color-contrast', '/'))
  })

  it('distingue por ruta, regla y fuente', () => {
    const base = fingerprint('axe', 'color-contrast', '/')
    expect(fingerprint('axe', 'color-contrast', '/contact')).not.toBe(base)
    expect(fingerprint('axe', 'label', '/')).not.toBe(base)
    expect(fingerprint('codeql', 'color-contrast', '/')).not.toBe(base)
  })

  it('trata null y cadena vacía igual (ambos = ausencia)', () => {
    expect(fingerprint('npm-audit', null, null)).toBe(fingerprint('npm-audit', '', ''))
  })
})

describe('normalizeSeverity', () => {
  it('mapea las escalas de cada herramienta a la nuestra', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical')
    expect(normalizeSeverity('serious')).toBe('high') // axe
    expect(normalizeSeverity('moderate')).toBe('medium') // npm audit
    expect(normalizeSeverity('minor')).toBe('low') // axe
    expect(normalizeSeverity('cualquier-cosa')).toBe('info')
    expect(normalizeSeverity(undefined)).toBe('info')
  })
})

describe('normalizeFinding', () => {
  it('acepta un hallazgo completo', () => {
    const f = normalizeFinding({
      source: 'axe',
      severity: 'serious',
      title: 'Contraste insuficiente',
      route: '/',
      ruleId: 'color-contrast',
    })
    expect(f).toMatchObject({ source: 'axe', severity: 'high', ruleId: 'color-contrast' })
  })

  it('rechaza fuente desconocida o título ausente', () => {
    expect(normalizeFinding({ source: 'inventada', title: 'x' })).toBeNull()
    expect(normalizeFinding({ source: 'axe', title: '  ' })).toBeNull()
    expect(normalizeFinding(null)).toBeNull()
    expect(normalizeFinding('string')).toBeNull()
  })

  it('recorta textos largos', () => {
    const f = normalizeFinding({ source: 'axe', title: 'x'.repeat(500) })
    expect(f?.title.length).toBe(300)
  })
})

describe('parseNpmAudit', () => {
  const report = {
    vulnerabilities: {
      lodash: {
        severity: 'high',
        via: [{ title: 'Prototype Pollution', url: 'https://example/advisory/1', source: 1065 }],
      },
      minimist: {
        severity: 'moderate',
        via: ['lodash'], // vuln transitiva: `via` son strings
      },
    },
  }

  it('genera un hallazgo por paquete vulnerable', () => {
    const out = parseNpmAudit(report)
    expect(out).toHaveLength(2)

    const lodash = out.find((f) => f.route === 'lodash')!
    expect(lodash.severity).toBe('high')
    expect(lodash.title).toContain('Prototype Pollution')
    expect(lodash.ruleId).toBe('npm-1065')

    const minimist = out.find((f) => f.route === 'minimist')!
    expect(minimist.severity).toBe('medium')
    expect(minimist.ruleId).toBe('npm-minimist') // sin advisory → cae al nombre
  })

  it('devuelve [] ante entrada vacía o malformada', () => {
    expect(parseNpmAudit({})).toEqual([])
    expect(parseNpmAudit(null)).toEqual([])
    expect(parseNpmAudit({ vulnerabilities: 'no-es-objeto' })).toEqual([])
  })
})

describe('parseAxeViolations', () => {
  const violations = [
    {
      id: 'color-contrast',
      impact: 'serious',
      help: 'Los elementos deben tener contraste suficiente',
      description: 'Asegura el contraste entre texto y fondo',
      nodes: [{}, {}],
    },
    { id: 'label', impact: 'critical', help: 'Los campos necesitan etiqueta', nodes: [{}] },
  ]

  it('genera un hallazgo por violación, acotado a la página', () => {
    const out = parseAxeViolations(violations, '/contact')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ source: 'axe', severity: 'high', route: '/contact', ruleId: 'color-contrast' })
    expect(out[0].description).toContain('2 elemento(s)')
    expect(out[1].severity).toBe('critical')
  })

  it('la misma regla en dos páginas son hallazgos distintos', () => {
    const a = parseAxeViolations(violations, '/')[0]
    const b = parseAxeViolations(violations, '/contact')[0]
    expect(fingerprint(a.source, a.ruleId, a.route)).not.toBe(
      fingerprint(b.source, b.ruleId, b.route)
    )
  })

  it('tolera entrada no-array', () => {
    expect(parseAxeViolations(undefined, '/')).toEqual([])
  })
})

describe('parseZapReport', () => {
  const report = {
    site: [
      {
        '@name': 'https://preview.example.vercel.app',
        alerts: [
          {
            pluginid: '10038',
            name: 'Content Security Policy (CSP) Header Not Set',
            riskdesc: 'Medium (High)',
            desc: 'CSP es una capa adicional de seguridad...',
            instances: [{ uri: 'https://preview.example.vercel.app/' }, { uri: 'https://preview.example.vercel.app/contact' }],
          },
          {
            pluginid: '10202',
            name: 'Absence of Anti-CSRF Tokens',
            riskdesc: 'High (Medium)',
            instances: [{ uri: 'https://preview.example.vercel.app/pay' }],
          },
        ],
      },
    ],
  }

  it('genera un hallazgo por (alerta, instancia)', () => {
    const out = parseZapReport(report)
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ source: 'zap', severity: 'medium', ruleId: '10038', route: 'https://preview.example.vercel.app/' })
    expect(out[1].route).toBe('https://preview.example.vercel.app/contact')
    expect(out[2]).toMatchObject({ severity: 'high', ruleId: '10202' })
  })

  it('usa solo la primera palabra de riskdesc para la severidad', () => {
    expect(parseZapReport(report)[0].severity).toBe('medium')
  })

  it('acota el número de instancias por alerta', () => {
    const manyInstances = {
      site: [{
        alerts: [{
          pluginid: '1',
          name: 'x',
          riskdesc: 'Low (Low)',
          instances: Array.from({ length: 50 }, (_, i) => ({ uri: `/p${i}` })),
        }],
      }],
    }
    expect(parseZapReport(manyInstances)).toHaveLength(15)
  })

  it('tolera entrada sin site[] o sin alerts[]', () => {
    expect(parseZapReport(undefined)).toEqual([])
    expect(parseZapReport({})).toEqual([])
    expect(parseZapReport({ site: [{}] })).toEqual([])
  })
})

describe('canSetStatus', () => {
  it('permite reabrir, resolver, aceptar y reclasificar', () => {
    expect(canSetStatus('open', 'resolved')).toBe(true)
    expect(canSetStatus('open', 'accepted')).toBe(true)
    expect(canSetStatus('resolved', 'open')).toBe(true)
    expect(canSetStatus('resolved', 'accepted')).toBe(true)
  })

  it('un no-op no es transición', () => {
    expect(canSetStatus('open', 'open')).toBe(false)
    expect(canSetStatus('resolved', 'resolved')).toBe(false)
  })
})

describe('countOpenBySeverity', () => {
  it('cuenta solo los abiertos', () => {
    const counts = countOpenBySeverity([
      { status: 'open', severity: 'critical' },
      { status: 'open', severity: 'critical' },
      { status: 'open', severity: 'low' },
      { status: 'resolved', severity: 'high' }, // no cuenta
      { status: 'accepted', severity: 'critical' }, // no cuenta
    ])
    expect(counts).toEqual({ critical: 2, high: 0, medium: 0, low: 1, info: 0 })
  })
})
