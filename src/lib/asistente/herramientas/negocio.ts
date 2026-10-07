// Herramientas de lectura del negocio: proyectos, clientes, cuentas de cobro,
// finanzas y cotizaciones. Cada consulta nombra sus columnas: nunca un
// `select()` completo, porque `clients.billingInfo`, `clients.email`,
// `project_contacts.phone` o `project_services.secrets` saldrían hacia la API
// de Claude con solo olvidar un filtro.
//
// Importa `src/db`: solo servidor.

import { and, asc, desc, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import {
  briefingItems,
  briefings,
  clients,
  finances,
  interactions,
  invoices,
  projectAdrs,
  projectContacts,
  projectMilestones,
  projects,
  projectServices,
} from '../../../db/schema'
import { monthlyEquivalent } from '../../money'
import { centavos, dinero, fallo, fecha, ok, sumarPorMoneda, textoSeguro, type Herramienta } from './tipos'

const ESTADOS_PROYECTO = ['activo', 'pausado', 'completado', 'archivado'] as const

/** Una cuenta enviada con la fecha de pago vencida está vencida aunque nadie haya cambiado su estado. */
const vencida = (status: string, dueAt: Date | null, ahora: Date) =>
  status === 'overdue' || (status === 'sent' && !!dueAt && dueAt < ahora)

const proyectosTool: Herramienta = {
  nombre: 'proyectos',
  descripcion:
    'Lista de proyectos con su cliente, estado, fechas y el siguiente hito pendiente. Por defecto solo los activos.',
  esquema: z.object({
    estado: z.enum([...ESTADOS_PROYECTO, 'todos']).optional().describe('Filtro por estado (por defecto "activo")'),
  }),
  async ejecutar(args: { estado?: (typeof ESTADOS_PROYECTO)[number] | 'todos' }) {
    const estado = args.estado ?? 'activo'
    const filas = await db
      .select({
        id: projects.id,
        titulo: projects.title,
        slug: projects.slug,
        estado: projects.status,
        cliente: clients.name,
        inicio: projects.startDate,
        fin: projects.endDate,
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(estado === 'todos' ? undefined : eq(projects.status, estado))
      .orderBy(asc(projects.title))
      .limit(60)

    const ids = filas.map((f) => f.id)
    const hitos = ids.length
      ? await db
          .select({
            proyecto: projectMilestones.projectId,
            titulo: projectMilestones.title,
            estado: projectMilestones.status,
            vence: projectMilestones.dueAt,
          })
          .from(projectMilestones)
          .where(and(inArray(projectMilestones.projectId, ids), ne(projectMilestones.status, 'completado')))
          .orderBy(asc(projectMilestones.sortOrder), asc(projectMilestones.dueAt))
      : []
    const siguiente = new Map<number, (typeof hitos)[number]>()
    for (const h of hitos) if (!siguiente.has(h.proyecto)) siguiente.set(h.proyecto, h)

    return ok({
      filtro: estado,
      total: filas.length,
      proyectos: filas.map((p) => {
        const h = siguiente.get(p.id)
        return {
          ...p,
          inicio: fecha(p.inicio),
          fin: fecha(p.fin),
          siguienteHito: h ? { titulo: h.titulo, estado: h.estado, vence: fecha(h.vence) } : null,
        }
      }),
    })
  },
}

const proyectoTool: Herramienta = {
  nombre: 'proyecto',
  descripcion:
    'Detalle de un proyecto: hitos, contactos (solo nombre y rol), decisiones de arquitectura, cotizaciones, cuentas de cobro y pendientes de seguimiento. Busca por id, slug, parte del título del proyecto o parte del título de uno de sus hitos.',
  esquema: z.object({
    buscar: z.string().min(1).max(80).describe('Id numérico, slug, parte del título del proyecto o de uno de sus hitos'),
  }),
  async ejecutar(args: { buscar: string }) {
    const termino = args.buscar.trim()
    const id = /^\d+$/.test(termino) ? Number(termino) : null
    const candidatos = await db
      .select({
        id: projects.id,
        titulo: projects.title,
        slug: projects.slug,
        descripcion: projects.description,
        estado: projects.status,
        stack: projects.techStack,
        visibleEnPortafolio: projects.visible,
        inicio: projects.startDate,
        fin: projects.endDate,
        notasInternas: projects.internalNotes,
        clienteId: projects.clientId,
        cliente: clients.name,
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(
        id
          ? eq(projects.id, id)
          : or(
              eq(projects.slug, termino),
              like(projects.title, `%${termino}%`),
              // Por el hito: "mueve el hito Zona de despacho norte" no dice de
              // qué proyecto es, y sin esto el modelo abría los proyectos uno
              // por uno (lo mostró el banco de casos de la fase 6).
              inArray(
                projects.id,
                db.select({ id: projectMilestones.projectId }).from(projectMilestones).where(like(projectMilestones.title, `%${termino}%`))
              )
            )
      )
      .limit(5)

    if (!candidatos.length) return fallo(`No hay ningún proyecto que coincida con "${termino}".`)
    if (candidatos.length > 1)
      return ok({
        ambiguo: true,
        mensaje: 'Varios proyectos coinciden. Vuelve a llamar con el id del que corresponda.',
        candidatos: candidatos.map((c) => ({ id: c.id, titulo: c.titulo, cliente: c.cliente, estado: c.estado })),
      })

    const p = candidatos[0]!
    const [hitos, contactos, adrs, cotizaciones, cuentas, pendientes] = await Promise.all([
      db
        .select({
          // El id lo necesita actualizar_hito (panel); no dice nada del cliente.
          id: projectMilestones.id,
          titulo: projectMilestones.title,
          estado: projectMilestones.status,
          vence: projectMilestones.dueAt,
          completado: projectMilestones.completedAt,
          visibleParaElCliente: projectMilestones.visibleToClient,
        })
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, p.id))
        .orderBy(asc(projectMilestones.sortOrder)),
      db
        .select({ nombre: projectContacts.name, rol: projectContacts.role })
        .from(projectContacts)
        .where(eq(projectContacts.projectId, p.id)),
      db
        .select({ titulo: projectAdrs.title, estado: projectAdrs.status, decision: projectAdrs.decision })
        .from(projectAdrs)
        .where(eq(projectAdrs.projectId, p.id))
        .orderBy(desc(projectAdrs.createdAt))
        .limit(10),
      db
        .select({ id: briefings.id, titulo: briefings.title, estado: briefings.status })
        .from(briefings)
        .where(and(eq(briefings.projectId, p.id), isNull(briefings.deletedAt))),
      db
        .select({
          numero: invoices.number,
          tipo: invoices.docType,
          estado: invoices.status,
          moneda: invoices.currency,
          totalCents: invoices.totalCents,
          vence: invoices.dueAt,
        })
        .from(invoices)
        .where(eq(invoices.projectId, p.id))
        .orderBy(desc(invoices.createdAt))
        .limit(20),
      db
        .select({ id: interactions.id, titulo: interactions.title, siguientePaso: interactions.nextAction, vence: interactions.dueDate })
        .from(interactions)
        .where(and(eq(interactions.projectId, p.id), eq(interactions.done, false)))
        .orderBy(asc(interactions.dueDate))
        .limit(20),
    ])

    const ahora = new Date()
    return ok({
      id: p.id,
      titulo: p.titulo,
      slug: p.slug,
      cliente: p.cliente,
      estado: p.estado,
      stack: p.stack,
      visibleEnPortafolio: p.visibleEnPortafolio,
      inicio: fecha(p.inicio),
      fin: fecha(p.fin),
      descripcion: textoSeguro(p.descripcion),
      notasInternas: textoSeguro(p.notasInternas, 1_200),
      hitos: hitos.map((h) => ({ ...h, vence: fecha(h.vence), completado: fecha(h.completado) })),
      contactos,
      decisionesDeArquitectura: adrs.map((a) => ({ ...a, decision: textoSeguro(a.decision, 300) })),
      cotizaciones,
      cuentas: cuentas.map(({ totalCents, moneda, vence, ...c }) => ({
        ...c,
        total: centavos(totalCents, moneda),
        vence: fecha(vence),
        vencida: vencida(c.estado, vence, ahora),
      })),
      pendientes: pendientes.map((x) => ({ ...x, vence: fecha(x.vence) })),
    })
  },
}

const clientesTool: Herramienta = {
  nombre: 'clientes',
  descripcion:
    'Clientes con lo que deben: cuentas de cobro y facturas enviadas sin pagar (total y neto después de retenciones, ya sumados por moneda), cuántas están vencidas y cuántos proyectos activos tienen. Sin datos de contacto.',
  esquema: z.object({
    soloConDeuda: z.boolean().optional().describe('Solo los clientes que deben algo (por defecto false)'),
  }),
  async ejecutar(args: { soloConDeuda?: boolean }) {
    const ahora = new Date()
    const [lista, abiertas, activos] = await Promise.all([
      db
        .select({ id: clients.id, nombre: clients.name, empresa: clients.company, portal: clients.portalEnabled })
        .from(clients)
        .orderBy(asc(clients.name))
        .limit(100),
      // Los borradores no son deuda: todavía no se han emitido.
      db
        .select({
          cliente: invoices.clientId,
          estado: invoices.status,
          moneda: invoices.currency,
          totalCents: invoices.totalCents,
          netoCents: invoices.netCents,
          tipo: invoices.docType,
          vence: invoices.dueAt,
        })
        .from(invoices)
        .where(inArray(invoices.status, ['sent', 'overdue'])),
      db
        .select({ cliente: projects.clientId, n: sql<number>`count(*)` })
        .from(projects)
        .where(eq(projects.status, 'activo'))
        .groupBy(projects.clientId),
    ])

    const porCliente = new Map<number, typeof abiertas>()
    for (const f of abiertas) porCliente.set(f.cliente, [...(porCliente.get(f.cliente) ?? []), f])
    const proyectosActivos = new Map(activos.map((a) => [a.cliente, a.n]))

    const filas = lista.map((c) => {
      const suyas = porCliente.get(c.id) ?? []
      // Una factura no tiene retenciones: su neto es el total.
      const neto = (f: (typeof suyas)[number]) => (f.tipo === 'cuenta_cobro' ? f.netoCents : f.totalCents)
      return {
        id: c.id,
        nombre: c.nombre,
        empresa: c.empresa,
        tienePortal: c.portal,
        proyectosActivos: proyectosActivos.get(c.id) ?? 0,
        cuentasSinPagar: suyas.length,
        vencidas: suyas.filter((f) => vencida(f.estado, f.vence, ahora)).length,
        debe: sumarPorMoneda(suyas, (f) => f.moneda, (f) => f.totalCents / 100),
        netoARecibir: sumarPorMoneda(suyas, (f) => f.moneda, (f) => neto(f) / 100),
      }
    })

    const resultado = args.soloConDeuda ? filas.filter((f) => f.cuentasSinPagar > 0) : filas
    return ok({
      total: resultado.length,
      deudaTotal: sumarPorMoneda(abiertas, (f) => f.moneda, (f) => f.totalCents / 100),
      clientes: resultado,
    })
  },
}

const cuentasTool: Herramienta = {
  nombre: 'cuentas_cobro',
  descripcion:
    'Cuentas de cobro y facturas con número, cliente, proyecto, estado, total, neto y vencimiento. Filtra por estado; "vencidas" incluye las enviadas cuya fecha de pago ya pasó.',
  esquema: z.object({
    estado: z
      .enum(['borrador', 'enviadas', 'vencidas', 'pagadas', 'anuladas', 'todas'])
      .optional()
      .describe('Por defecto "enviadas" (las que están por cobrar)'),
    clienteId: z.number().int().positive().optional().describe('Solo las de este cliente'),
  }),
  async ejecutar(args: { estado?: string; clienteId?: number }) {
    const estado = args.estado ?? 'enviadas'
    const estados: Record<string, string[] | null> = {
      borrador: ['draft'],
      enviadas: ['sent', 'overdue'],
      vencidas: ['sent', 'overdue'],
      pagadas: ['paid'],
      anuladas: ['void'],
      todas: null,
    }
    const filtroEstado = estados[estado]
    const filas = await db
      .select({
        numero: invoices.number,
        tipo: invoices.docType,
        estado: invoices.status,
        clienteId: invoices.clientId,
        cliente: clients.name,
        proyecto: projects.title,
        concepto: invoices.concept,
        moneda: invoices.currency,
        totalCents: invoices.totalCents,
        retencionesCents: invoices.retentionsCents,
        netoCents: invoices.netCents,
        emitida: invoices.issuedAt,
        vence: invoices.dueAt,
        pagada: invoices.paidAt,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .where(
        and(
          filtroEstado ? inArray(invoices.status, filtroEstado as ('draft' | 'sent' | 'paid' | 'overdue' | 'void')[]) : undefined,
          args.clienteId ? eq(invoices.clientId, args.clienteId) : undefined
        )
      )
      .orderBy(desc(invoices.createdAt))
      .limit(50)

    const ahora = new Date()
    const cuentas = filas
      .map((f) => ({ ...f, vencida: vencida(f.estado, f.vence, ahora) }))
      .filter((f) => estado !== 'vencidas' || f.vencida)

    return ok({
      filtro: estado,
      total: cuentas.length,
      suma: sumarPorMoneda(cuentas, (f) => f.moneda, (f) => f.totalCents / 100),
      cuentas: cuentas.map(({ totalCents, retencionesCents, netoCents, moneda, emitida, vence, pagada, concepto, ...c }) => ({
        ...c,
        concepto: textoSeguro(concepto, 200),
        total: centavos(totalCents, moneda),
        retenciones: retencionesCents ? centavos(retencionesCents, moneda) : null,
        neto: c.tipo === 'cuenta_cobro' ? centavos(netoCents, moneda) : centavos(totalCents, moneda),
        emitida: fecha(emitida),
        vence: fecha(vence),
        pagada: fecha(pagada),
      })),
    })
  },
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

const finanzasTool: Herramienta = {
  nombre: 'finanzas',
  descripcion:
    'Libro interno de un mes: ingresos cobrados, pendientes y proyectados (de la tabla de finanzas, en pesos), y el costo mensual recurrente de servicios activos por moneda. Sin secretos de la bóveda.',
  esquema: z.object({
    mes: z.string().regex(MES).optional().describe('Mes AAAA-MM (por defecto el mes actual en Colombia)'),
  }),
  async ejecutar(args: { mes?: string }) {
    const mes = args.mes ?? fecha(new Date())!.slice(0, 7)
    const [anio, m] = mes.split('-').map(Number) as [number, number]
    // Límites del mes en Bogotá (UTC-5 todo el año, sin horario de verano).
    const inicio = new Date(Date.UTC(anio, m - 1, 1, 5))
    const fin = new Date(Date.UTC(anio, m, 1, 5))

    const [movimientos, servicios] = await Promise.all([
      db
        .select({
          descripcion: finances.description,
          monto: finances.amount,
          estado: finances.status,
          vence: finances.dueDate,
          creado: finances.createdAt,
          proyecto: projects.title,
          cliente: clients.name,
        })
        .from(finances)
        .leftJoin(projects, eq(finances.projectId, projects.id))
        .leftJoin(clients, eq(finances.clientId, clients.id))
        // Un movimiento cae en el mes por su vencimiento; si no tiene, por su fecha de alta.
        .where(
          sql`coalesce(${finances.dueDate}, ${finances.createdAt}) >= ${Math.floor(inicio.getTime() / 1000)}
            and coalesce(${finances.dueDate}, ${finances.createdAt}) < ${Math.floor(fin.getTime() / 1000)}`
        )
        .limit(100),
      db
        .select({
          nombre: projectServices.name,
          categoria: projectServices.category,
          proveedor: projectServices.provider,
          costo: projectServices.cost,
          moneda: projectServices.currency,
          ciclo: projectServices.billingCycle,
          paga: projectServices.payer,
          renueva: projectServices.renewalDate,
        })
        .from(projectServices)
        .where(eq(projectServices.active, true)),
    ])

    const por = (estado: string) => movimientos.filter((x) => x.estado === estado)
    const total = (filas: typeof movimientos) => dinero(filas.reduce((s, x) => s + x.monto, 0), 'COP')
    // Solo lo que paga Mike: lo que paga el cliente directo no es un costo propio.
    const recurrentes = servicios.filter((s) => s.paga !== 'client_direct' && monthlyEquivalent(s.costo, s.ciclo) > 0)

    return ok({
      mes,
      ingresos: {
        cobrado: total(por('cobrado')),
        pendiente: total(por('pendiente')),
        proyectado: total(por('proyectado')),
      },
      movimientos: movimientos.map((x) => ({
        ...x,
        descripcion: textoSeguro(x.descripcion, 160),
        monto: dinero(x.monto, 'COP'),
        vence: fecha(x.vence),
        creado: fecha(x.creado),
      })),
      costoMensualRecurrente: sumarPorMoneda(recurrentes, (s) => s.moneda ?? 'USD', (s) => monthlyEquivalent(s.costo, s.ciclo)),
      servicios: recurrentes.map((s) => ({
        nombre: s.nombre,
        categoria: s.categoria,
        proveedor: s.proveedor,
        ciclo: s.ciclo,
        costoMensual: dinero(monthlyEquivalent(s.costo, s.ciclo), s.moneda ?? 'USD'),
        renueva: fecha(s.renueva),
      })),
      nota: 'Los ingresos salen del libro interno (finanzas), no de las cuentas de cobro. Los costos son equivalentes mensuales; los de pago único o por uso no entran.',
    })
  },
}

const briefingsTool: Herramienta = {
  nombre: 'briefings',
  descripcion:
    'Cotizaciones y briefings guardados: título, cliente, proyecto, estado, presupuesto estimado y acordado, horas y cuántos requerimientos, entregables y exclusiones tienen.',
  esquema: z.object({
    estado: z.enum(['borrador', 'en_revision', 'aprobado', 'rechazado', 'todos']).optional().describe('Por defecto "todos"'),
  }),
  async ejecutar(args: { estado?: 'borrador' | 'en_revision' | 'aprobado' | 'rechazado' | 'todos' }) {
    const estado = args.estado ?? 'todos'
    const filas = await db
      .select({
        id: briefings.id,
        titulo: briefings.title,
        estado: briefings.status,
        cliente: clients.name,
        proyecto: projects.title,
        objetivo: briefings.objective,
        estimado: briefings.estimatedBudget,
        acordado: briefings.agreedBudget,
        horas: briefings.estimatedHours,
        limite: briefings.deadline,
        actualizado: briefings.updatedAt,
      })
      .from(briefings)
      .leftJoin(clients, eq(briefings.clientId, clients.id))
      .leftJoin(projects, eq(briefings.projectId, projects.id))
      .where(and(isNull(briefings.deletedAt), estado === 'todos' ? undefined : eq(briefings.status, estado)))
      .orderBy(desc(briefings.updatedAt))
      .limit(30)

    const ids = filas.map((f) => f.id)
    const items = ids.length
      ? await db
          .select({ briefing: briefingItems.briefingId, tipo: briefingItems.kind, n: sql<number>`count(*)` })
          .from(briefingItems)
          .where(inArray(briefingItems.briefingId, ids))
          .groupBy(briefingItems.briefingId, briefingItems.kind)
      : []
    const conteo = (id: number, tipo: string) => items.find((i) => i.briefing === id && i.tipo === tipo)?.n ?? 0

    return ok({
      filtro: estado,
      total: filas.length,
      briefings: filas.map((b) => ({
        id: b.id,
        titulo: b.titulo,
        estado: b.estado,
        cliente: b.cliente,
        proyecto: b.proyecto,
        objetivo: textoSeguro(b.objetivo, 300),
        presupuestoEstimado: b.estimado != null ? dinero(b.estimado, 'COP') : null,
        presupuestoAcordado: b.acordado != null ? dinero(b.acordado, 'COP') : null,
        horas: b.horas,
        fechaLimite: fecha(b.limite),
        actualizado: fecha(b.actualizado),
        requerimientos: conteo(b.id, 'requerimiento'),
        entregables: conteo(b.id, 'entregable'),
        exclusiones: conteo(b.id, 'exclusion'),
      })),
    })
  },
}

export const HERRAMIENTAS_NEGOCIO = [proyectosTool, proyectoTool, clientesTool, cuentasTool, finanzasTool, briefingsTool]
