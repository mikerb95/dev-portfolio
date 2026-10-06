// Herramienta de lectura: lo que está por vencer o ya venció entre los
// servicios que se pagan (dominios, hosting, suscripciones). Responde "¿qué
// dominios van a vencer?" con la misma regla de alerta que el dashboard y
// /admin/domains (domainAlertState), para que no opinen distinto.
//
// Sin `secrets` ni `username`: la bóveda no sale hacia el modelo.
//
// Importa `src/db`: solo servidor.

import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { clients, projects, projectServices } from '../../../db/schema'
import { daysUntil, domainAlertState } from '../../domains'
import { dinero, fecha, ok, type Herramienta } from './tipos'

const ESTADO: Record<string, string> = { overdue: 'vencido', critical: 'vence en 7 días o menos', soon: 'vence en 30 días o menos', ok: 'al día' }

const vencimientosTool: Herramienta = {
  nombre: 'vencimientos',
  descripcion:
    'Dominios y servicios pagos que vencen o se renuevan pronto (o que ya vencieron): fecha, días que faltan, si se renueva solo, costo y de qué proyecto o cliente son. Para "¿qué dominios vencen?" usa tipo "dominios".',
  esquema: z.object({
    tipo: z.enum(['dominios', 'todos']).optional().describe('Solo dominios o todos los servicios (por defecto "todos")'),
    dias: z.number().int().min(1).max(365).optional().describe('Hasta cuántos días hacia adelante (1-365, por defecto 60)'),
  }),
  async ejecutar(args: { tipo?: 'dominios' | 'todos'; dias?: number }) {
    const tipo = args.tipo ?? 'todos'
    const dias = args.dias ?? 60
    const hasta = new Date(Date.now() + dias * 86_400_000)

    const filas = await db
      .select({
        nombre: projectServices.name,
        categoria: projectServices.category,
        proveedor: projectServices.provider,
        renueva: projectServices.renewalDate,
        autoRenueva: projectServices.autoRenew,
        costo: projectServices.cost,
        moneda: projectServices.currency,
        ciclo: projectServices.billingCycle,
        paga: projectServices.payer,
        proyecto: projects.title,
        cliente: clients.name,
      })
      .from(projectServices)
      .leftJoin(projects, eq(projectServices.projectId, projects.id))
      .leftJoin(clients, eq(projectServices.clientId, clients.id))
      .where(
        and(
          eq(projectServices.active, true),
          isNotNull(projectServices.renewalDate),
          lte(projectServices.renewalDate, hasta),
          tipo === 'dominios' ? eq(projectServices.category, 'domain') : undefined
        )
      )
      .orderBy(asc(projectServices.renewalDate))
      .limit(60)

    const servicios = filas.map((s) => {
      const estado = domainAlertState(s.renueva) ?? 'ok'
      return {
        nombre: s.nombre,
        categoria: s.categoria,
        proveedor: s.proveedor,
        renueva: fecha(s.renueva),
        diasQueFaltan: Math.round(daysUntil(s.renueva!)),
        estado: ESTADO[estado],
        seRenuevaSolo: s.autoRenueva ?? true,
        costo: s.costo != null ? dinero(s.costo, s.moneda ?? 'USD') : null,
        ciclo: s.ciclo,
        loPaga: s.paga === 'client_direct' ? 'el cliente directamente' : s.paga === 'client_reimbursable' ? 'Mike, y lo reembolsa el cliente' : 'Mike',
        proyecto: s.proyecto,
        cliente: s.cliente,
      }
    })

    return ok({
      filtro: tipo,
      ventanaDias: dias,
      total: servicios.length,
      vencidos: servicios.filter((s) => s.diasQueFaltan < 0).length,
      servicios,
      enlace: tipo === 'dominios' ? '/admin/domains' : '/admin/costs',
    })
  },
}

export const HERRAMIENTAS_VENCIMIENTOS = [vencimientosTool]
