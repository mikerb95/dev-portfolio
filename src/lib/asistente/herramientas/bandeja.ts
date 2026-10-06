// Herramientas de lectura de lo que espera respuesta: mensajes del formulario
// de contacto, hilos del portal y pendientes de seguimiento. Todo lo que
// escribió alguien de fuera viaja dentro de `escritoPorTerceros` (ver
// AVISO_TERCEROS) y sin correos ni teléfonos.
//
// Importa `src/db`: solo servidor.

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { briefings, clients, interactions, messages, portalMessages, portalThreads, projects } from '../../../db/schema'
import { AVISO_TERCEROS, fecha, ok, textoSeguro, type Herramienta } from './tipos'

const mensajesTool: Herramienta = {
  nombre: 'mensajes',
  descripcion:
    'Lo que nadie ha contestado: mensajes sin leer del formulario de contacto (y del asesor público, que deja ahí sus contactos) y hilos abiertos del portal cuyo último mensaje es del cliente.',
  esquema: z.object({
    limite: z.number().int().min(1).max(30).optional().describe('Máximo de mensajes del formulario (1-30, por defecto 15)'),
  }),
  async ejecutar(args: { limite?: number }) {
    // Subconsulta y no join: un hilo con cuarenta mensajes no debe convertirse en cuarenta filas.
    const ultimoAutor = sql<string | null>`(select ${portalMessages.authorType} from ${portalMessages} where ${portalMessages.threadId} = ${portalThreads.id} order by ${portalMessages.createdAt} desc limit 1)`

    const [contacto, sinLeer, hilos] = await Promise.all([
      db
        .select({
          id: messages.id,
          nombre: messages.name,
          asunto: messages.subject,
          cuerpo: messages.body,
          cliente: clients.name,
          recibido: messages.createdAt,
        })
        .from(messages)
        .leftJoin(clients, eq(messages.clientId, clients.id))
        .where(eq(messages.read, false))
        .orderBy(desc(messages.createdAt))
        .limit(args.limite ?? 15),
      db.select({ n: sql<number>`count(*)` }).from(messages).where(eq(messages.read, false)),
      db
        .select({
          id: portalThreads.id,
          asunto: portalThreads.subject,
          cliente: clients.name,
          proyecto: projects.title,
          ultimoMensaje: portalThreads.lastMessageAt,
        })
        .from(portalThreads)
        .leftJoin(clients, eq(portalThreads.clientId, clients.id))
        .leftJoin(projects, eq(portalThreads.projectId, projects.id))
        .where(and(eq(portalThreads.status, 'open'), sql`${ultimoAutor} = 'client'`))
        .orderBy(desc(portalThreads.lastMessageAt))
        .limit(15),
    ])

    const ids = hilos.map((h) => h.id)
    const ultimos = ids.length
      ? await db
          .select({ hilo: portalMessages.threadId, cuerpo: portalMessages.body, autor: portalMessages.authorName, at: portalMessages.createdAt })
          .from(portalMessages)
          .where(and(inArray(portalMessages.threadId, ids), eq(portalMessages.authorType, 'client')))
          .orderBy(desc(portalMessages.createdAt))
      : []
    const ultimoDe = new Map<number, (typeof ultimos)[number]>()
    for (const m of ultimos) if (!ultimoDe.has(m.hilo)) ultimoDe.set(m.hilo, m)

    return ok({
      aviso: AVISO_TERCEROS,
      formularioSinLeer: sinLeer[0]?.n ?? 0,
      formulario: contacto.map((m) => ({
        id: m.id,
        recibido: fecha(m.recibido),
        clienteVinculado: m.cliente,
        escritoPorTerceros: { nombre: m.nombre, asunto: textoSeguro(m.asunto, 160), cuerpo: textoSeguro(m.cuerpo) },
      })),
      portalSinResponder: hilos.map((h) => {
        const u = ultimoDe.get(h.id)
        return {
          id: h.id,
          cliente: h.cliente,
          proyecto: h.proyecto,
          ultimoMensaje: fecha(h.ultimoMensaje),
          escritoPorTerceros: { asunto: textoSeguro(h.asunto, 160), autor: u?.autor ?? null, ultimo: textoSeguro(u?.cuerpo) },
        }
      }),
    })
  },
}

const seguimientoTool: Herramienta = {
  nombre: 'seguimiento',
  descripcion:
    'Pendientes del seguimiento comercial (llamadas, reuniones, notas y tareas sin resolver) con su siguiente paso, fecha límite, cliente y proyecto. Marca los vencidos y los que vencen en los próximos días.',
  esquema: z.object({
    dias: z.number().int().min(1).max(60).optional().describe('Cuántos días hacia adelante cuentan como "próximos" (por defecto 7)'),
  }),
  async ejecutar(args: { dias?: number }) {
    const ahora = new Date()
    const horizonte = new Date(ahora.getTime() + (args.dias ?? 7) * 86_400_000)
    const filas = await db
      .select({
        id: interactions.id,
        tipo: interactions.type,
        titulo: interactions.title,
        detalle: interactions.body,
        siguientePaso: interactions.nextAction,
        vence: interactions.dueDate,
        ocurrio: interactions.occurredAt,
        cliente: clients.name,
        proyecto: projects.title,
        briefing: briefings.title,
      })
      .from(interactions)
      .leftJoin(clients, eq(interactions.clientId, clients.id))
      .leftJoin(projects, eq(interactions.projectId, projects.id))
      .leftJoin(briefings, eq(interactions.briefingId, briefings.id))
      .where(eq(interactions.done, false))
      // Los que tienen fecha primero, del más urgente al más lejano; los sin fecha al final.
      .orderBy(sql`${interactions.dueDate} is null`, asc(interactions.dueDate))
      .limit(50)

    const pendientes = filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      titulo: f.titulo,
      siguientePaso: textoSeguro(f.siguientePaso, 200),
      detalle: textoSeguro(f.detalle, 300),
      cliente: f.cliente,
      proyecto: f.proyecto,
      briefing: f.briefing,
      ocurrio: fecha(f.ocurrio),
      vence: fecha(f.vence),
      vencido: !!f.vence && f.vence < ahora,
      proximo: !!f.vence && f.vence >= ahora && f.vence <= horizonte,
    }))

    return ok({
      hoy: fecha(ahora),
      total: pendientes.length,
      vencidos: pendientes.filter((p) => p.vencido).length,
      proximos: pendientes.filter((p) => p.proximo).length,
      pendientes,
    })
  },
}

export const HERRAMIENTAS_BANDEJA = [mensajesTool, seguimientoTool]
