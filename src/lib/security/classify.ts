// Clasificador de amenazas: función pura que decide si un request es hostil y,
// si lo es, con qué categoría/severidad/regla. Sin dependencias de DB → 100%
// testeable con Vitest. Es el "motor de firmas" del micro-SIEM.
//
// Alineado con OWASP Top 10 para hablar el idioma de la industria en la vitrina.
// Filosofía: preferimos falsos negativos a falsos positivos. Solo clasificamos
// lo que es inequívocamente sospechoso; el tráfico legítimo NUNCA debe matchear.
// Ver docs/plan-security-observability.md.

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type ThreatCategory =
  | 'recon_cms'
  | 'secrets_probing'
  | 'path_traversal'
  | 'injection'
  | 'auth_probing'
  | 'bad_bot'
  | 'protocol_anomaly'
  | 'honeypot'

export const THREAT_CATEGORY_LABELS: Record<ThreatCategory, string> = {
  recon_cms: 'Reconocimiento de CMS/paneles',
  secrets_probing: 'Búsqueda de secretos/config',
  path_traversal: 'Path traversal / LFI',
  injection: 'Inyección (SQLi/XSS/cmd)',
  auth_probing: 'Sondeo de autenticación',
  bad_bot: 'Bot ofensivo',
  protocol_anomaly: 'Anomalía de protocolo',
  honeypot: 'Endpoint señuelo tocado',
}

export type Classification = {
  category: ThreatCategory
  severity: Severity
  ruleId: string
}

export type RequestFacts = {
  method: string
  path: string
  /** query string SIN el '?' inicial, o cadena vacía. */
  query?: string
  userAgent?: string | null
}

type Rule = {
  id: string
  category: ThreatCategory
  severity: Severity
  /** Se evalúa contra el objetivo indicado en `field`. */
  test: (facts: NormalizedFacts) => boolean
}

// Rutas señuelo: ningún usuario legítimo las toca. Se sirven como endpoints
// reales en fases posteriores; aquí basta reconocerlas para clasificar como
// honeypot (severidad crítica: intención inequívocamente maliciosa).
export const HONEYPOT_PATHS = new Set([
  '/wp-login.php',
  '/wp-admin',
  '/xmlrpc.php',
  '/admin.php',
  '/api/v1/token',
])

type NormalizedFacts = {
  method: string
  /** path en minúsculas, decodificado (best-effort) para pillar %2e%2e etc. */
  path: string
  /** path original sin normalizar (para coincidencias exactas de honeypot). */
  rawPath: string
  /** query en minúsculas y decodificada. */
  query: string
  ua: string
}

/** Decodifica repetidamente el porcentaje-encoding (best-effort, sin lanzar). */
function safeDecode(s: string): string {
  let out = s
  for (let i = 0; i < 2; i++) {
    try {
      const dec = decodeURIComponent(out)
      if (dec === out) break
      out = dec
    } catch {
      break
    }
  }
  return out
}

function normalize(facts: RequestFacts): NormalizedFacts {
  const rawPath = facts.path || '/'
  return {
    method: (facts.method || 'GET').toUpperCase(),
    path: safeDecode(rawPath).toLowerCase(),
    rawPath,
    query: safeDecode(facts.query || '').toLowerCase(),
    ua: (facts.userAgent || '').toLowerCase(),
  }
}

// Herramientas ofensivas conocidas por su User-Agent. Palabras distintivas que
// no aparecen en UAs de navegadores/crawlers legítimos.
const BAD_BOT_UA = /\b(sqlmap|nikto|nuclei|masscan|zgrab|nmap|acunetix|wpscan|dirbuster|gobuster|feroxbuster|hydra|havij)\b/

// Firmas de inyección en path o query. Conservadoras: cadenas que casi nunca
// aparecen en tráfico legítimo.
const INJECTION_SIG = [
  /union\s+select/,
  /\bor\s+1\s*=\s*1\b/,
  /'\s*or\s*'/,
  /<script[\s>]/,
  /javascript:/,
  /\bonerror\s*=/,
  /\$\{jndi:/,
  /;\s*(wget|curl|bash|sh|nc)\b/,
  /\/bin\/(ba)?sh\b/,
]

// Firmas de traversal / LFI.
const TRAVERSAL_SIG = [
  /\.\.[\/\\]/,
  /\/etc\/passwd\b/,
  /\/proc\/self\//,
  /%00/,
  /\bwin\.ini\b/,
]

const RULES: Rule[] = [
  // recon de CMS/paneles ajenos (WordPress, Joomla, phpMyAdmin, etc.).
  {
    id: 'recon_cms.wordpress',
    category: 'recon_cms',
    severity: 'medium',
    test: (f) => /^\/(wp-|wordpress\/)/.test(f.path) || f.path.startsWith('/wp-content'),
  },
  {
    id: 'recon_cms.panels',
    category: 'recon_cms',
    severity: 'medium',
    test: (f) =>
      /^\/(administrator|phpmyadmin|pma|myadmin|adminer|cpanel|joomla|drupal|typo3)\b/.test(f.path),
  },
  // Búsqueda de secretos y ficheros de configuración expuestos.
  {
    id: 'secrets_probing.dotfiles',
    category: 'secrets_probing',
    severity: 'high',
    test: (f) =>
      /(^|\/)\.(env|git|aws|ssh|npmrc|htpasswd)\b/.test(f.path) ||
      /\/\.git\//.test(f.path) ||
      /(^|\/)(id_rsa|id_dsa|\.pem)\b/.test(f.path),
  },
  {
    id: 'secrets_probing.backups',
    category: 'secrets_probing',
    severity: 'high',
    test: (f) => /\.(sql|bak|old|backup|dump|tar\.gz|zip|7z)$/.test(f.path) || /\/backup\b/.test(f.path),
  },
  // Path traversal / LFI (OWASP A01/A03).
  {
    id: 'path_traversal',
    category: 'path_traversal',
    severity: 'high',
    test: (f) => TRAVERSAL_SIG.some((re) => re.test(f.path) || re.test(f.query)),
  },
  // Inyección: SQLi/XSS/cmd (OWASP A03).
  {
    id: 'injection',
    category: 'injection',
    severity: 'high',
    test: (f) => INJECTION_SIG.some((re) => re.test(f.path) || re.test(f.query)),
  },
  // Bots ofensivos por User-Agent.
  {
    id: 'bad_bot.ua',
    category: 'bad_bot',
    severity: 'high',
    test: (f) => BAD_BOT_UA.test(f.ua),
  },
  // Anomalías de protocolo: métodos que este sitio no usa jamás.
  {
    id: 'protocol_anomaly.method',
    category: 'protocol_anomaly',
    severity: 'medium',
    test: (f) => f.method === 'TRACE' || f.method === 'CONNECT' || f.method === 'TRACK',
  },
]

/**
 * Clasifica un request. Devuelve la primera regla que matchea (las honeypot y
 * las de mayor severidad van primero implícitamente por orden de evaluación),
 * o null si el request parece legítimo. NUNCA lanza.
 */
export function classify(facts: RequestFacts): Classification | null {
  let f: NormalizedFacts
  try {
    f = normalize(facts)
  } catch {
    return null
  }

  // Honeypot primero: coincidencia exacta de ruta señuelo = intención clara.
  if (HONEYPOT_PATHS.has(f.rawPath)) {
    return { category: 'honeypot', severity: 'critical', ruleId: 'honeypot.exact' }
  }

  for (const rule of RULES) {
    let matched = false
    try {
      matched = rule.test(f)
    } catch {
      matched = false
    }
    if (matched) {
      return { category: rule.category, severity: rule.severity, ruleId: rule.id }
    }
  }
  return null
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }

/** Compara severidades (para ordenar/priorizar). */
export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s]
}
