// Aviso al teléfono cuando un cobro de campo se paga.
//
// Vive fuera de payments.ts a propósito: la pasarela no sabe (ni debe saber)
// que existen los cobros de campo, igual que no sabe de las facturas del
// portal. Se engancha donde ya se hace la conciliación, tras aplicar el evento.

import { eq } from 'drizzle-orm'
import { db } from '../db'
import { clients, payments } from '../db/schema'
import { fmtCOP } from './cobros'
import { formatPhone } from './phone'
import { sendPush } from './notify'

/**
 * Push si la referencia corresponde a un cobro de campo aprobado. No-op para
 * cualquier otro pago. Nunca lanza: un fallo del aviso no puede tumbar el
 * webhook ni provocar reintentos de la pasarela sobre un pago ya registrado.
 */
export async function notifyCobroPaid(reference: string): Promise<void> {
  try {
    const [row] = await db
      .select({ payment: payments, clientName: clients.name })
      .from(payments)
      .leftJoin(clients, eq(payments.clientId, clients.id))
      .where(eq(payments.reference, reference))
      .limit(1)

    if (!row || row.payment.source !== 'cobro') return

    const quien = row.clientName ?? formatPhone(row.payment.payerPhone)
    const concepto = row.payment.description ? ` — ${row.payment.description}` : ''

    await sendPush(
      'Cobro pagado',
      `${fmtCOP(row.payment.amountCents)} de ${quien}${concepto}. Ref ${row.payment.reference}.`,
      { priority: 4, tags: 'moneybag' },
    )
  } catch {
    // Silencio deliberado: el dinero ya entró y quedó registrado.
  }
}
