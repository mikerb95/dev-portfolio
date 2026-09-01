import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql en ARCHIVO temporal, no `:memory:`: las transacciones abren otra
// conexión y una base en memoria no comparte tablas entre conexiones. Mismo
// molde que cobros-db.test.ts.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `cuentas-cobro-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import {
  allCuentasCobro,
  anularCuentaCobro,
  createCuentaCobro,
  cuentaCobro,
  cuentaCountByStatus,
  emitirCuentaCobro,
  marcarPagada,
  nextCuentaCobroNumber,
  parseSnapshot,
  updateCuentaCobro,
  topeIvaDelAnio,
} from '../src/lib/cuentas-cobro-db'
import { allInvoices, createInvoice, invoiceCountByStatus } from '../src/lib/portal/invoices'
import { UVT_2026_CENTS, type Emisor } from '../src/lib/cuentas-cobro'

let client: { execute: (sql: string) => Promise<unknown> }

const EMISOR_OK: Record<string, string> = {
  emisor_nombre: 'Mike Rodríguez',
  emisor_cedula: '1000000000',
  emisor_direccion: 'Cra 1 #2-3',
  emisor_ciudad: 'Bogotá',
  emisor_telefono: '+573000000000',
  emisor_email: 'mike@codebymike.tech',
  emisor_banco: 'Bancolombia',
  emisor_tipo_cuenta: 'Ahorros',
  emisor_numero_cuenta: '12345678901',
  emisor_declarante: 'true',
}

const sql = (s: string) => client.execute(s)

async function setSettings(map: Record<string, string>) {
  await sql('DELETE FROM app_settings')
  for (const [k, v] of Object.entries(map)) {
    await sql(`INSERT INTO app_settings (key, value, updated_at) VALUES ('${k}', '${v}', 0)`)
  }
}

const baseInput = (over: Record<string, unknown> = {}) => ({
  clientId: 1,
  items: [{ description: 'Desarrollo', quantity: 1, unitCents: 3_000_000_00 }],
  retenciones: ['honorarios' as const],
  concept: 'Servicios de desarrollo prestados en agosto de 2026',
  city: 'Bogotá',
  ...over,
})

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: typeof client }
  client = mod.__client

  await sql(`CREATE TABLE clients (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    name text NOT NULL, email text, phone text, company text, notes text,
    portal_enabled integer NOT NULL DEFAULT 0, logo_url text, billing_info text, created_at integer
  )`)
  await sql(`CREATE TABLE projects (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL, slug text NOT NULL UNIQUE, title text NOT NULL,
    client_id integer
  )`)
  await sql(`CREATE TABLE payments (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL, reference text NOT NULL UNIQUE,
    idempotency_key text NOT NULL UNIQUE, amount_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'COP', status text NOT NULL DEFAULT 'created',
    provider text NOT NULL DEFAULT 'mock', source text NOT NULL DEFAULT 'pay',
    version integer NOT NULL DEFAULT 0, created_at integer, updated_at integer
  )`)
  await sql(`CREATE TABLE app_settings (key text PRIMARY KEY NOT NULL, value text, updated_at integer)`)
  await sql(`CREATE TABLE invoices (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    client_id integer NOT NULL,
    project_id integer,
    number text NOT NULL UNIQUE,
    doc_type text NOT NULL DEFAULT 'factura',
    status text NOT NULL DEFAULT 'draft',
    currency text NOT NULL DEFAULT 'COP',
    subtotal_cents integer NOT NULL DEFAULT 0,
    tax_cents integer NOT NULL DEFAULT 0,
    total_cents integer NOT NULL DEFAULT 0,
    notes text,
    issued_at integer, due_at integer, paid_at integer, payment_id integer,
    issuer_snapshot text, payer_snapshot text, concept text,
    period_start integer, period_end integer, contract_ref text, city text,
    retentions text, retentions_cents integer NOT NULL DEFAULT 0,
    net_cents integer NOT NULL DEFAULT 0,
    ss_planilla text, ss_periodo text, signature_url text,
    created_at integer NOT NULL, updated_at integer
  )`)
  await sql(`CREATE TABLE invoice_items (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL, invoice_id integer NOT NULL,
    description text NOT NULL, quantity real NOT NULL DEFAULT 1,
    unit_cents integer NOT NULL DEFAULT 0, total_cents integer NOT NULL DEFAULT 0,
    sort_order integer NOT NULL DEFAULT 0
  )`)
})

beforeEach(async () => {
  await sql('DELETE FROM invoice_items')
  await sql('DELETE FROM invoices')
  await sql('DELETE FROM clients')
  await sql(
    `INSERT INTO clients (id, name, company, billing_info) VALUES (1, 'ACME', 'ACME S.A.S.', '{"NIT":"900123456-7","Dirección":"Cra 7 #1-2","Ciudad":"Bogotá"}')`
  )
  await sql(`INSERT INTO clients (id, name, company, billing_info) VALUES (2, 'Sin NIT', 'Sin NIT S.A.S.', '{}')`)
  await setSettings(EMISOR_OK)
})

// ── Numeración ──────────────────────────────────────────────────────────────

describe('numeración', () => {
  it('usa una serie CC- propia, correlativa por año', async () => {
    const a = await createCuentaCobro(baseInput())
    const b = await createCuentaCobro(baseInput())
    const year = new Date().getFullYear()
    expect(a.number).toBe(`CC-${year}-001`)
    expect(b.number).toBe(`CC-${year}-002`)
  })

  it('no comparte consecutivo con las facturas del portal', async () => {
    await createInvoice({ clientId: 1, items: [{ description: 'x', quantity: 1, unitCents: 1000 }] })
    const cc = await createCuentaCobro(baseInput())
    const year = new Date().getFullYear()
    // La factura se llevó el INV-001 y la cuenta arranca igualmente en CC-001:
    // son dos numeraciones independientes, sin huecos en ninguna.
    expect(cc.number).toBe(`CC-${year}-001`)
    expect(await nextCuentaCobroNumber()).toBe(`CC-${year}-002`)
  })

  it('el UNIQUE corta la carrera y el reintento asigna números distintos', async () => {
    const creadas = await Promise.all(Array.from({ length: 5 }, () => createCuentaCobro(baseInput())))
    expect(new Set(creadas.map((c) => c.number)).size).toBe(5)
  })
})

// ── Aislamiento entre los dos documentos de la tabla ────────────────────────

describe('aislamiento factura / cuenta de cobro', () => {
  it('el panel de facturas no ve las cuentas de cobro', async () => {
    await createCuentaCobro(baseInput())
    await createInvoice({ clientId: 1, items: [{ description: 'x', quantity: 1, unitCents: 1000 }] })

    const facturas = await allInvoices()
    expect(facturas).toHaveLength(1)
    expect(facturas[0].number).toMatch(/^INV-/)
  })

  it('el panel de cuentas de cobro no ve las facturas', async () => {
    await createInvoice({ clientId: 1, items: [{ description: 'x', quantity: 1, unitCents: 1000 }] })
    await createCuentaCobro(baseInput())

    const cuentas = await allCuentasCobro()
    expect(cuentas).toHaveLength(1)
    expect(cuentas[0].number).toMatch(/^CC-/)
  })

  it('los contadores de cada listado tampoco se mezclan', async () => {
    await createCuentaCobro(baseInput())
    await createCuentaCobro(baseInput())
    await createInvoice({ clientId: 1, items: [{ description: 'x', quantity: 1, unitCents: 1000 }] })

    expect((await cuentaCountByStatus()).draft).toBe(2)
    expect((await invoiceCountByStatus()).draft).toBe(1)
  })

  it('una cuenta de cobro no se puede leer como si fuera factura', async () => {
    const cc = await createCuentaCobro(baseInput())
    // El id existe, pero no bajo ese tipo: cuentaCobro sí la encuentra.
    expect(await cuentaCobro(cc.id)).not.toBeNull()
    const factura = await createInvoice({ clientId: 1, items: [{ description: 'x', quantity: 1, unitCents: 1000 }] })
    expect(await cuentaCobro(factura.id)).toBeNull()
  })
})

// ── Totales y persistencia ──────────────────────────────────────────────────

describe('totales', () => {
  it('guarda subtotal, retenciones y neto calculados en el servidor', async () => {
    const cc = await createCuentaCobro(baseInput())
    expect(cc.subtotalCents).toBe(3_000_000_00)
    expect(cc.totalCents).toBe(3_000_000_00)
    expect(cc.taxCents).toBe(0)
    expect(cc.retentionsCents).toBe(330_000_00) // 11 %, declarante
    expect(cc.netCents).toBe(2_670_000_00)
  })

  it('el IVA queda en cero aunque la retención no aplique', async () => {
    const cc = await createCuentaCobro(baseInput({ retenciones: [] }))
    expect(cc.taxCents).toBe(0)
    expect(cc.retentionsCents).toBe(0)
    expect(cc.netCents).toBe(cc.totalCents)
  })

  it('recalcula al actualizar el borrador', async () => {
    const cc = await createCuentaCobro(baseInput())
    await updateCuentaCobro(cc.id, baseInput({ items: [{ description: 'Otro', quantity: 2, unitCents: 500_000_00 }] }))

    const detalle = await cuentaCobro(cc.id)
    expect(detalle!.cuenta.totalCents).toBe(1_000_000_00)
    expect(detalle!.cuenta.retentionsCents).toBe(110_000_00)
    expect(detalle!.items).toHaveLength(1)
  })
})

// ── Emisión: validación y congelado ─────────────────────────────────────────

describe('emisión', () => {
  it('congela emisor y deudor en la fila', async () => {
    const cc = await createCuentaCobro(baseInput())
    const res = await emitirCuentaCobro(cc.id)
    expect(res.ok).toBe(true)

    const detalle = await cuentaCobro(cc.id)
    const snap = parseSnapshot<Emisor>(detalle!.cuenta.issuerSnapshot)
    expect(snap!.numeroCuenta).toBe('12345678901')
    expect(detalle!.cuenta.payerSnapshot).toContain('900123456-7')
    expect(detalle!.cuenta.status).toBe('sent')
    expect(detalle!.cuenta.issuedAt).toBeInstanceOf(Date)
  })

  it('cambiar los datos del emisor NO altera una cuenta ya emitida', async () => {
    // El bug más silencioso de todo el módulo: reimprimir un documento de hace
    // ocho meses con la cuenta bancaria de hoy.
    const cc = await createCuentaCobro(baseInput())
    await emitirCuentaCobro(cc.id)

    await setSettings({ ...EMISOR_OK, emisor_banco: 'Davivienda', emisor_numero_cuenta: '99999999999' })

    const snap = parseSnapshot<Emisor>((await cuentaCobro(cc.id))!.cuenta.issuerSnapshot)
    expect(snap!.banco).toBe('Bancolombia')
    expect(snap!.numeroCuenta).toBe('12345678901')
  })

  it('rechaza emitir sin NIT del deudor y devuelve todos los faltantes', async () => {
    const cc = await createCuentaCobro(baseInput({ clientId: 2 }))
    const res = await emitirCuentaCobro(cc.id)

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join(' ')).toContain('NIT')
    expect((await cuentaCobro(cc.id))!.cuenta.status).toBe('draft')
  })

  it('rechaza emitir si faltan datos del emisor', async () => {
    await setSettings({ ...EMISOR_OK, emisor_numero_cuenta: '' })
    const cc = await createCuentaCobro(baseInput())
    const res = await emitirCuentaCobro(cc.id)

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join(' ')).toContain('número de cuenta')
  })

  it('rechaza emitir sin concepto detallado', async () => {
    const cc = await createCuentaCobro(baseInput({ concept: null }))
    const res = await emitirCuentaCobro(cc.id)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join(' ')).toContain('concepto detallado')
  })

  it('emitir dos veces es un no-op seguro', async () => {
    const cc = await createCuentaCobro(baseInput())
    expect((await emitirCuentaCobro(cc.id)).ok).toBe(true)
    expect((await emitirCuentaCobro(cc.id)).ok).toBe(false)
  })

  it('aplica las tarifas vigentes en el momento de emitir, no las del borrador', async () => {
    const cc = await createCuentaCobro(baseInput())
    expect(cc.retentionsCents).toBe(330_000_00) // 11 %

    // El contador corrige la tarifa antes de que se emita el borrador.
    await setSettings({ ...EMISOR_OK, ret_honorarios_declarante: '10' })
    await emitirCuentaCobro(cc.id)

    expect((await cuentaCobro(cc.id))!.cuenta.retentionsCents).toBe(300_000_00) // 10 %
  })
})

// ── Inmutabilidad ───────────────────────────────────────────────────────────

describe('inmutabilidad', () => {
  it('una cuenta emitida no acepta cambios en sus líneas', async () => {
    const cc = await createCuentaCobro(baseInput())
    await emitirCuentaCobro(cc.id)
    await expect(updateCuentaCobro(cc.id, baseInput())).rejects.toThrow(/borrador/)
  })

  it('una cuenta pagada tampoco', async () => {
    const cc = await createCuentaCobro(baseInput())
    await emitirCuentaCobro(cc.id)
    await marcarPagada(cc.id)
    await expect(updateCuentaCobro(cc.id, baseInput())).rejects.toThrow()
  })

  it('una cuenta pagada no se anula', async () => {
    const cc = await createCuentaCobro(baseInput())
    await emitirCuentaCobro(cc.id)
    await marcarPagada(cc.id)
    expect(await anularCuentaCobro(cc.id)).toBe(false)
  })

  it('una cuenta anulada no se marca pagada', async () => {
    const cc = await createCuentaCobro(baseInput())
    await emitirCuentaCobro(cc.id)
    expect(await anularCuentaCobro(cc.id)).toBe(true)
    expect(await marcarPagada(cc.id)).toBe(false)
  })
})

// ── Tope de responsabilidad de IVA ──────────────────────────────────────────

describe('topeIvaDelAnio', () => {
  it('suma lo emitido y lo compara contra 3.500 UVT', async () => {
    for (let i = 0; i < 3; i++) await emitirCuentaCobro((await createCuentaCobro(baseInput())).id)

    const tope = await topeIvaDelAnio()
    expect(tope.emitidoCents).toBe(9_000_000_00)
    expect(tope.topeCents).toBe(3500 * UVT_2026_CENTS)
    expect(tope.nivel).toBe('ok')
  })

  it('no cuenta borradores ni anuladas: no son documentos vivos', async () => {
    await createCuentaCobro(baseInput()) // borrador
    const anulada = await createCuentaCobro(baseInput())
    await emitirCuentaCobro(anulada.id)
    await anularCuentaCobro(anulada.id)

    expect((await topeIvaDelAnio()).emitidoCents).toBe(0)
  })

  it('se dispara la alerta al acercarse al tope', async () => {
    const casi = Math.round(3500 * UVT_2026_CENTS * 0.95)
    const cc = await createCuentaCobro(
      baseInput({ items: [{ description: 'Proyecto anual', quantity: 1, unitCents: casi }] })
    )
    await emitirCuentaCobro(cc.id)

    expect((await topeIvaDelAnio()).nivel).toBe('alerta')
  })
})
