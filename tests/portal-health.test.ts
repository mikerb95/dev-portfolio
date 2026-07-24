import { describe, it, expect, beforeAll } from 'vitest'
import { vi } from 'vitest'

// Base libsql en archivo temporal con el esquema real, igual que
// portal-isolation.test.ts. Aquí importa de verdad: lo que se prueba es que el
// chequeo DETECTA un esquema roto, y eso no se puede comprobar con un doble
// (un mock devolvería lo que se le pida, incluida la salud que no hay).
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `portal-health-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { migrate } from 'drizzle-orm/libsql/migrator'
import { sql } from 'drizzle-orm'
import { db } from '../src/db'
import { healthVerdict, runPortalHealth, type HealthCheck } from '../src/lib/portal/health'

const check = (ok: boolean): HealthCheck => ({ ok, ms: 1, error: ok ? null : 'boom' })

describe('portal · health check', () => {
  describe('healthVerdict (puro)', () => {
    it('está sano solo si TODOS los chequeos pasan', () => {
      const v = healthVerdict({ db: check(true), session_lookup: check(true) })
      expect(v).toEqual({ ok: true, status: 200, failed: [] })
    })

    it('basta con que uno falle para reportar 503', () => {
      const v = healthVerdict({ db: check(true), session_lookup: check(false) })
      expect(v.ok).toBe(false)
      expect(v.status).toBe(503)
      expect(v.failed).toEqual(['session_lookup'])
    })

    it('nombra todos los chequeos caídos, no solo el primero', () => {
      // El motor de uptime solo guarda el estado, pero el cuerpo lo lee un
      // humano a las 3 a.m.: decir "falla la base" cuando también falla el
      // esquema manda a depurar al sitio equivocado.
      const v = healthVerdict({ db: check(false), session_lookup: check(false) })
      expect(v.failed).toEqual(['db', 'session_lookup'])
    })

    it('sin chequeos no inventa una caída', () => {
      expect(healthVerdict({}).ok).toBe(true)
    })
  })

  describe('runPortalHealth (contra base real)', () => {
    beforeAll(async () => {
      await migrate(db, { migrationsFolder: './drizzle' })
    })

    it('reporta sano con el esquema aplicado', async () => {
      const health = await runPortalHealth()
      expect(health.ok).toBe(true)
      expect(health.checks.db.ok).toBe(true)
      expect(health.checks.session_lookup.ok).toBe(true)
      expect(health.checks.session_lookup.error).toBeNull()
    })

    it('no filtra datos de clientes: solo booleanos, milisegundos y error', async () => {
      // La respuesta es pública (la consume el monitor). Este test es el que
      // impide que alguien "mejore" el endpoint devolviendo, por ejemplo, el
      // número de clientes activos.
      const health = await runPortalHealth()
      for (const c of Object.values(health.checks)) {
        expect(Object.keys(c).sort()).toEqual(['error', 'ms', 'ok'])
        expect(typeof c.ms).toBe('number')
      }
      expect(Object.keys(health).sort()).toEqual(['checks', 'ok', 'ts'])
    })

    it('marca la hora del propio chequeo, no la del despliegue', async () => {
      const t = new Date('2026-07-24T15:00:00.000Z')
      const health = await runPortalHealth(t)
      expect(health.ts).toBe('2026-07-24T15:00:00.000Z')
    })

    it('detecta un esquema del portal roto, que es su razón de existir', async () => {
      // Simula el fallo real que motivó el chequeo: el sitio responde pero una
      // tabla del portal desapareció (migración a medias, rename mal aplicado).
      // Un monitor apuntando a /portal/login seguiría en verde aquí.
      await db.run(sql`alter table portal_sessions rename to portal_sessions_off`)
      try {
        const health = await runPortalHealth()
        expect(health.ok).toBe(false)
        expect(health.checks.session_lookup.ok).toBe(false)
        expect(health.checks.session_lookup.error).toBeTruthy()
        // La base en sí sigue viva: el chequeo distingue "no hay base" de
        // "la base está, pero el portal no puede operar sobre ella".
        expect(health.checks.db.ok).toBe(true)
      } finally {
        await db.run(sql`alter table portal_sessions_off rename to portal_sessions`)
      }
    })
  })
})
