// Herramienta de lectura: quién pagó y cuánto en una ventana de tiempo.
//
// Dos fuentes, sin sumarlas a ciegas: las cuentas de cobro y facturas
// marcadas como pagadas, y los pagos en línea aprobados por la pasarela (portal,
// cobros de campo, anticipos de propuestas, /pay). Un pago del portal salda una
// factura: si esa factura ya está en la primera lista, el pago se muestra con
// `saldaCuenta` y no se vuelve a sumar. El libro interno (finanzas) no entra:
// es otra forma de anotar el mismo dinero y lo responde `finanzas`.
//
// Importa `src/db`: solo servidor.

import { and, desc, eq, gte, inArray, lt, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { clients, invoices, payments, projects } from '../../../db/schema'
import { centavos, fecha, ok, sumarPorMoneda, textoSeguro, type Herramienta } from './tipos'

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

const ORIGEN: Record<string, string> = { pay: 'pago suelto (/pay)', cobro: 'cobro de campo', portal: 'portal de clientes', propuesta: 'anticipo de propuesta' }

/** Ventana pedida: un mes de calendario en Bogotá o los últimos N días. */
export function ventanaDePagos(args: { mes?: string; dias?: number }, ahora = new Date()) {
  if (args.mes) {
    const [anio, m] = args.mes.split('-').map(Number) as [number, number]
    // Bogotá es UTC-5 todo el año.
    return { desde: new Date(Date.UTC(anio, m - 1, 1, 5)), hasta: new Date(Date.UTC(anio, m, 1, 5)), etiqueta: args.mes }
  }
  const dias = args.dias ?? 30
  return { desde: new Date(ahora.getTime() - dias * 86_400_000), hasta: ahora, etiqueta: `últimos ${dias} días` }
}

const pagosTool: Herramienta = {
  nombre: 'pagos_recibidos',
  descripcion:
    'Quién pagó y cuánto: cuentas de cobro y facturas pagadas, y pagos en línea aprobados por la pasarela, con cliente, fecha y totales por moneda. Por defecto los últimos 30 días; acepta un mes AAAA-MM.',
  esquema: z.object({
    mes: z.string().regex(MES).optional().describe('Mes AAAA-MM (si se da, manda sobre "dias")'),
    dias: z.number().int().min(1).max(366).optional().describe('Días hacia atrás (1-366, por defecto 30)'),
  }),
  async ejecutar(args: { mes?: string; dias?: number }) {
    const { desde, hasta, etiqueta } = ventanaDePagos(args)

    const [cuentas, enLinea] = await Promise.all([
      db
        .select({
          id: invoices.id,
          numero: invoices.number,
          tipo: invoices.docType,
          cliente: clients.name,
          proyecto: projects.title,
          moneda: invoices.currency,
          totalCents: invoices.totalCents,
          netoCents: invoices.netCents,
          pagada: invoices.paidAt,
        })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .leftJoin(projects, eq(invoices.projectId, projects.id))
        .where(and(eq(invoices.status, 'paid'), gte(invoices.paidAt, desde), lt(invoices.paidAt, hasta)))
        .orderBy(desc(invoices.paidAt))
        .limit(50),
      db
        .select({
          referencia: payments.reference,
          origen: payments.source,
          descripcion: payments.description,
          pagador: payments.payerName,
          cliente: clients.name,
          factura: payments.invoiceId,
          moneda: payments.currency,
          montoCents: payments.amountCents,
          aprobado: payments.updatedAt,
        })
        .from(payments)
        .leftJoin(clients, eq(payments.clientId, clients.id))
        // Los pagos simulados del laboratorio no son dinero.
        .where(and(eq(payments.status, 'approved'), ne(payments.provider, 'mock'), gte(payments.updatedAt, desde), lt(payments.updatedAt, hasta)))
        .orderBy(desc(payments.updatedAt))
        .limit(50),
    ])

    const numeroDe = new Map(cuentas.map((c) => [c.id, c.numero]))
    // Facturas que saldó un pago pero pagadas fuera de la ventana: su número sirve igual.
    const otras = enLinea.map((p) => p.factura).filter((id): id is number => id != null && !numeroDe.has(id))
    const fuera = otras.length
      ? await db.select({ id: invoices.id, numero: invoices.number }).from(invoices).where(inArray(invoices.id, otras))
      : []
    const numeros = new Map([...numeroDe, ...fuera.map((f) => [f.id, f.numero] as const)])

    const pagosSueltos = enLinea.filter((p) => p.factura == null || !numeroDe.has(p.factura))

    return ok({
      ventana: etiqueta,
      cuentasPagadas: {
        total: cuentas.length,
        suma: sumarPorMoneda(cuentas, (c) => c.moneda, (c) => c.totalCents / 100),
        cuentas: cuentas.map((c) => ({
          numero: c.numero,
          tipo: c.tipo === 'cuenta_cobro' ? 'cuenta de cobro' : 'factura',
          cliente: c.cliente,
          proyecto: c.proyecto,
          total: centavos(c.totalCents, c.moneda),
          netoRecibido: c.tipo === 'cuenta_cobro' ? centavos(c.netoCents, c.moneda) : centavos(c.totalCents, c.moneda),
          pagada: fecha(c.pagada),
        })),
      },
      pagosEnLinea: {
        total: enLinea.length,
        // Solo los que no saldan una cuenta ya contada arriba.
        sumaSinRepetir: sumarPorMoneda(pagosSueltos, (p) => p.moneda, (p) => p.montoCents / 100),
        pagos: enLinea.map((p) => ({
          referencia: p.referencia,
          origen: ORIGEN[p.origen] ?? p.origen,
          cliente: p.cliente,
          monto: centavos(p.montoCents, p.moneda),
          aprobado: fecha(p.aprobado),
          saldaCuenta: p.factura != null ? (numeros.get(p.factura) ?? null) : null,
          yaContadoArriba: p.factura != null && numeroDe.has(p.factura),
          escritoPorTerceros: { pagador: textoSeguro(p.pagador, 80), descripcion: textoSeguro(p.descripcion, 160) },
        })),
      },
      nota: 'Las dos sumas no se solapan: un pago en línea que salda una cuenta de la primera lista no entra en sumaSinRepetir. El libro interno de ingresos lo responde la herramienta finanzas.',
    })
  },
}

export const HERRAMIENTAS_PAGOS = [pagosTool]
