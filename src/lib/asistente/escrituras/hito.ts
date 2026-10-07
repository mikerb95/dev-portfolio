// Escritura del asistente: actualizar un hito de un proyecto (RF-210, fase 5).
//
// Un hito visible es lo que el cliente ve como línea de tiempo en su portal, y
// completarlo le manda un correo (lib/portal/hitos.ts, la misma regla que el
// formulario del panel). Por eso la tarjeta lo dice en grande antes de
// aprobar: es lo único de estas escrituras que sale del panel y no se deshace.
// Se decidió así, y no callar el aviso, porque un hito completado sin aviso
// queda en el portal sin que el cliente se entere, y reabrirlo y cerrarlo de
// nuevo desde el panel es la única forma de mandarlo después.
//
// No cambia la visibilidad para el cliente: mostrarle o esconderle un hito es
// una decisión sobre la relación con el cliente, y se toma en el panel.
//
// Importa `src/db`: solo servidor.

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { clients, projectMilestones, projects } from '../../../db/schema'
import { formatFechaCorta, parseFechaCalendario } from '../../fecha-co'
import { actualizarHito, avisaAlCliente, ESTADOS_HITO, type CambiosHito, type Hito } from '../../portal/hitos'
import { etiquetaEstado, soloDistintos, type CampoCambio, type Hecho, type VistaCambio } from './cambio'

export const NOMBRE_ACTUALIZAR_HITO = 'actualizar_hito'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export const esquemaHito = z.object({
  hitoId: z.number().int().positive().describe('Id del hito (sale de la herramienta proyecto, en hitos)'),
  estado: z.enum(ESTADOS_HITO).optional().describe('Estado nuevo, solo si Mike lo pidió'),
  vence: z.string().regex(FECHA).optional().describe('Fecha límite nueva AAAA-MM-DD, solo si Mike la dio'),
  titulo: z.string().trim().min(1).max(200).optional().describe('Título nuevo, solo si Mike lo pidió'),
  descripcion: z.string().trim().max(1000).optional().describe('Descripción nueva (reemplaza la anterior), solo si Mike la dio'),
})

export const DESCRIPCION_ACTUALIZAR_HITO =
  'Cambia el estado, la fecha, el título o la descripción de un hito de un proyecto. No se ejecuta sola: Mike ve el antes y el después y decide. Si el hito es visible para el cliente, lo verá en su portal, y completarlo le manda un aviso por correo: la tarjeta se lo muestra a Mike. Busca antes el id del hito con la herramienta proyecto.'

type Preparada = { ok: true; hito: Hito; cambios: CambiosHito; vista: VistaCambio } | { ok: false; error: string }

export async function prepararHito(entrada: unknown): Promise<Preparada> {
  const parsed = esquemaHito.safeParse(entrada ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const e = parsed.data
  if (e.estado === undefined && e.vence === undefined && e.titulo === undefined && e.descripcion === undefined)
    return { ok: false, error: 'No hay nada que cambiar: pasa al menos estado, vence, titulo o descripcion.' }

  const [fila] = await db
    .select({ hito: projectMilestones, proyecto: projects.title, cliente: clients.name, empresa: clients.company, portal: clients.portalEnabled })
    .from(projectMilestones)
    .innerJoin(projects, eq(projectMilestones.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(projectMilestones.id, e.hitoId))
    .limit(1)
  if (!fila) return { ok: false, error: `No existe ningún hito con id ${e.hitoId}. Búscalo con la herramienta proyecto.` }
  const h = fila.hito

  const vence = e.vence !== undefined ? parseFechaCalendario(e.vence) : undefined
  if (vence === null) return { ok: false, error: `vence: "${e.vence}" no es una fecha válida.` }

  const cambios: CambiosHito = {}
  const campos: CampoCambio[] = []
  if (e.estado !== undefined) {
    cambios.status = e.estado
    campos.push({ campo: 'Estado', antes: etiquetaEstado(h.status), despues: etiquetaEstado(e.estado) })
  }
  if (vence) {
    cambios.dueAt = vence
    campos.push({ campo: 'Fecha límite', antes: h.dueAt ? formatFechaCorta(h.dueAt) : null, despues: formatFechaCorta(vence) })
  }
  if (e.titulo !== undefined) {
    cambios.title = e.titulo
    campos.push({ campo: 'Título', antes: h.title, despues: e.titulo })
  }
  if (e.descripcion !== undefined) {
    cambios.description = e.descripcion || null
    campos.push({ campo: 'Descripción', antes: h.description, despues: e.descripcion || null })
  }

  const distintos = soloDistintos(campos)
  if (distintos.length === 0) return { ok: false, error: `El hito "${h.title}" ya está así; no hay nada que cambiar.` }

  const nombreCliente = fila.empresa || fila.cliente
  const avisos: string[] = []
  if (h.visibleToClient && nombreCliente) {
    avisos.push(
      fila.portal
        ? `${nombreCliente} ve este hito en su portal: el cambio le aparece apenas lo apruebes.`
        : `Este hito es visible para ${nombreCliente}; lo verá cuando tenga acceso al portal.`
    )
    if (avisaAlCliente(h, cambios)) avisos.push(`Al completarlo, le llega a ${nombreCliente} un aviso por correo y en el portal.`)
  }

  return {
    ok: true,
    hito: h,
    cambios,
    vista: {
      tipo: 'cambio',
      rotulo: h.visibleToClient ? 'Hito · visible para el cliente' : 'Hito · solo interno',
      titulo: h.title,
      contexto: [fila.proyecto, nombreCliente].filter(Boolean).join(' · ') || null,
      cambios: distintos,
      avisos,
      boton: 'Aprobar y guardar',
      nota: h.visibleToClient ? 'Lo que ves arriba es lo que verá el cliente.' : 'El cliente no ve este hito.',
    },
  }
}

export async function actualizarHitoAprobado(entrada: unknown): Promise<{ ok: true; datos: Hecho & { avisado: boolean } } | { ok: false; error: string }> {
  const p = await prepararHito(entrada)
  if (!p.ok) return p
  const { avisado } = await actualizarHito(p.hito, p.cambios)
  return {
    ok: true,
    datos: {
      hecho: true,
      resumen: `Hito "${p.cambios.title ?? p.hito.title}" actualizado${avisado ? ' (se le avisó al cliente)' : ''}`,
      enlace: `/admin/projects/${p.hito.projectId}`,
      avisado,
    },
  }
}
