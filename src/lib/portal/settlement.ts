// Conciliación pago → factura.
//
// Vive aparte de lib/payments.ts a propósito: la pasarela no debe saber que
// existen las facturas. `applyGatewayEvent` se ocupa de la máquina de estados
// del pago (y la comparte con /pay, que no tiene facturas detrás); esto traduce
// "el pago quedó aprobado" a "la factura está saldada y hay que avisar".
//
// Es idempotente de punta a punta, y tiene que serlo: las pasarelas reintentan
// los webhooks por diseño, así que esto se ejecutará varias veces para el mismo
// pago. `markInvoicePaid` solo transiciona desde sent/overdue, de modo que el
// segundo intento no reescribe `paidAt` ni vuelve a notificar al cliente.

import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { invoices, payments } from '../../db/schema'
import { markInvoicePaid } from './invoices'
import { notifyClient } from './notifications'
import { audit } from './audit'
import { formatMoney } from './format'
import { sendPush } from '../notify'

/**
 * Concilia un pago con su factura si procede. Recibe la referencia porque es lo
 * único que la pasarela conoce.
 *
 * Nunca lanza: si esto falla, el pago YA está cobrado y registrado. Romper el
 * webhook haría que la pasarela reintentara en bucle por un problema que no es
 * suyo; es mejor dejar la factura sin marcar y arreglarla desde el panel.
 */
export async function settlePaymentByReference(reference: string): Promise<{ settled: boolean; invoiceId?: number }> {
  try {
    const [payment] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1)

    // Un pago de /pay (sin factura) o aún no aprobado: nada que conciliar.
    if (!payment?.invoiceId || payment.status !== 'approved') return { settled: false }

    const invoice = await markInvoicePaid(payment.invoiceId, payment.id)
    // Ya estaba saldada: webhook repetido. Silencio, que es lo correcto.
    if (!invoice) return { settled: false, invoiceId: payment.invoiceId }

    notifyClient({
      clientId: invoice.clientId,
      type: 'invoice',
      title: `Pago recibido · factura ${invoice.number}`,
      body: `Recibimos tu pago de ${formatMoney(invoice.totalCents, invoice.currency)}. Gracias.`,
      href: `/portal/facturas/${invoice.id}`,
      emailCta: 'Ver el recibo',
    }).catch(() => {})

    audit({
      clientId: invoice.clientId,
      action: 'invoice.pay_started',
      entity: 'invoice',
      entityId: invoice.id,
      detail: `pago aprobado · ref ${payment.reference}`,
    })

    sendPush(
      'Factura pagada',
      `${invoice.number} · ${formatMoney(invoice.totalCents, invoice.currency)}`,
      { priority: 4, tags: 'moneybag' }
    ).catch(() => {})

    return { settled: true, invoiceId: invoice.id }
  } catch {
    return { settled: false }
  }
}

/**
 * Anula la marca de pagada si la pasarela revierte un cobro (void/refund).
 * La factura vuelve a `sent`; que esté vencida o no lo recalcula el cron.
 */
export async function unsettlePaymentByReference(reference: string): Promise<void> {
  try {
    const [payment] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1)
    if (!payment?.invoiceId || payment.status !== 'voided') return

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1)
    if (!invoice || invoice.status !== 'paid') return

    await db
      .update(invoices)
      .set({ status: 'sent', paidAt: null, paymentId: null, updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id))

    sendPush('Pago revertido', `La factura ${invoice.number} vuelve a estar pendiente (ref ${reference}).`, {
      priority: 5,
      tags: 'warning',
    }).catch(() => {})
  } catch {
    // Ver el comentario de settlePaymentByReference: fallar en silencio es
    // preferible a romper el webhook.
  }
}
