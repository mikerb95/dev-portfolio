// Aceptación de una propuesta y cobro del anticipo. Solo servidor.
//
// Dos reglas que no se negocian:
//  · El precio lo recalcula el servidor con la configuración de la versión
//    enviada y lo que eligió el cliente. Si no coincide con el que el cliente
//    vio, no se acepta: es preferible un "recarga la página" a un acuerdo por
//    una cifra que nadie leyó.
//  · El anticipo se cobra con createPaymentIdempotent y una clave derivada de
//    la propuesta y la versión aceptada: dos clics, un cobro.

import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { payments, propuestas } from '../../db/schema'
import { createPaymentIdempotent, type Payment } from '../payments'
import { serverEnv } from '../env'
import { SITE_URL } from '../email'
import { sendPush } from '../notify'
import { cargarReglas, configDeVersion, congelarVersion, hoyCO, snapshotDe, version, type Propuesta, type VersionPropuesta } from './db'
import { huellaAceptacion } from './hash'
import { armarPropuesta } from './propuesta'
import { anticipoDe, configParaCliente, eleccionVacia } from './publico'
import type { EleccionCliente, Snapshot } from './tipos'

export type ResultadoAceptar =
  | { ok: true; version: number; huella: string; snapshot: Snapshot }
  | { ok: false; status: number; error: string }

export async function versionEnviada(p: Propuesta): Promise<VersionPropuesta | null> {
  return p.versionActual > 0 ? version(p.id, p.versionActual) : null
}

/** Lo que el cliente vería con su elección, recalculado en el servidor desde la versión enviada. */
export async function simular(p: Propuesta, e: EleccionCliente): Promise<Snapshot | null> {
  const v = await versionEnviada(p)
  if (!v) return null
  const base = configDeVersion(v, p)
  const hoy = hoyCO()
  const c = configParaCliente(base, e, hoy)
  if (eleccionVacia(base, c)) return snapshotDe(v)
  return armarPropuesta(c, await cargarReglas(), hoy)
}

export async function aceptar(
  p: Propuesta,
  e: EleccionCliente,
  datos: { nombre: string; documento: string; precioVisto: number },
): Promise<ResultadoAceptar> {
  if (p.estado !== 'enviada') return { ok: false, status: 409, error: p.estado === 'aceptada' || p.estado === 'convertida' ? 'Esta propuesta ya fue aceptada.' : 'Esta propuesta no está disponible.' }
  const v = await versionEnviada(p)
  if (!v) return { ok: false, status: 409, error: 'Esta propuesta no está disponible.' }
  const enviada = snapshotDe(v)
  const hoy = hoyCO()
  if (hoy > enviada.validoHasta) return { ok: false, status: 410, error: 'Esta propuesta venció. Escríbele a Mike para actualizarla.' }

  const base = configDeVersion(v, p)
  const c = configParaCliente(base, e, hoy)
  let final: { snapshot: Snapshot; version: VersionPropuesta }
  if (eleccionVacia(base, c)) final = { snapshot: enviada, version: v }
  else {
    const snapshot = armarPropuesta(c, await cargarReglas(), hoy)
    if (snapshot.plan.total !== datos.precioVisto) {
      return { ok: false, status: 409, error: 'El precio cambió mientras mirabas. Recarga la página para ver el valor actualizado.' }
    }
    final = { snapshot, version: await congelarVersion(p.id, snapshot, 'cliente', c) }
  }
  if (final.snapshot.plan.total !== datos.precioVisto) {
    return { ok: false, status: 409, error: 'El precio cambió mientras mirabas. Recarga la página para ver el valor actualizado.' }
  }

  const instante = new Date()
  const huella = huellaAceptacion({ huellaVersion: final.version.huella, nombre: datos.nombre, documento: datos.documento, instante: instante.toISOString() })
  // Condicional: si dos aceptaciones llegan a la vez, solo una transiciona.
  const r = await db
    .update(propuestas)
    .set({
      estado: 'aceptada',
      aceptadaVersion: final.version.version,
      aceptadaPor: datos.nombre,
      aceptadaDocumento: datos.documento,
      aceptadaEl: instante,
      aceptacionHuella: huella,
      precio: final.snapshot.precio,
      actualizadaEl: instante,
    })
    .where(and(eq(propuestas.id, p.id), eq(propuestas.estado, 'enviada')))
  if (r.rowsAffected === 0) return { ok: false, status: 409, error: 'Esta propuesta ya fue aceptada.' }

  await sendPush('Propuesta aceptada', `${p.titulo} · ${datos.nombre} · versión ${final.version.version}`, {
    priority: 4,
    tags: 'handshake',
    click: `${SITE_URL}/admin/plano/${p.id}`,
  }).catch(() => {})

  return { ok: true, version: final.version.version, huella, snapshot: final.snapshot }
}

export type Anticipo = { payment: Payment; monto: number; moneda: string }

/**
 * Crea (o recupera) el pago del anticipo de una propuesta aceptada. Solo en
 * pesos: Wompi no cobra en dólares, y a un cliente de fuera Mike le manda los
 * datos de pago aparte.
 */
export async function anticipo(p: Propuesta): Promise<Anticipo | { error: string; status: number }> {
  if (p.estado !== 'aceptada' && p.estado !== 'convertida') return { status: 409, error: 'Primero hay que aceptar la propuesta.' }
  if (!p.aceptadaVersion) return { status: 409, error: 'Primero hay que aceptar la propuesta.' }
  const v = await version(p.id, p.aceptadaVersion)
  if (!v) return { status: 409, error: 'No se encontró la versión aceptada.' }
  const s = snapshotDe(v)
  if (s.moneda !== 'COP') return { status: 422, error: 'El pago en línea solo está disponible en pesos.' }
  const monto = anticipoDe(s)
  const provider = serverEnv('WOMPI_PUBLIC_KEY') && serverEnv('WOMPI_INTEGRITY_SECRET') ? 'wompi' : 'mock'
  const { payment, conflict } = await createPaymentIdempotent({
    amountCents: monto * 100,
    currency: 'COP',
    description: `Anticipo · ${p.titulo}`.slice(0, 200),
    payerName: p.aceptadaPor,
    idempotencyKey: `propuesta-${p.id}-v${p.aceptadaVersion}-anticipo`,
    provider,
  })
  if (conflict) return { status: 409, error: 'El anticipo ya se generó con otro valor. Escríbele a Mike.' }
  if (payment.source !== 'propuesta' || p.anticipoPaymentId !== payment.id) {
    await db.update(payments).set({ source: 'propuesta', clientId: p.clientId }).where(eq(payments.id, payment.id))
    await db.update(propuestas).set({ anticipoPaymentId: payment.id }).where(eq(propuestas.id, p.id))
  }
  return { payment: { ...payment, source: 'propuesta' }, monto, moneda: 'COP' }
}
