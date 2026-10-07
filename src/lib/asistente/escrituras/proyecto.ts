// Escritura del asistente: cambiar el estado o las fechas de un proyecto, o
// anotar algo en sus notas internas (RF-210, fase 5 del plan).
//
// Lo que NO toca, a propósito: título, slug, descripción, visibilidad en el
// portafolio y URLs. Esos campos salen publicados en codebymike.net, y un
// cambio público no debería nacer de una frase en la caja del dashboard. El
// stack tampoco: hoy se guarda en dos formatos según la página que lo escriba.
//
// Las notas internas solo crecen: la nota nueva va al final con su fecha y lo
// anterior no se reescribe (principio 4 del plan, el asistente nunca borra).
//
// Importa `src/db`: solo servidor.

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { clients, projects } from '../../../db/schema'
import { fechaISOEnColombia, formatFechaCorta, parseFechaCalendario } from '../../fecha-co'
import { etiquetaEstado, soloDistintos, type CampoCambio, type Hecho, type VistaCambio } from './cambio'

export const NOMBRE_ACTUALIZAR_PROYECTO = 'actualizar_proyecto'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const ESTADOS = ['activo', 'pausado', 'completado', 'archivado'] as const

export const esquemaProyecto = z.object({
  proyectoId: z.number().int().positive().describe('Id del proyecto (sale de proyectos o proyecto)'),
  estado: z.enum(ESTADOS).optional().describe('Estado nuevo, solo si Mike lo pidió'),
  inicio: z.string().regex(FECHA).optional().describe('Fecha de inicio AAAA-MM-DD, solo si Mike la dio'),
  fin: z.string().regex(FECHA).optional().describe('Fecha de fin AAAA-MM-DD, solo si Mike la dio'),
  nota: z.string().trim().min(1).max(1000).optional().describe('Nota interna que se AGREGA al final de las notas del proyecto (no reemplaza lo anterior)'),
})

export const DESCRIPCION_ACTUALIZAR_PROYECTO =
  'Cambia el estado o las fechas de un proyecto, o agrega una nota interna. No se ejecuta sola: Mike ve el antes y el después y decide. No cambia título, descripción, visibilidad ni URLs (eso se hace en la ficha del proyecto). Pasa solo los campos que Mike pidió cambiar.'

type Preparada =
  | { ok: true; id: number; patch: Partial<typeof projects.$inferInsert>; vista: VistaCambio }
  | { ok: false; error: string }

export async function prepararProyecto(entrada: unknown, hoy = new Date()): Promise<Preparada> {
  const parsed = esquemaProyecto.safeParse(entrada ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const e = parsed.data
  if (e.estado === undefined && e.inicio === undefined && e.fin === undefined && e.nota === undefined)
    return { ok: false, error: 'No hay nada que cambiar: pasa al menos estado, inicio, fin o nota.' }

  const [p] = await db
    .select({
      id: projects.id,
      titulo: projects.title,
      estado: projects.status,
      inicio: projects.startDate,
      fin: projects.endDate,
      notas: projects.internalNotes,
      cliente: clients.name,
      empresa: clients.company,
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(projects.id, e.proyectoId))
    .limit(1)
  if (!p) return { ok: false, error: `No existe ningún proyecto con id ${e.proyectoId}. Búscalo con proyectos.` }

  const inicio = e.inicio !== undefined ? parseFechaCalendario(e.inicio) : undefined
  const fin = e.fin !== undefined ? parseFechaCalendario(e.fin) : undefined
  if (inicio === null) return { ok: false, error: `inicio: "${e.inicio}" no es una fecha válida.` }
  if (fin === null) return { ok: false, error: `fin: "${e.fin}" no es una fecha válida.` }
  const inicioFinal = inicio ?? p.inicio
  const finFinal = fin ?? p.fin
  if (inicioFinal && finFinal && finFinal < inicioFinal)
    return { ok: false, error: `La fecha de fin (${fechaISOEnColombia(finFinal)}) queda antes del inicio (${fechaISOEnColombia(inicioFinal)}).` }

  const patch: Partial<typeof projects.$inferInsert> = {}
  const cambios: CampoCambio[] = []
  if (e.estado !== undefined) {
    patch.status = e.estado
    cambios.push({ campo: 'Estado', antes: etiquetaEstado(p.estado), despues: etiquetaEstado(e.estado) })
  }
  if (inicio) {
    patch.startDate = inicio
    cambios.push({ campo: 'Inicio', antes: p.inicio ? formatFechaCorta(p.inicio) : null, despues: formatFechaCorta(inicio) })
  }
  if (fin) {
    patch.endDate = fin
    cambios.push({ campo: 'Fin', antes: p.fin ? formatFechaCorta(p.fin) : null, despues: formatFechaCorta(fin) })
  }
  if (e.nota) {
    const linea = `[${fechaISOEnColombia(hoy)}] ${e.nota}`
    patch.internalNotes = p.notas?.trim() ? `${p.notas.trimEnd()}\n\n${linea}` : linea
    cambios.push({ campo: 'Nota interna (se agrega al final)', antes: null, despues: linea })
  }

  const distintos = soloDistintos(cambios)
  if (distintos.length === 0) return { ok: false, error: `El proyecto ${p.titulo} ya está así; no hay nada que cambiar.` }

  return {
    ok: true,
    id: p.id,
    patch,
    vista: {
      tipo: 'cambio',
      rotulo: 'Proyecto',
      titulo: p.titulo,
      contexto: p.empresa || p.cliente || null,
      cambios: distintos,
      avisos: [],
      boton: 'Aprobar y guardar',
      nota: 'Solo cambia la ficha interna del proyecto. Nada se publica ni se le avisa al cliente.',
    },
  }
}

/** Escribe. Solo tras la aprobación de Mike; se prepara otra vez por si la base cambió entre tanto. */
export async function actualizarProyectoAprobado(entrada: unknown): Promise<{ ok: true; datos: Hecho } | { ok: false; error: string }> {
  const p = await prepararProyecto(entrada)
  if (!p.ok) return p
  await db.update(projects).set(p.patch).where(eq(projects.id, p.id))
  return { ok: true, datos: { hecho: true, resumen: `${p.vista.titulo} actualizado`, enlace: `/admin/projects/${p.id}` } }
}
