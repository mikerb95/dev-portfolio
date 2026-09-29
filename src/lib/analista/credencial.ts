// De dónde sale el pago del analista: SOLO de una API key de Claude Platform.
//
// La Agent SDK corre el binario de Claude Code, y ese binario, si no encuentra
// una API key, usa sin avisar el login de claude.ai de la máquina (el plan
// personal del administrador). Así se gastaron las primeras corridas de este
// agente. Tres defensas, de la más débil a la más fuerte:
//  1. Sin ANTHROPIC_API_KEY el motor no arranca.
//  2. El subproceso recibe una carpeta de configuración vacía, donde no existe
//     ningún login de claude.ai al que caer.
//  3. Al arrancar, la SDK informa de dónde sacó la credencial; si no es la
//     API key, la consulta se aborta antes de la primera llamada al modelo.
//
// Módulo puro: sin BD ni red, para poder probarlo aislado.

export const FUENTE_ESPERADA = 'ANTHROPIC_API_KEY'

export class SinApiKey extends Error {
  constructor() {
    super(
      'Falta ANTHROPIC_API_KEY. El analista solo corre con una API key de Claude Platform ' +
        '(platform.claude.com → API keys) puesta en el .env; nunca con el login de claude.ai.'
    )
    this.name = 'SinApiKey'
  }
}

export class FuenteIncorrecta extends Error {
  constructor(fuente: string | undefined) {
    super(`El agente arrancó con la credencial "${fuente ?? 'desconocida'}" y no con la API key. Se aborta para no gastar de otra cuenta.`)
    this.name = 'FuenteIncorrecta'
  }
}

/** La API key a usar, o lanza SinApiKey. Acepta solo claves con forma de Claude Platform. */
export function exigirApiKey(valor: string | undefined): string {
  const clave = valor?.trim()
  if (!clave || !clave.startsWith('sk-ant-')) throw new SinApiKey()
  return clave
}

/**
 * Entorno del subproceso: el del proceso sin las credenciales del sitio ni
 * ninguna otra vía de autenticación con Anthropic, más la API key y una
 * carpeta de configuración propia.
 */
export function entornoAislado(
  base: Record<string, string | undefined>,
  opciones: { apiKey: string; configDir: string; clavesDelSitio: Set<string> }
): Record<string, string | undefined> {
  const fuera = /^(TURSO_|ANTHROPIC_|CLAUDE_CODE_OAUTH|CLAUDE_CONFIG_DIR$|CLAUDE_CODE_USE_)/
  const limpio = Object.fromEntries(
    Object.entries(base).filter(([k]) => !opciones.clavesDelSitio.has(k) && !fuera.test(k))
  )
  return { ...limpio, ANTHROPIC_API_KEY: opciones.apiKey, CLAUDE_CONFIG_DIR: opciones.configDir }
}

/** Lanza si la SDK arrancó con otra credencial que no sea la API key. */
export function verificarFuente(fuente: string | undefined): void {
  if (fuente !== FUENTE_ESPERADA) throw new FuenteIncorrecta(fuente)
}
