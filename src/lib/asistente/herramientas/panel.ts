// Herramienta de lectura: dónde está algo en el panel. La misma búsqueda que
// la caja del dashboard hace sin IA mientras Mike escribe (buscar-db.ts).
//
// Importa `src/db`: solo servidor.

import { z } from 'zod'
import { buscarEnPanel } from '../buscar-db'
import { ok, type Herramienta } from './tipos'

const buscarTool: Herramienta = {
  nombre: 'buscar_en_panel',
  descripcion:
    'Busca páginas del panel y fichas (clientes, proyectos, cuentas de cobro, facturas, briefings, propuestas) por nombre o tema, y devuelve el enlace de cada una. Úsala para "¿dónde veo…?", "llévame a…" o para dar el enlace exacto al final de una respuesta.',
  esquema: z.object({
    consulta: z.string().min(2).max(120).describe('Palabras a buscar, por ejemplo "dominios" o "barbería"'),
  }),
  async ejecutar(args: { consulta: string }) {
    const resultados = await buscarEnPanel(args.consulta, 8)
    return ok({
      consulta: args.consulta,
      total: resultados.length,
      resultados: resultados.map(({ puntaje: _, ...r }) => r),
    })
  },
}

export const HERRAMIENTAS_PANEL = [buscarTool]
