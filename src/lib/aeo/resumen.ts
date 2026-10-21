// Agregados de los contadores de AEO para el panel. Puro, sin BD.

export type TipoConteo = 'bot' | 'referido'

export type FilaAeo = { dia: string; tipo: TipoConteo; fuente: string; hits: number; hitsLlms: number }

export type ResumenFuente = { fuente: string; hits: number; hitsLlms: number; ultimoDia: string }

/** Totales por fuente, de la más activa a la menos. Puro: se prueba sin BD. */
export function resumirPorFuente(filas: readonly FilaAeo[], tipo: TipoConteo): ResumenFuente[] {
  const mapa = new Map<string, ResumenFuente>()
  for (const f of filas) {
    if (f.tipo !== tipo) continue
    const r = mapa.get(f.fuente) ?? { fuente: f.fuente, hits: 0, hitsLlms: 0, ultimoDia: f.dia }
    r.hits += f.hits
    r.hitsLlms += f.hitsLlms
    if (f.dia > r.ultimoDia) r.ultimoDia = f.dia
    mapa.set(f.fuente, r)
  }
  return [...mapa.values()].sort((a, b) => b.hits - a.hits || a.fuente.localeCompare(b.fuente))
}
