import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createHash } from 'node:crypto'

// BD libsql EN MEMORIA en lugar de Turso: los tests ejercen el flujo real
// (UNIQUE de idempotencia, UPDATE con version) sin tocar producción.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const schema = await import('../src/db/schema')
  const client = createClient({ url: ':memory:' })
  return { db: drizzle(client, { schema }), __client: client }
})

import {
  canTransition,
  isTerminal,
  normalizeGatewayStatus,
  isValidIdempotencyKey,
  wompiIntegritySignature,
  verifyWompiEventSignature,
  createPaymentIdempotent,
  applyGatewayEvent,
  newReference,
} from '../src/lib/payments'

beforeAll(async () => {
  const { __client } = (await import('../src/db')) as unknown as { __client: { execute: (sql: string) => Promise<unknown> } }
  await __client.execute(`CREATE TABLE payments (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    reference text NOT NULL UNIQUE,
    idempotency_key text NOT NULL UNIQUE,
    description text,
    amount_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'COP',
    status text NOT NULL DEFAULT 'created',
    provider text NOT NULL DEFAULT 'mock',
    gateway_tx_id text,
    payer_email text,
    version integer NOT NULL DEFAULT 0,
    created_at integer,
    updated_at integer
  )`)
  await __client.execute(`CREATE TABLE payment_events (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    payment_id integer NOT NULL,
    provider text NOT NULL,
    type text NOT NULL,
    gateway_tx_id text,
    event_status text,
    payload text,
    duplicate integer NOT NULL DEFAULT 0,
    out_of_order integer NOT NULL DEFAULT 0,
    amount_mismatch integer NOT NULL DEFAULT 0,
    received_at integer
  )`)
})

const checkoutInput = (key: string) => ({
  amountCents: 25_000_00,
  currency: 'COP',
  description: 'test',
  idempotencyKey: key,
  provider: 'mock' as const,
})

describe('máquina de estados', () => {
  it('flujo feliz: created → pending → approved', () => {
    expect(canTransition('created', 'pending')).toBe(true)
    expect(canTransition('pending', 'approved')).toBe(true)
  })

  it('los terminales no retroceden (webhooks fuera de orden)', () => {
    expect(canTransition('approved', 'pending')).toBe(false)
    expect(canTransition('approved', 'created')).toBe(false)
    expect(canTransition('declined', 'approved')).toBe(false)
    expect(canTransition('error', 'pending')).toBe(false)
  })

  it('un pago aprobado no puede "rechazarse" después, solo anularse', () => {
    expect(canTransition('approved', 'declined')).toBe(false)
    expect(canTransition('approved', 'voided')).toBe(true)
    expect(canTransition('voided', 'approved')).toBe(false)
  })

  it('mismo estado no es transición', () => {
    expect(canTransition('pending', 'pending')).toBe(false)
  })

  it('isTerminal y normalización de estados de la pasarela', () => {
    expect(isTerminal('approved')).toBe(true)
    expect(isTerminal('pending')).toBe(false)
    expect(normalizeGatewayStatus('APPROVED')).toBe('approved')
    expect(normalizeGatewayStatus('Pending')).toBe('pending')
    expect(normalizeGatewayStatus('QUE_ES_ESTO')).toBeNull()
    expect(normalizeGatewayStatus(null)).toBeNull()
  })
})

describe('firmas Wompi', () => {
  it('firma de integridad del checkout = SHA256(ref+monto+moneda+secreto)', () => {
    const sig = wompiIntegritySignature('pay_abc', 2500000, 'COP', 'secreto')
    const manual = createHash('sha256').update('pay_abc2500000COPsecreto').digest('hex')
    expect(sig).toBe(manual)
  })

  const buildEvent = (secret: string, amount = 2500000) => {
    const data = { transaction: { id: 'tx-1', status: 'APPROVED', amount_in_cents: amount } }
    const timestamp = 1720000000
    const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']
    const checksum = createHash('sha256')
      .update(`tx-1APPROVED${amount}${timestamp}${secret}`)
      .digest('hex')
    return { data, timestamp, signature: { checksum, properties: props } }
  }

  it('acepta un evento con checksum válido', () => {
    expect(verifyWompiEventSignature(buildEvent('s3cr3t'), 's3cr3t')).toBe(true)
  })

  it('rechaza monto manipulado, secreto incorrecto y campos ausentes', () => {
    const evt = buildEvent('s3cr3t')
    ;(evt.data.transaction as { amount_in_cents: number }).amount_in_cents = 99
    expect(verifyWompiEventSignature(evt, 's3cr3t')).toBe(false)

    expect(verifyWompiEventSignature(buildEvent('s3cr3t'), 'otro')).toBe(false)
    expect(verifyWompiEventSignature({ data: {}, timestamp: 1 }, 's3cr3t')).toBe(false)
  })
})

describe('validación de idempotency key y referencias', () => {
  it('acepta UUIDs y rechaza claves cortas o con caracteres raros', () => {
    expect(isValidIdempotencyKey(crypto.randomUUID())).toBe(true)
    expect(isValidIdempotencyKey('corta')).toBe(false)
    expect(isValidIdempotencyKey('con espacios no vale!')).toBe(false)
    expect(isValidIdempotencyKey(123)).toBe(false)
  })

  it('newReference genera referencias únicas con prefijo pay_', () => {
    const a = newReference()
    expect(a).toMatch(/^pay_[0-9a-f]{16}$/)
    expect(a).not.toBe(newReference())
  })
})

describe('createPaymentIdempotent (contra BD en memoria)', () => {
  it('la misma clave devuelve el MISMO pago (replay), no uno nuevo', async () => {
    const key = `idem-${crypto.randomUUID()}`
    const first = await createPaymentIdempotent(checkoutInput(key))
    const second = await createPaymentIdempotent(checkoutInput(key))
    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(second.payment.id).toBe(first.payment.id)
    expect(second.payment.reference).toBe(first.payment.reference)
  })

  it('doble clic: requests concurrentes con la misma clave crean UN pago', async () => {
    const key = `race-${crypto.randomUUID()}`
    const [a, b] = await Promise.all([
      createPaymentIdempotent(checkoutInput(key)),
      createPaymentIdempotent(checkoutInput(key)),
    ])
    expect(a.payment.id).toBe(b.payment.id)
  })

  it('claves distintas crean pagos distintos', async () => {
    const a = await createPaymentIdempotent(checkoutInput(`k1-${crypto.randomUUID()}`))
    const b = await createPaymentIdempotent(checkoutInput(`k2-${crypto.randomUUID()}`))
    expect(a.payment.id).not.toBe(b.payment.id)
  })

  it('misma clave con OTRO monto es conflicto, nunca un replay silencioso', async () => {
    const key = `conflict-${crypto.randomUUID()}`
    const first = await createPaymentIdempotent(checkoutInput(key))
    const evil = await createPaymentIdempotent({ ...checkoutInput(key), amountCents: 999_00 })
    expect(first.conflict).toBeUndefined()
    expect(evil.replayed).toBe(true)
    expect(evil.conflict).toContain('otro monto')
    // El pago original queda intacto con su monto correcto.
    expect(evil.payment.amountCents).toBe(first.payment.amountCents)
  })
})

describe('applyGatewayEvent (webhooks contra BD en memoria)', () => {
  const seed = async () => (await createPaymentIdempotent(checkoutInput(`evt-${crypto.randomUUID()}`))).payment
  const evt = (reference: string, status: 'pending' | 'approved' | 'declined', tx = 'tx-1') => ({
    provider: 'mock' as const,
    type: 'transaction.updated',
    reference,
    gatewayTxId: tx,
    status,
  })

  it('flujo normal: pending y luego approved aplican en orden', async () => {
    const p = await seed()
    const r1 = await applyGatewayEvent(evt(p.reference, 'pending'))
    expect(r1).toMatchObject({ applied: true, statusBefore: 'created', statusAfter: 'pending' })
    const r2 = await applyGatewayEvent(evt(p.reference, 'approved'))
    expect(r2).toMatchObject({ applied: true, statusAfter: 'approved' })
  })

  it('webhook duplicado: la 2ª entrega se marca duplicate y no re-aplica', async () => {
    const p = await seed()
    await applyGatewayEvent(evt(p.reference, 'approved'))
    const dup = await applyGatewayEvent(evt(p.reference, 'approved'))
    expect(dup.duplicate).toBe(true)
    expect(dup.applied).toBe(false)
  })

  it('fuera de orden: pending después de approved no retrocede el estado', async () => {
    const p = await seed()
    await applyGatewayEvent(evt(p.reference, 'approved'))
    const late = await applyGatewayEvent(evt(p.reference, 'pending'))
    expect(late.outOfOrder).toBe(true)
    expect(late.applied).toBe(false)
    expect(late.statusAfter).toBe('approved')
  })

  it('race de eventos contradictorios: exactamente uno gana', async () => {
    const p = await seed()
    const [a, d] = await Promise.all([
      applyGatewayEvent(evt(p.reference, 'approved', 'tx-a')),
      applyGatewayEvent(evt(p.reference, 'declined', 'tx-d')),
    ])
    expect([a, d].filter((r) => r.applied)).toHaveLength(1)
  })

  it('referencia desconocida: reporta error sin lanzar', async () => {
    const r = await applyGatewayEvent(evt('pay_no_existe', 'approved'))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('referencia desconocida')
  })

  it('monto que no coincide: el evento NO aprueba el pago', async () => {
    const p = await seed() // amountCents = 2.500.000
    const r = await applyGatewayEvent({ ...evt(p.reference, 'approved'), amountCents: 100 })
    expect(r.amountMismatch).toBe(true)
    expect(r.applied).toBe(false)
    expect(r.statusAfter).toBe('created')
  })

  it('moneda que no coincide tampoco aplica', async () => {
    const p = await seed()
    const r = await applyGatewayEvent({ ...evt(p.reference, 'approved'), amountCents: p.amountCents, currency: 'USD' })
    expect(r.amountMismatch).toBe(true)
    expect(r.applied).toBe(false)
  })

  it('monto correcto explícito sí aplica', async () => {
    const p = await seed()
    const r = await applyGatewayEvent({ ...evt(p.reference, 'approved'), amountCents: p.amountCents, currency: 'COP' })
    expect(r.amountMismatch).toBeFalsy()
    expect(r.applied).toBe(true)
    expect(r.statusAfter).toBe('approved')
  })
})
