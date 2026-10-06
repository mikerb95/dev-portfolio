import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Flujo completo de Plano contra libSQL en archivo temporal (no :memory:, que
// no comparte tablas entre conexiones). Las tablas salen de las migraciones
// REALES de drizzle/, así la prueba falla si el schema y el código se separan.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join: j } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = j(tmpdir(), `plano-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// Efectos externos: ni push ni correo en pruebas.
vi.mock('../src/lib/notify', () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }), sendEmail: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../src/lib/email', () => ({
  SITE_URL: 'https://codebymike.net',
  sendInvitationEmail: vi.fn().mockResolvedValue({ ok: true }),
  sendResetEmail: vi.fn().mockResolvedValue({ ok: true }),
}))

import { db } from '../src/db'
import { clients, invoices, payments, projectMilestones, projects, propuestas } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { applyGatewayEvent } from '../src/lib/payments'
import { aceptar, anticipo, simular } from '../src/lib/plano/aceptacion'
import { convertirPorReferencia } from '../src/lib/plano/conversion'
import { congelarDesdeConfig, crearPropuesta, hoyCO, marcarEnviada, propuesta, versiones } from '../src/lib/plano/db'
import { normalizarConfig } from '../src/lib/plano/propuesta'
import { CONTACTO_DEFAULT } from '../src/lib/plano/contacto'

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { __client: { execute: (s: string) => Promise<unknown> } }
  const dir = join(process.cwd(), 'drizzle')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(join(dir, f), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) await mod.__client.execute(stmt)
    }
  }
})

function config() {
  return normalizarConfig(
    {
      titulo: 'Tienda de La Espiga',
      cliente: { nombre: 'Laura Gómez', tipo: 'persona', correo: 'laura@example.com', telefono: '3001112233', documento: '1020304050' },
      base: 'negocio',
      lineas: [{ id: 'descubrimiento' }, { id: 'tienda', prioridad: 'esencial' }, { id: 'pagos', prioridad: 'esencial' }, { id: 'reportes', prioridad: 'extra' }, { id: 'entrega' }],
      perillas: { version: true, planPago: true, lineas: ['reportes'] },
      contacto: { ...CONTACTO_DEFAULT, contacto: { nombre: 'Laura Gómez', rol: 'Dueña', telefono: '3001112233', correo: 'laura@example.com' } },
      fechaInicio: hoyCO(),
    },
    hoyCO(),
  )
}

describe('Plano de punta a punta', () => {
  let id = 0

  it('congela versiones sin duplicar las idénticas', async () => {
    const p = await crearPropuesta(config())
    id = p.id
    const a = await congelarDesdeConfig(p, config(), 'panel')
    const b = await congelarDesdeConfig(p, config(), 'panel')
    expect(a.version.version).toBe(1)
    expect(b.version.version).toBe(1)
    expect(await versiones(id)).toHaveLength(1)
    const fila = await propuesta(id)
    expect(fila!.precio).toBe(a.snapshot.precio)
  })

  it('simula lo que el cliente elige desde la versión enviada', async () => {
    await marcarEnviada(id)
    const p = (await propuesta(id))!
    const sin = await simular(p, {})
    const con = await simular(p, { lineas: { reportes: true } })
    expect(con!.precio).toBeGreaterThan(sin!.precio)
    // Una perilla que Mike no habilitó no cambia nada.
    const tienda = await simular(p, { lineas: { tienda: false } })
    expect(tienda!.precio).toBe(sin!.precio)
  })

  it('no acepta si el precio que vio el cliente no cuadra', async () => {
    const p = (await propuesta(id))!
    const r = await aceptar(p, { lineas: { reportes: true } }, { nombre: 'Laura Gómez', documento: '1020304050', precioVisto: 1 })
    expect(r.ok).toBe(false)
    expect((await propuesta(id))!.estado).toBe('enviada')
  })

  it('acepta con constancia y congela la versión del cliente', async () => {
    const p = (await propuesta(id))!
    const s = await simular(p, { lineas: { reportes: true } })
    const r = await aceptar(p, { lineas: { reportes: true } }, { nombre: 'Laura Gómez', documento: '1020304050', precioVisto: s!.plan.total })
    expect(r.ok).toBe(true)
    const fila = (await propuesta(id))!
    expect(fila.estado).toBe('aceptada')
    expect(fila.aceptadaVersion).toBe(2)
    expect(fila.aceptacionHuella).toMatch(/^[0-9a-f]{64}$/)
    // Una segunda aceptación no vuelve a transicionar.
    const otra = await aceptar(fila, {}, { nombre: 'Otra Persona', documento: '999999', precioVisto: s!.plan.total })
    expect(otra.ok).toBe(false)
  })

  it('el anticipo es idempotente', async () => {
    const p = (await propuesta(id))!
    const a = await anticipo(p)
    const b = await anticipo((await propuesta(id))!)
    if ('error' in a || 'error' in b) throw new Error('no se generó el anticipo')
    expect(a.payment.id).toBe(b.payment.id)
    expect(a.payment.amountCents).toBe(a.monto * 100)
    const [pago] = await db.select().from(payments).where(eq(payments.id, a.payment.id))
    expect(pago.source).toBe('propuesta')
  })

  it('al aprobarse el anticipo crea cliente, proyecto, hitos y cuentas de cobro, una sola vez', async () => {
    const p = (await propuesta(id))!
    const [pago] = await db.select().from(payments).where(eq(payments.id, p.anticipoPaymentId!))
    await applyGatewayEvent({ provider: 'mock', type: 'transaction.updated', reference: pago.reference, gatewayTxId: 'tx1', status: 'pending' })
    await applyGatewayEvent({ provider: 'mock', type: 'transaction.updated', reference: pago.reference, gatewayTxId: 'tx1', status: 'approved' })
    const r1 = await convertirPorReferencia(pago.reference)
    const r2 = await convertirPorReferencia(pago.reference)
    expect(r1.convertida).toBe(true)
    expect(r2.convertida).toBe(false)

    const fila = (await propuesta(id))!
    expect(fila.estado).toBe('convertida')
    expect(fila.projectId).toBe(r1.projectId)
    const [cli] = await db.select().from(clients).where(eq(clients.id, fila.clientId!))
    expect(cli.email).toBe('laura@example.com')
    expect(cli.portalEnabled).toBe(true)
    expect(await db.select().from(projects)).toHaveLength(1)
    const hitos = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, fila.projectId!))
    expect(hitos.map((h) => h.title)).toContain('Publicación')
    const cuentas = await db.select().from(invoices).where(eq(invoices.projectId, fila.projectId!))
    expect(cuentas.length).toBeGreaterThan(0)
    expect(cuentas.every((c) => c.docType === 'cuenta_cobro' && c.status === 'draft')).toBe(true)
    const [pagoFinal] = await db.select().from(propuestas).where(eq(propuestas.id, id))
    expect(pagoFinal.clientId).toBe(cli.id)
  })
})
