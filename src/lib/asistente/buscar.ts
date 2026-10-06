// Búsqueda instantánea del panel: la caja del dashboard la usa mientras Mike
// escribe, sin IA y sin gastar nada. El asistente la usa también como
// herramienta (`buscar_en_panel`) para responder "¿dónde veo…?" con un enlace.
//
// Este módulo es la parte pura (normalizar, puntuar, buscar en el menú). Las
// fichas de la base (clientes, proyectos, cuentas…) las busca buscar-db.ts.
//
// Módulo puro.

import { GRUPOS_PANEL } from '../../data/panel-nav'

export type TipoResultado = 'pagina' | 'cliente' | 'proyecto' | 'cuenta' | 'factura' | 'cotizacion' | 'propuesta'

export type ResultadoBusqueda = {
  tipo: TipoResultado
  titulo: string
  detalle: string | null
  href: string
  puntaje: number
}

/** Sin tildes, en minúscula y con un solo espacio: "Dónde  está" casa con "donde esta". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras que no ayudan a encontrar nada. Mike escribe en lenguaje normal
// ("¿dónde están los dominios que me vencen?") y la caja sirve igual para
// buscar que para preguntar: sin este filtro, "me" y "los" casarían con todo.
const VACIAS = new Set(
  'a al como con cual cuales cuando de del donde el en es esta estan hay la las lo los me mi mis para por que quien quienes se su sus te tengo un una unos unas y ya ver veo abrir ir'.split(' ')
)

export function terminos(consulta: string): string[] {
  return [...new Set(normalizar(consulta).split(' ').filter((t) => t.length > 1 && !VACIAS.has(t)))]
}

/**
 * Qué tan bien casa un texto con los términos. Pesa más la etiqueta que las
 * palabras clave, y un inicio de palabra más que un pedazo suelto. Si menos de
 * la mitad de los términos aparecen, cero: en una pregunta larga, casar con
 * una sola palabra suele ser casualidad.
 */
export function puntuar(ts: string[], titulo: string, extra = ''): number {
  if (!ts.length) return 0
  const t = normalizar(titulo)
  const palabrasT = t.split(' ')
  const e = normalizar(extra)
  const palabrasE = e.split(' ')
  let puntaje = 0
  let casados = 0
  for (const termino of ts) {
    let p = 0
    if (t.startsWith(termino)) p = 4
    else if (palabrasT.some((w) => w.startsWith(termino))) p = 3
    else if (t.includes(termino)) p = 2
    else if (palabrasE.some((w) => w.startsWith(termino))) p = 1.5
    else if (termino.length > 3 && e.includes(termino)) p = 1
    if (p > 0) casados++
    puntaje += p
  }
  return casados * 2 >= ts.length ? puntaje : 0
}

/** Páginas del panel que casan con la consulta, mejor puntaje primero. */
export function buscarEnMenu(consulta: string, limite = 6): ResultadoBusqueda[] {
  const ts = terminos(consulta)
  if (!ts.length) return []
  return GRUPOS_PANEL.flatMap((g) =>
    g.links.map((l) => ({
      tipo: 'pagina' as const,
      titulo: l.label,
      detalle: g.title,
      href: l.href,
      puntaje: puntuar(ts, l.label, `${l.claves ?? ''} ${g.title}`),
    }))
  )
    .filter((r) => r.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite)
}

/** Mezcla resultados de varias fuentes sin repetir enlaces. */
export function mezclar(listas: ResultadoBusqueda[][], limite = 10): ResultadoBusqueda[] {
  const vistos = new Set<string>()
  return listas
    .flat()
    .sort((a, b) => b.puntaje - a.puntaje)
    .filter((r) => (vistos.has(r.href + r.titulo) ? false : (vistos.add(r.href + r.titulo), true)))
    .slice(0, limite)
}
