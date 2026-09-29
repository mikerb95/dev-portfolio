// Adaptador de las herramientas del analista (src/lib/analista/herramientas.ts)
// a la Agent SDK: las mismas definiciones que usa producción, expuestas como
// un servidor MCP en proceso. Aquí no se define ninguna herramienta; si
// divergieran, la demo del meetup enseñaría un agente distinto del del sitio.
//
// Importa `src/db`, que fija la URL de la base al importarse: se carga con
// import() después de decidir contra qué base corre (ver index.ts).

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { ejecutar, HERRAMIENTA_BLOQUEO as BLOQUEO, HERRAMIENTAS } from '../../src/lib/analista/herramientas'
import type { Seudonimos } from '../../src/lib/analista/seudonimos'

export const SERVIDOR = 'siem'

const nombreSdk = (nombre: string) => `mcp__${SERVIDOR}__${nombre}`

/** Recibe una copia de lo que devuelve cada herramienta, para pintarlo en pantalla. */
export type Observador = (herramienta: string, datos: unknown) => void

export function crearServidorSiem(seudonimos: Seudonimos, observar?: Observador) {
  return createSdkMcpServer({
    name: SERVIDOR,
    version: '1.0.0',
    // Son seis herramientas: cargarlas de entrada sale más barato que una
    // búsqueda de herramientas en cada sesión.
    alwaysLoad: true,
    tools: HERRAMIENTAS.map((h) =>
      tool(
        h.nombre,
        h.descripcion,
        h.esquema.shape,
        async (args) => {
          const r = await ejecutar(h.nombre, args, { seudonimos, rutaAuditoria: '/agente/analista-siem' })
          if (!r.ok) return { content: [{ type: 'text' as const, text: r.error }], isError: true }
          try {
            observar?.(h.nombre, r.datos)
          } catch {
            // La vista es accesoria: si falla, el agente sigue.
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify(r.datos, null, 2) }] }
        },
        { annotations: { readOnlyHint: h.soloLectura, destructiveHint: false, openWorldHint: false } }
      )
    ),
  })
}

export const HERRAMIENTAS_LECTURA = HERRAMIENTAS.filter((h) => h.soloLectura).map((h) => nombreSdk(h.nombre))

export const HERRAMIENTA_BLOQUEO = nombreSdk(BLOQUEO)
