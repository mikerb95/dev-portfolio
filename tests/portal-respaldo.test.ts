import { describe, expect, it, vi } from 'vitest'

// `computeProgress` vive en projects.ts, que importa `../db` para las consultas
// reales. Aquí no se consulta nada (ese es justo el punto del modo respaldo),
// así que se mockea el módulo de base: sin esto, importar el archivo revienta
// al crear el cliente de libSQL porque no hay TURSO_DATABASE_URL en los tests.
vi.mock('../src/db', () => ({ db: {}, demoAvailable: false, runInDemoContext: (f: () => unknown) => f() }))
import {
  RESPALDO_CLIENT_ID,
  SESION_RESPALDO,
  actividadRespaldo,
  crearPaseRespaldo,
  enRespaldo,
  facturaRespaldo,
  facturasRespaldo,
  hitosRespaldo,
  proyectosRespaldo,
  resumenFacturasRespaldo,
  runInRespaldoContext,
  rutaCubiertaPorRespaldo,
  verificarPaseRespaldo,
} from '../src/lib/portal/respaldo'
import { computeProgress } from '../src/lib/portal/projects'

const SECRETO = 'secreto-de-prueba-0123456789'

describe('pase de respaldo', () => {
  it('se verifica con el mismo secreto y no con otro', () => {
    const pase = crearPaseRespaldo(SECRETO)
    expect(verificarPaseRespaldo(pase, SECRETO)).toBe(true)
    expect(verificarPaseRespaldo(pase, 'otro-secreto')).toBe(false)
    expect(verificarPaseRespaldo(pase, undefined)).toBe(false)
  })

  it('rechaza un vencimiento reescrito', () => {
    // Alargar la validez a mano invalida la firma: es todo lo que protege a un
    // pase sin estado en base.
    const pase = crearPaseRespaldo(SECRETO)
    const [, mac] = pase.split('.')
    const estirado = `${Date.now() + 86_400_000}.${mac}`
    expect(verificarPaseRespaldo(estirado, SECRETO)).toBe(false)
  })

  it('rechaza un pase vencido', () => {
    const viejo = `${Date.now() - 1000}.${'a'.repeat(64)}`
    expect(verificarPaseRespaldo(viejo, SECRETO)).toBe(false)
  })

  it('rechaza basura sin lanzar', () => {
    for (const v of ['', 'sin-punto', '.', 'abc.def', '999.', undefined]) {
      expect(() => verificarPaseRespaldo(v as string, SECRETO)).not.toThrow()
      expect(verificarPaseRespaldo(v as string, SECRETO)).toBe(false)
    }
  })
})

describe('contexto', () => {
  it('fuera del contexto no hay modo respaldo', () => {
    expect(enRespaldo()).toBe(false)
  })

  it('dentro sí, y no se escapa del ámbito', () => {
    runInRespaldoContext(() => {
      expect(enRespaldo()).toBe(true)
    })
    expect(enRespaldo()).toBe(false)
  })

  it('se propaga por await', async () => {
    await runInRespaldoContext(async () => {
      await new Promise((r) => setTimeout(r, 1))
      expect(enRespaldo()).toBe(true)
    })
  })
})

describe('rutas cubiertas', () => {
  it('cubre solo el recorrido que el snapshot sabe servir', () => {
    for (const p of ['/portal', '/portal/', '/portal/facturas', '/portal/facturas/2'])
      expect(rutaCubiertaPorRespaldo(p), p).toBe(true)
  })

  it('deja fuera lo que reventaría con la base caída', () => {
    // Estas páginas hacen consultas sin guarda: mejor mandarlas al login que
    // enseñar un 500 en mitad de la sustentación.
    for (const p of ['/portal/documentos', '/portal/mensajes', '/portal/cuenta', '/portal/actividad'])
      expect(rutaCubiertaPorRespaldo(p), p).toBe(false)
  })

  it('no cubre APIs ni rutas de otro dominio', () => {
    for (const p of ['/api/portal/live', '/api/portal/facturas/2', '/admin', '/portal/facturas/abc'])
      expect(rutaCubiertaPorRespaldo(p), p).toBe(false)
  })
})

describe('identidad sintética', () => {
  it('usa un clientId imposible', () => {
    // Si algún día una consulta real se colara con esta identidad, el WHERE no
    // encontraría nada en vez de devolver datos de otro cliente.
    expect(RESPALDO_CLIENT_ID).toBe(-1)
    expect(SESION_RESPALDO.client.id).toBe(-1)
    expect(SESION_RESPALDO.user.clientId).toBe(-1)
  })
})

describe('snapshot', () => {
  it('las fechas son relativas a hoy, no absolutas', () => {
    // Si fueran absolutas, la demo envejecería y acabaría con todo vencido.
    const [, pendiente] = facturasRespaldo()
    const dias = (pendiente.dueAt.getTime() - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(8)
    expect(dias).toBeLessThan(10)
  })

  it('trae los tres estados de factura, que es lo que hace útil la demo', () => {
    const estados = facturasRespaldo().map((f) => f.status).sort()
    expect(estados).toEqual(['overdue', 'paid', 'sent'])
  })

  it('el resumen cuadra con las facturas', () => {
    const r = resumenFacturasRespaldo()
    const fs = facturasRespaldo()
    const porPagar = fs.filter((f) => f.status === 'sent' || f.status === 'overdue')
    expect(r.dueCount).toBe(porPagar.length)
    expect(r.dueCents).toBe(porPagar.reduce((s, f) => s + f.totalCents, 0))
    expect(r.overdueCount).toBe(1)
    expect(r.currency).toBe('COP')
  })

  it('el detalle de una factura suma sus líneas', () => {
    const d = facturaRespaldo(2)
    expect(d).not.toBeNull()
    const suma = d!.items.reduce((s, i) => s + i.totalCents, 0)
    expect(suma).toBe(d!.invoice.subtotalCents)
    expect(d!.invoice.totalCents).toBe(d!.invoice.subtotalCents + d!.invoice.taxCents)
  })

  it('una factura inexistente es null, no una excepción', () => {
    expect(facturaRespaldo(999)).toBeNull()
  })

  it('los hitos producen un avance intermedio', () => {
    // Ni 0% ni 100%: un proyecto a medias es lo que hace creíble la demo.
    const p = computeProgress(hitosRespaldo())
    expect(p.total).toBe(4)
    expect(p.pct).toBeGreaterThan(0)
    expect(p.pct).toBeLessThan(100)
    expect(p.next).not.toBeNull()
  })

  it('hay al menos un proyecto y actividad para el feed', () => {
    expect(proyectosRespaldo().length).toBeGreaterThan(0)
    expect(actividadRespaldo().items.length).toBeGreaterThan(0)
    expect(actividadRespaldo().nextCursor).toBeNull()
  })

  it('toda la actividad pertenece al cliente sintético', () => {
    for (const a of actividadRespaldo().items) expect(a.clientId).toBe(RESPALDO_CLIENT_ID)
  })
})
