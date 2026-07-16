import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql local (archivo temporal), igual que payments.test.ts: ejercita el
// flujo real (UNIQUE de short_code, join con clients, máquina de estados) sin
// tocar Turso.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `cobros-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// El push es un efecto externo: no se dispara en tests.
vi.mock('../src/lib/notify', () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }))

import {
  createCobro,
  findByShortCode,
  findClientByPhone,
  listCobros,
  voidCobro,
  historyForPhone,
  distinctPhones,
} from '../src/lib/cobros-db'
import { applyGatewayEvent } from '../src/lib/payments'
import { isValidShortCode } from '../src/lib/cobros'

const PHONE = '+573104641228'
const OTRO = '+573001112233'

let client: { execute: (sql: string) => Promise<unknown> }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client

  await client.execute(`CREATE TABLE clients (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    company text,
    notes text,
    portal_enabled integer NOT NULL DEFAULT 0,
    logo_url text,
    billing_info text,
    created_at integer
  )`)
  await client.execute(`CREATE TABLE payments (
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
    invoice_id integer,
    payer_phone text,
    source text NOT NULL DEFAULT 'pay',
    short_code text UNIQUE,
    expires_at integer,
    client_id integer,
    version integer NOT NULL DEFAULT 0,
    created_at integer,
    updated_at integer
  )`)
  await client.execute(`CREATE TABLE payment_events (
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

beforeEach(async () => {
  await client.execute('DELETE FROM payment_events')
  await client.execute('DELETE FROM payments')
  await client.execute('DELETE FROM clients')
})

const nuevoCobro = (over: Partial<Parameters<typeof createCobro>[0]> = {}) =>
  createCobro({
    amountCents: 15_000_000,
    phone: PHONE,
    concept: 'mantenimiento',
    expiry: '72h',
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}-test`,
    ...over,
  })

describe('createCobro', () => {
  it('crea un cobro con código, vencimiento y teléfono', async () => {
    const { payment, replayed, client: crm } = await nuevoCobro()

    expect(replayed).toBe(false)
    expect(payment.source).toBe('cobro')
    expect(payment.payerPhone).toBe(PHONE)
    expect(payment.amountCents).toBe(15_000_000)
    expect(payment.status).toBe('created')
    expect(isValidShortCode(payment.shortCode)).toBe(true)
    expect(payment.expiresAt).toBeInstanceOf(Date)
    expect(crm).toBeNull()

    // El código quedó persistido, no solo en el objeto devuelto.
    const desdeDb = await findByShortCode(payment.shortCode!)
    expect(desdeDb?.id).toBe(payment.id)
  })

  it('vincula la ficha del CRM cuando el teléfono coincide', async () => {
    await client.execute(`INSERT INTO clients (name, phone) VALUES ('Juan Pérez', '${PHONE}')`)

    const { payment, client: crm } = await nuevoCobro()
    expect(crm?.name).toBe('Juan Pérez')
    expect(payment.clientId).toBe(crm!.id)
  })

  it('no vincula ni crea ficha si el teléfono no está en el CRM', async () => {
    await client.execute(`INSERT INTO clients (name, phone) VALUES ('Juan Pérez', '${OTRO}')`)

    const { payment, client: crm } = await nuevoCobro()
    expect(crm).toBeNull()
    expect(payment.clientId).toBeNull()

    const restantes = await client.execute('SELECT COUNT(*) as n FROM clients')
    expect((restantes as { rows: { n: number }[] }).rows[0].n).toBe(1)
  })

  it('sin vencimiento cuando se pide "never"', async () => {
    const { payment } = await nuevoCobro({ expiry: 'never' })
    expect(payment.expiresAt).toBeNull()
  })

  it('doble clic en Confirmar NO crea dos cobros', async () => {
    const key = 'misma-clave-de-prueba'
    const primero = await nuevoCobro({ idempotencyKey: key })
    const segundo = await nuevoCobro({ idempotencyKey: key })

    expect(segundo.replayed).toBe(true)
    expect(segundo.payment.id).toBe(primero.payment.id)

    const todos = await listCobros()
    expect(todos).toHaveLength(1)
  })

  it('un replay NO reasigna el código: el link ya enviado sigue sirviendo', async () => {
    const key = 'clave-replay'
    const primero = await nuevoCobro({ idempotencyKey: key })
    const segundo = await nuevoCobro({ idempotencyKey: key })

    expect(segundo.payment.shortCode).toBe(primero.payment.shortCode)
  })

  it('la misma clave con otro monto es conflicto, no un cobro por el valor viejo', async () => {
    const key = 'clave-conflicto'
    await nuevoCobro({ idempotencyKey: key, amountCents: 15_000_000 })
    const { conflict } = await nuevoCobro({ idempotencyKey: key, amountCents: 99_000_000 })

    expect(conflict).toMatch(/otro monto/)
  })

  it('genera códigos distintos para cobros distintos', async () => {
    const a = await nuevoCobro()
    const b = await nuevoCobro()
    expect(a.payment.shortCode).not.toBe(b.payment.shortCode)
  })
})

describe('findByShortCode', () => {
  it('devuelve null para un código que no existe', async () => {
    await expect(findByShortCode('ZZZZZZ')).resolves.toBeNull()
  })
})

describe('findClientByPhone', () => {
  it('compara en forma canónica E.164', async () => {
    await client.execute(`INSERT INTO clients (name, phone) VALUES ('Ana', '${PHONE}')`)
    await expect(findClientByPhone(PHONE)).resolves.toMatchObject({ name: 'Ana' })
    await expect(findClientByPhone(OTRO)).resolves.toBeNull()
  })
})

describe('listCobros', () => {
  it('solo lista cobros de campo, no los pagos de /pay', async () => {
    await nuevoCobro()
    // Pago suelto del checkout público: no debe aparecer en /cobrar.
    await client.execute(
      `INSERT INTO payments (reference, idempotency_key, amount_cents, source, status)
       VALUES ('pay_suelto', 'k-suelto', 5000000, 'pay', 'approved')`,
    )

    const cobros = await listCobros()
    expect(cobros).toHaveLength(1)
    expect(cobros[0].source).toBe('cobro')
  })

  it('con onlyOpen deja fuera los terminales', async () => {
    const abierto = await nuevoCobro()
    const cerrado = await nuevoCobro()
    await voidCobro(cerrado.payment.reference, 'prueba')

    const abiertos = await listCobros(30, true)
    expect(abiertos.map((c) => c.reference)).toEqual([abierto.payment.reference])

    const todos = await listCobros(30, false)
    expect(todos).toHaveLength(2)
  })

  it('trae el nombre del cliente vinculado', async () => {
    await client.execute(`INSERT INTO clients (name, phone) VALUES ('Juan Pérez', '${PHONE}')`)
    await nuevoCobro()

    const [cobro] = await listCobros()
    expect(cobro.clientName).toBe('Juan Pérez')
  })
})

describe('voidCobro', () => {
  it('anula un cobro pendiente y lo deja registrado como evidencia', async () => {
    const { payment } = await nuevoCobro()
    const res = await voidCobro(payment.reference, 'cliente canceló')

    expect(res.applied).toBe(true)
    expect(res.statusAfter).toBe('voided')

    const eventos = (await client.execute(
      `SELECT type, event_status, payload FROM payment_events WHERE payment_id = ${payment.id}`,
    )) as { rows: { type: string; event_status: string; payload: string }[] }
    expect(eventos.rows[0].type).toBe('admin.void')
    expect(eventos.rows[0].event_status).toBe('voided')
    expect(eventos.rows[0].payload).toContain('cliente canceló')
  })

  it('anular dos veces no rompe: la máquina lo frena', async () => {
    const { payment } = await nuevoCobro()
    await voidCobro(payment.reference, 'primera')
    const segunda = await voidCobro(payment.reference, 'segunda')

    expect(segunda.applied).toBe(false)
    expect(segunda.statusAfter).toBe('voided')
  })

  it('un cobro ya pagado sí se puede anular (reembolso manual)', async () => {
    const { payment } = await nuevoCobro()
    await applyGatewayEvent({
      provider: 'mock',
      type: 'transaction.updated',
      reference: payment.reference,
      status: 'approved',
    })

    const res = await voidCobro(payment.reference, 'reembolsado en efectivo')
    expect(res.applied).toBe(true)
    expect(res.statusAfter).toBe('voided')
  })

  it('una referencia inexistente no revienta', async () => {
    const res = await voidCobro('pay_no_existe', 'x')
    expect(res.ok).toBe(false)
  })
})

describe('historyForPhone', () => {
  it('devuelve solo los cobros de ESE teléfono', async () => {
    await nuevoCobro({ amountCents: 10_000_000 })
    await nuevoCobro({ amountCents: 20_000_000, phone: OTRO })

    const historial = await historyForPhone(PHONE)
    expect(historial).toHaveLength(1)
    expect(historial[0].amountCents).toBe(10_000_000)
  })

  it('no incluye los pagos sueltos de /pay aunque compartan teléfono', async () => {
    await client.execute(
      `INSERT INTO payments (reference, idempotency_key, amount_cents, source, status, payer_phone)
       VALUES ('pay_suelto', 'k-suelto', 5000000, 'pay', 'approved', '${PHONE}')`,
    )
    await expect(historyForPhone(PHONE)).resolves.toHaveLength(0)
  })
})

describe('distinctPhones', () => {
  it('lista cada teléfono una sola vez', async () => {
    await nuevoCobro()
    await nuevoCobro()
    await nuevoCobro({ phone: OTRO })

    const phones = await distinctPhones()
    expect(phones.sort()).toEqual([OTRO, PHONE].sort())
  })

  it('ignora los pagos sin teléfono', async () => {
    await client.execute(
      `INSERT INTO payments (reference, idempotency_key, amount_cents, source, status)
       VALUES ('pay_sin_tel', 'k-sin', 5000000, 'cobro', 'created')`,
    )
    await expect(distinctPhones()).resolves.toEqual([])
  })
})
