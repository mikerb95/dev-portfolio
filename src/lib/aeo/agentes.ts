// Agentes de IA que leen el sitio y asistentes que mandan visitas a él.
//
// Es la única lista: de aquí salen el grupo de robots.txt, el conteo de bots
// del middleware y el beacon de referidos del navegador. Si viviera en tres
// sitios, robots.txt invitaría a un bot que el panel no sabe contar.
//
// Decisión de Mike (20 oct 2026): se abren los tres tipos, incluido el
// entrenamiento. El sitio quiere que lo recomienden, y un modelo que ya
// conoce el negocio de memoria lo nombra aunque no busque en la web.
//
// Módulo PURO e isomorfo: lo importa el beacon que corre en el navegador.

/**
 * - `entrenamiento`: rastrea para entrenar modelos.
 * - `busqueda`: indexa para responder con citas (ChatGPT Search, Perplexity).
 * - `usuario`: lo dispara una persona que le pidió al asistente abrir la página.
 */
export type TipoAgente = 'entrenamiento' | 'busqueda' | 'usuario'

export type AgenteIA = {
  id: string
  /** Token de robots.txt; también es la subcadena que aparece en el User-Agent. */
  token: string
  empresa: string
  tipo: TipoAgente
  /**
   * Tokens que solo existen en robots.txt: el rastreo lo hace el bot normal
   * de la empresa (Googlebot, Applebot), así que no hay User-Agent que contar.
   */
  soloRobots?: boolean
}

export const AGENTES_IA: readonly AgenteIA[] = [
  { id: 'gptbot', token: 'GPTBot', empresa: 'OpenAI', tipo: 'entrenamiento' },
  { id: 'oai-searchbot', token: 'OAI-SearchBot', empresa: 'OpenAI', tipo: 'busqueda' },
  { id: 'chatgpt-user', token: 'ChatGPT-User', empresa: 'OpenAI', tipo: 'usuario' },
  { id: 'claudebot', token: 'ClaudeBot', empresa: 'Anthropic', tipo: 'entrenamiento' },
  { id: 'claude-searchbot', token: 'Claude-SearchBot', empresa: 'Anthropic', tipo: 'busqueda' },
  { id: 'claude-user', token: 'Claude-User', empresa: 'Anthropic', tipo: 'usuario' },
  { id: 'perplexitybot', token: 'PerplexityBot', empresa: 'Perplexity', tipo: 'busqueda' },
  { id: 'perplexity-user', token: 'Perplexity-User', empresa: 'Perplexity', tipo: 'usuario' },
  { id: 'google-extended', token: 'Google-Extended', empresa: 'Google', tipo: 'entrenamiento', soloRobots: true },
  { id: 'applebot-extended', token: 'Applebot-Extended', empresa: 'Apple', tipo: 'entrenamiento', soloRobots: true },
  { id: 'meta-externalagent', token: 'meta-externalagent', empresa: 'Meta', tipo: 'entrenamiento' },
  { id: 'ccbot', token: 'CCBot', empresa: 'Common Crawl', tipo: 'entrenamiento' },
  { id: 'amazonbot', token: 'Amazonbot', empresa: 'Amazon', tipo: 'busqueda' },
  { id: 'duckassistbot', token: 'DuckAssistBot', empresa: 'DuckDuckGo', tipo: 'busqueda' },
  { id: 'mistralai-user', token: 'MistralAI-User', empresa: 'Mistral', tipo: 'usuario' },
]

// Se compara en minúsculas y con límites de palabra: "ClaudeBot" no debe
// casar dentro de "Claude-SearchBot" ni al revés, y un navegador cualquiera
// no lleva ninguno de estos tokens.
const PATRONES = AGENTES_IA.filter((a) => !a.soloRobots).map((a) => ({
  agente: a,
  re: new RegExp(`(^|[^a-z0-9-])${a.token.toLowerCase().replace(/[-]/g, '\\-')}($|[^a-z0-9-])`),
}))

/** El agente de IA que declara el User-Agent, o `null` si no es ninguno. */
export function agenteDeUserAgent(userAgent: string | null | undefined): AgenteIA | null {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()
  for (const p of PATRONES) if (p.re.test(ua)) return p.agente
  return null
}

export type Asistente = {
  id: string
  nombre: string
  /** Hosts del referrer. Casa el host exacto o cualquier subdominio suyo. */
  hosts: readonly string[]
  /** Valores de `utm_source` que el asistente añade a sus enlaces. */
  utm?: readonly string[]
}

// ChatGPT y Perplexity marcan sus enlaces con utm_source, y es la señal más
// fiable: varios asistentes abren los enlaces con `noreferrer` y entonces el
// referrer llega vacío.
export const ASISTENTES: readonly Asistente[] = [
  { id: 'chatgpt', nombre: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'], utm: ['chatgpt.com'] },
  { id: 'perplexity', nombre: 'Perplexity', hosts: ['perplexity.ai'], utm: ['perplexity', 'perplexity.ai'] },
  { id: 'claude', nombre: 'Claude', hosts: ['claude.ai'] },
  { id: 'gemini', nombre: 'Gemini', hosts: ['gemini.google.com'] },
  { id: 'copilot', nombre: 'Copilot', hosts: ['copilot.microsoft.com'], utm: ['copilot.com'] },
  { id: 'deepseek', nombre: 'DeepSeek', hosts: ['chat.deepseek.com'] },
  { id: 'meta-ai', nombre: 'Meta AI', hosts: ['meta.ai'] },
  { id: 'grok', nombre: 'Grok', hosts: ['grok.com'] },
  { id: 'mistral', nombre: 'Le Chat', hosts: ['chat.mistral.ai'] },
]

const IDS_ASISTENTE = new Set(ASISTENTES.map((a) => a.id))

/** ¿Es un id de asistente conocido? El endpoint del beacon solo acepta estos. */
export function esAsistente(id: unknown): id is string {
  return typeof id === 'string' && IDS_ASISTENTE.has(id)
}

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * El asistente del que viene una visita, mirando primero `utm_source` y
 * después el host del referrer. `null` si no viene de ninguno.
 */
export function asistenteDeVisita(input: { referrer?: string | null; utmSource?: string | null }): Asistente | null {
  const utm = (input.utmSource ?? '').trim().toLowerCase()
  if (utm) {
    const porUtm = ASISTENTES.find((a) => a.utm?.includes(utm))
    if (porUtm) return porUtm
  }
  const host = input.referrer ? hostDe(input.referrer) : null
  if (!host) return null
  return ASISTENTES.find((a) => a.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null
}
