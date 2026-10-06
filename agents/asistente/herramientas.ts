// Adaptador de las herramientas del asistente (src/lib/asistente/herramientas)
// a la Agent SDK, como servidor MCP en proceso. Aquí no se define ninguna
// herramienta: la versión del panel (fase 7) usará las mismas definiciones.
//
// Importa `src/db`, que fija la URL de la base al importarse: se carga con
// import() después de decidir contra qué base corre (ver index.ts).

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { ejecutar, HERRAMIENTAS } from '../../src/lib/asistente/herramientas'

export const SERVIDOR = 'negocio'

export const nombreSdk = (nombre: string) => `mcp__${SERVIDOR}__${nombre}`

/** Recibe una copia de lo que devuelve cada herramienta (la guardia de cifras la usa). */
export type Observador = (herramienta: string, datos: unknown) => void

export function crearServidorNegocio(observar?: Observador) {
  return createSdkMcpServer({
    name: SERVIDOR,
    version: '1.0.0',
    // Son diez herramientas: cargarlas de entrada sale más barato que buscarlas en cada sesión.
    alwaysLoad: true,
    tools: HERRAMIENTAS.map((h) =>
      tool(
        h.nombre,
        h.descripcion,
        h.esquema.shape,
        async (args) => {
          const r = await ejecutar(h.nombre, args)
          if (!r.ok) return { content: [{ type: 'text' as const, text: r.error }], isError: true }
          try {
            observar?.(h.nombre, r.datos)
          } catch {
            // Accesorio: si falla, el agente sigue.
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify(r.datos) }] }
        },
        { annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }
      )
    ),
  })
}

export const HERRAMIENTAS_NEGOCIO = HERRAMIENTAS.map((h) => nombreSdk(h.nombre))
