// Herramienta de lectura de la documentación del sitio: los requisitos
// funcionales y no funcionales de `src/data/documentacion.ts`, que es la misma
// fuente que pinta /docs. Responde "¿qué hace mi sitio con X?" con lo que está
// escrito y verificado, no con lo que el modelo supone de un sitio típico.
//
// Módulo puro (solo datos tipados), sin base.

import { z } from 'zod'
import { CASOS_DE_USO, REQUISITOS_FUNCIONALES, REQUISITOS_NO_FUNCIONALES, type Requisito } from '../../../data/documentacion'
import { fallo, ok, type Herramienta } from './tipos'

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Palabras que aparecen en casi todos los requisitos y no ayudan a ordenar.
const VACIAS = new Set(['que', 'como', 'con', 'del', 'los', 'las', 'una', 'por', 'para', 'sitio', 'mi', 'hace', 'cuando', 'donde', 'esta'])

type Entrada = Requisito & { modulo: string; tipo: 'funcional' | 'no funcional' }

const TODOS: Entrada[] = [
  ...REQUISITOS_FUNCIONALES.flatMap((m) => m.items.map((r) => ({ ...r, modulo: m.nombre, tipo: 'funcional' as const }))),
  ...REQUISITOS_NO_FUNCIONALES.flatMap((m) => m.items.map((r) => ({ ...r, modulo: m.nombre, tipo: 'no funcional' as const }))),
]

/** Puntaje simple por palabras: título pesa más que el cuerpo. Suficiente para unos 200 requisitos. */
export function buscarRequisitos(consulta: string, limite = 6): Entrada[] {
  const id = consulta.trim().toUpperCase()
  const exacto = TODOS.find((r) => r.id === id)
  if (exacto) return [exacto]

  const palabras = normalizar(consulta)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2 && !VACIAS.has(p))
  if (!palabras.length) return []

  return TODOS.map((r) => {
    const titulo = normalizar(r.titulo)
    const cuerpo = normalizar([r.descripcion, r.notas, r.origen, r.modulo].filter(Boolean).join(' '))
    const puntos = palabras.reduce((s, p) => s + (titulo.includes(p) ? 3 : 0) + (cuerpo.includes(p) ? 1 : 0), 0)
    return { r, puntos }
  })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite)
    .map((x) => x.r)
}

const recortar = (s: string | undefined, max: number) => (s && s.length > max ? `${s.slice(0, max)}…` : s ?? null)

const documentacionTool: Herramienta = {
  nombre: 'documentacion',
  descripcion:
    'Busca en la documentación de ingeniería del sitio (requisitos funcionales y no funcionales de /docs): qué hace, dónde vive en el código, cómo se verifica y las decisiones de diseño. Acepta un id (RF-301, RNF-03) o palabras clave.',
  esquema: z.object({
    consulta: z.string().min(2).max(120).describe('Id del requisito o palabras clave, p. ej. "pagos duplicados" o "rate limit"'),
  }),
  async ejecutar(args: { consulta: string }) {
    const hallados = buscarRequisitos(args.consulta)
    if (!hallados.length) return fallo(`Nada en la documentación coincide con "${args.consulta}". Prueba con otras palabras.`)
    const ids = new Set(hallados.map((r) => r.id))
    return ok({
      requisitos: hallados.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        modulo: r.modulo,
        titulo: r.titulo,
        estado: r.estado,
        descripcion: r.descripcion,
        dondeVive: recortar(r.origen, 400),
        verificacion: recortar(r.verificacion, 600),
        notas: recortar(r.notas, 1_200),
        relacionados: r.relacionados ?? [],
      })),
      casosDeUso: CASOS_DE_USO.filter((c) => c.rf.some((rf) => ids.has(rf))).map((c) => ({ id: c.id, nombre: c.nombre })),
    })
  },
}

export const HERRAMIENTAS_DOCUMENTACION = [documentacionTool]
