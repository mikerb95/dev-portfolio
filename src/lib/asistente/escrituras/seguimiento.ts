// Escritura del asistente: anotar en el seguimiento comercial una llamada, una
// reunión, una nota o un pendiente con fecha, y de paso cerrar el pendiente
// que esa anotación resuelve (RF-210, fase 5). Es lo que hoy se hace en
// /admin/seguimiento con normalizeInteractionInput, y se reutiliza esa misma
// función para que lo anotado desde aquí y desde el formulario sea igual.
//
// Cerrar un pendiente no lo borra: queda con `done` y su fecha, como el
// checkbox del panel.
//
// Importa `src/db`: solo servidor.

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { clients, interactions, projects } from '../../../db/schema'
import { formatFechaCorta, parseFechaCalendario } from '../../fecha-co'
import { INTERACTION_TYPES, normalizeInteractionInput, TYPE_LABELS } from '../../interactions'
import type { CampoCambio, Hecho, VistaCambio } from './cambio'

export const NOMBRE_REGISTRAR_SEGUIMIENTO = 'registrar_seguimiento'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export const esquemaSeguimiento = z.object({
  tipo: z.enum(INTERACTION_TYPES).describe('call (llamada), meeting (reunión), email, whatsapp, note (nota), task (tarea) u other'),
  titulo: z.string().trim().min(1).max(200).describe('Qué pasó o qué hay que hacer, en una línea'),
  detalle: z.string().trim().max(2000).optional().describe('Detalle, tal como lo contó Mike'),
  clienteId: z.number().int().positive().optional().describe('Id del cliente, si es de un cliente'),
  proyectoId: z.number().int().positive().optional().describe('Id del proyecto, si es de un proyecto'),
  siguientePaso: z.string().trim().max(300).optional().describe('El pendiente que queda, si Mike dijo uno'),
  vence: z.string().regex(FECHA).optional().describe('Fecha del pendiente AAAA-MM-DD, si Mike la dio'),
  cierraPendienteId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Id de un pendiente abierto (de la herramienta seguimiento) que esta anotación resuelve; queda marcado como hecho'),
})

export const DESCRIPCION_REGISTRAR_SEGUIMIENTO =
  'Anota en el seguimiento comercial una llamada, reunión, nota o tarea, con su pendiente y fecha si los hay, y opcionalmente marca como hecho el pendiente que resuelve. No se ejecuta sola: Mike ve lo que se anota y decide. Busca antes los ids de cliente, proyecto o pendiente con las herramientas de lectura.'

type Preparada =
  | { ok: true; valores: Record<string, unknown>; cierra: number | null; vista: VistaCambio }
  | { ok: false; error: string }

export async function prepararSeguimiento(entrada: unknown): Promise<Preparada> {
  const parsed = esquemaSeguimiento.safeParse(entrada ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const e = parsed.data

  let cliente: { id: number; nombre: string } | null = null
  if (e.clienteId) {
    const [c] = await db.select({ id: clients.id, nombre: clients.name, empresa: clients.company }).from(clients).where(eq(clients.id, e.clienteId)).limit(1)
    if (!c) return { ok: false, error: `No existe ningún cliente con id ${e.clienteId}.` }
    cliente = { id: c.id, nombre: c.empresa || c.nombre }
  }

  let proyecto: { id: number; titulo: string } | null = null
  if (e.proyectoId) {
    const [p] = await db.select({ id: projects.id, titulo: projects.title, clientId: projects.clientId }).from(projects).where(eq(projects.id, e.proyectoId)).limit(1)
    if (!p) return { ok: false, error: `No existe ningún proyecto con id ${e.proyectoId}.` }
    // Una nota del cliente A sobre el proyecto de B quedaría en dos fichas que no se hablan.
    if (cliente && p.clientId !== null && p.clientId !== cliente.id) return { ok: false, error: `El proyecto ${p.titulo} no es de ${cliente.nombre}.` }
    proyecto = { id: p.id, titulo: p.titulo }
  }

  const vence = e.vence !== undefined ? parseFechaCalendario(e.vence) : null
  if (e.vence !== undefined && !vence) return { ok: false, error: `vence: "${e.vence}" no es una fecha válida.` }

  let cierra: { id: number; titulo: string } | null = null
  if (e.cierraPendienteId) {
    const [x] = await db
      .select({ id: interactions.id, titulo: interactions.title })
      .from(interactions)
      .where(and(eq(interactions.id, e.cierraPendienteId), eq(interactions.done, false)))
      .limit(1)
    if (!x) return { ok: false, error: `El pendiente ${e.cierraPendienteId} no existe o ya está hecho.` }
    cierra = x
  }

  const valores = normalizeInteractionInput(
    {
      type: e.tipo,
      title: e.titulo,
      body: e.detalle,
      clientId: cliente?.id ?? null,
      projectId: proyecto?.id ?? null,
      nextAction: e.siguientePaso,
      dueDate: vence ?? null,
    },
    { forInsert: true }
  )

  // El título ya va en la cabecera de la tarjeta: aquí solo lo demás.
  const campos: CampoCambio[] = [{ campo: 'Tipo', antes: null, despues: TYPE_LABELS[e.tipo] }]
  if (e.detalle) campos.push({ campo: 'Detalle', antes: null, despues: e.detalle })
  if (e.siguientePaso) campos.push({ campo: 'Pendiente', antes: null, despues: e.siguientePaso })
  if (vence) campos.push({ campo: 'Para el', antes: null, despues: formatFechaCorta(vence) })
  if (cierra) campos.push({ campo: 'Cierra el pendiente', antes: cierra.titulo, despues: 'Hecho' })

  return {
    ok: true,
    valores,
    cierra: cierra?.id ?? null,
    vista: {
      tipo: 'cambio',
      rotulo: 'Seguimiento nuevo',
      titulo: e.titulo,
      contexto: [cliente?.nombre, proyecto?.titulo].filter(Boolean).join(' · ') || null,
      cambios: campos,
      avisos: [],
      boton: 'Aprobar y anotar',
      nota: 'Queda en tu seguimiento. El cliente no lo ve.',
    },
  }
}

export async function registrarSeguimientoAprobado(entrada: unknown): Promise<{ ok: true; datos: Hecho & { id: number } } | { ok: false; error: string }> {
  const p = await prepararSeguimiento(entrada)
  if (!p.ok) return p
  const ahora = new Date()
  // Las dos cosas o ninguna: una nota anotada con su pendiente todavía abierto
  // haría que el asistente lo volviera a proponer mañana.
  const id = await db.transaction(async (tx) => {
    const [fila] = await tx
      .insert(interactions)
      .values({ ...(p.valores as typeof interactions.$inferInsert), createdAt: ahora, updatedAt: ahora })
      .returning({ id: interactions.id })
    if (p.cierra) await tx.update(interactions).set({ done: true, doneAt: ahora, updatedAt: ahora }).where(eq(interactions.id, p.cierra))
    return fila!.id
  })
  return { ok: true, datos: { hecho: true, resumen: 'Anotado en el seguimiento', enlace: '/admin/seguimiento', id } }
}
