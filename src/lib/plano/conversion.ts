// De sí a proyecto: cuando se aprueba el anticipo de una propuesta, se crean
// el cliente (si no existía), el proyecto, sus hitos, las cuentas de cobro en
// borrador de los pagos que faltan y la invitación al portal.
//
// Idempotente: los webhooks se repiten por diseño. La propuesta se "reclama"
// con un UPDATE condicional (aceptada → convertida); solo el primero que lo
// logra convierte. Si algo falla a mitad, se devuelve a 'aceptada' para que el
// siguiente reintento (o Mike desde el panel) lo complete.
//
// Nunca lanza: el pago ya entró. Un fallo aquí no debe hacer que la pasarela
// reintente en bucle.

import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { clients, payments, projectMilestones, projects, propuestas } from '../../db/schema'
import { createCuentaCobro } from '../cuentas-cobro-db'
import { SITE_URL } from '../email'
import { parseFechaCalendario } from '../fecha-co'
import { sendPush } from '../notify'
import { normalizePhone } from '../phone'
import { inviteUser, isValidEmail } from '../portal/invitations'
import { snapshotDe, version, type Propuesta } from './db'
import type { Snapshot } from './tipos'

export type ResultadoConversion = { convertida: boolean; projectId?: number; motivo?: string }

function slug(titulo: string, id: number): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  return `${base || 'proyecto'}-p${id}`
}

async function clienteDe(p: Propuesta, s: Snapshot): Promise<number> {
  if (p.clientId) return p.clientId
  const correo = s.cliente.correo || s.contacto.contacto.correo
  if (correo) {
    const [existente] = await db.select({ id: clients.id }).from(clients).where(eq(clients.email, correo)).limit(1)
    if (existente) return existente.id
  }
  const [fila] = await db
    .insert(clients)
    .values({
      name: s.cliente.nombre || s.contacto.contacto.nombre || p.titulo,
      email: correo || null,
      phone: normalizePhone(s.cliente.telefono || s.contacto.contacto.telefono),
      company: s.cliente.empresa || null,
      billingInfo: s.cliente.documento ? JSON.stringify({ documento: s.cliente.documento }) : null,
      notes: `Creado desde la propuesta #${p.id} de Plano.`,
      createdAt: new Date(),
    })
    .returning({ id: clients.id })
  return fila.id
}

export async function convertir(p: Propuesta): Promise<ResultadoConversion> {
  if (!p.aceptadaVersion) return { convertida: false, motivo: 'sin versión aceptada' }
  const reclamada = await db
    .update(propuestas)
    .set({ estado: 'convertida', actualizadaEl: new Date() })
    .where(and(eq(propuestas.id, p.id), eq(propuestas.estado, 'aceptada'), isNull(propuestas.projectId)))
  if (reclamada.rowsAffected === 0) return { convertida: false, motivo: 'ya convertida' }

  try {
    const v = await version(p.id, p.aceptadaVersion)
    if (!v) throw new Error('versión aceptada no encontrada')
    const s = snapshotDe(v)
    const clientId = await clienteDe(p, s)
    const firma = s.hitos.find((h) => h.id === 'firma')?.fecha
    const pub = s.hitos.find((h) => h.id === 'publicacion')?.fecha
    const [proyecto] = await db
      .insert(projects)
      .values({
        slug: slug(s.titulo, p.id),
        title: s.titulo,
        description: s.resumen || null,
        status: 'activo',
        visible: false,
        clientId,
        startDate: firma ? parseFechaCalendario(firma) : new Date(),
        endDate: pub ? parseFechaCalendario(pub) : null,
        internalNotes: `Propuesta #${p.id}, versión ${v.version} aceptada por ${p.aceptadaPor} (constancia ${p.aceptacionHuella}).`,
        createdAt: new Date(),
      })
      .returning({ id: projects.id })

    const hitos = s.hitos.filter((h) => h.id !== 'firma')
    if (hitos.length) {
      await db.insert(projectMilestones).values(
        hitos.map((h, i) => ({
          projectId: proyecto.id,
          title: h.nombre,
          description: h.entregable,
          dueAt: parseFechaCalendario(h.fecha),
          visibleToClient: true,
          sortOrder: i,
          createdAt: new Date(),
        })),
      )
    }

    // El anticipo ya entró por Wompi; las cuentas de cobro son de lo que falta.
    // Solo en pesos: la cuenta de cobro es un documento colombiano.
    if (s.moneda === 'COP') {
      for (const pago of s.plan.pagos.slice(1)) {
        await createCuentaCobro({
          clientId,
          projectId: proyecto.id,
          items: [{ description: `${pago.concepto} · ${s.titulo}`.slice(0, 300), quantity: 1, unitCents: pago.monto * 100 }],
          concept: `${pago.concepto} del proyecto "${s.titulo}", según la propuesta aceptada (versión ${v.version}).`.slice(0, 500),
          contractRef: `Propuesta ${p.id}-v${v.version}`,
          dueAt: parseFechaCalendario(pago.vence),
          notes: pago.radicarAntesDe ? `Radicar a más tardar el ${pago.radicarAntesDe}.` : null,
        })
      }
    }

    await db.update(propuestas).set({ clientId, projectId: proyecto.id, actualizadaEl: new Date() }).where(eq(propuestas.id, p.id))
    if (p.anticipoPaymentId) await db.update(payments).set({ clientId }).where(eq(payments.id, p.anticipoPaymentId))

    // Portal: se habilita y se invita al correo del cliente, si lo hay. La
    // invitación sale por correo (Resend); sin RESEND_API_KEY queda creada y
    // Mike comparte el enlace desde el panel del portal.
    const correo = s.cliente.correo || s.contacto.contacto.correo
    if (correo && isValidEmail(correo)) {
      await db.update(clients).set({ portalEnabled: true }).where(eq(clients.id, clientId))
      await inviteUser({ clientId, email: correo, name: s.cliente.nombre || null, role: 'owner', invitedBy: 'plano' }).catch(() => null)
    }

    await sendPush('Anticipo pagado: proyecto creado', `${s.titulo} · ${s.cliente.nombre || ''}`.trim(), {
      priority: 4,
      tags: 'moneybag',
      click: `${SITE_URL}/admin/projects/${proyecto.id}`,
    }).catch(() => {})

    return { convertida: true, projectId: proyecto.id }
  } catch (e) {
    await db
      .update(propuestas)
      .set({ estado: 'aceptada' })
      .where(and(eq(propuestas.id, p.id), isNull(propuestas.projectId)))
      .catch(() => {})
    return { convertida: false, motivo: e instanceof Error ? e.message : 'error' }
  }
}

/** Desde la pasarela: si el pago aprobado es el anticipo de una propuesta, la convierte. Nunca lanza. */
export async function convertirPorReferencia(reference: string): Promise<ResultadoConversion> {
  try {
    const [pago] = await db.select({ id: payments.id, status: payments.status, source: payments.source }).from(payments).where(eq(payments.reference, reference)).limit(1)
    if (!pago || pago.source !== 'propuesta' || pago.status !== 'approved') return { convertida: false }
    const [p] = await db.select().from(propuestas).where(eq(propuestas.anticipoPaymentId, pago.id)).limit(1)
    if (!p) return { convertida: false, motivo: 'pago sin propuesta' }
    return await convertir(p)
  } catch (e) {
    return { convertida: false, motivo: e instanceof Error ? e.message : 'error' }
  }
}
