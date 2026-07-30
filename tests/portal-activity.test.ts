import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// libSQL en archivo temporal con el esquema real. El feed se prueba contra SQL
// de verdad porque lo que importa —que el WHERE lleve el clientId, que el
// cursor no repita ni salte filas— es justo lo que un mock daría por bueno.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `portal-activity-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

import { migrate } from 'drizzle-orm/libsql/migrator'
import { db } from '../src/db'
import { clients, projects, portalActivity } from '../src/db/schema'
import { recordActivity, clientActivity, lastActivityAt } from '../src/lib/portal/activity'

let acme: number
let rival: number
let acmeProject: number
let acmeOtro: number
let rivalProject: number

const now = new Date('2026-07-30T12:00:00.000Z')
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000)

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  await db.delete(portalActivity)
  await db.delete(projects)
  await db.delete(clients)

  const [a] = await db.insert(clients).values({ name: 'ACME', createdAt: now }).returning({ id: clients.id })
  const [r] = await db.insert(clients).values({ name: 'RIVAL', createdAt: now }).returning({ id: clients.id })
  acme = a.id
  rival = r.id

  const [ap] = await db
    .insert(projects)
    .values({ slug: 'acme-web', title: 'Web de ACME', clientId: acme })
    .returning({ id: projects.id })
  const [ao] = await db
    .insert(projects)
    .values({ slug: 'acme-app', title: 'App de ACME', clientId: acme })
    .returning({ id: projects.id })
  const [rp] = await db
    .insert(projects)
    .values({ slug: 'rival-app', title: 'App de RIVAL', clientId: rival })
    .returning({ id: projects.id })
  acmeProject = ap.id
  acmeOtro = ao.id
  rivalProject = rp.id
})

describe('portal · feed de actividad', () => {
  describe('recordActivity', () => {
    it('registra una entrada visible por defecto', async () => {
      await recordActivity({
        clientId: acme,
        projectId: acmeProject,
        type: 'milestone',
        title: 'Hito completado · Diseño',
        at: now,
      })

      const { items } = await clientActivity(acme)
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('Hito completado · Diseño')
      expect(items[0].visibleToClient).toBe(true)
      expect(items[0].detail).toBeNull()
    })

    it('acepta entradas sin proyecto (facturas, avisos de cuenta)', async () => {
      await recordActivity({ clientId: acme, type: 'invoice', title: 'Factura emitida', at: now })
      const { items } = await clientActivity(acme)
      expect(items[0].projectId).toBeNull()
    })

    it('nunca lanza, ni con datos que la base rechaza', async () => {
      // clientId inexistente viola la FK. El emisor es fire-and-forget: quien
      // llama ya emitió la factura y no puede reventar por el registro.
      await expect(
        recordActivity({ clientId: 999_999, type: 'system', title: 'huérfana', at: now })
      ).resolves.toBeUndefined()
    })
  })

  describe('clientActivity · aislamiento', () => {
    beforeEach(async () => {
      await recordActivity({ clientId: acme, projectId: acmeProject, type: 'milestone', title: 'De ACME', at: minsAgo(10) })
      await recordActivity({ clientId: rival, projectId: rivalProject, type: 'milestone', title: 'De RIVAL', at: minsAgo(1) })
    })

    it('nunca devuelve entradas de otro cliente', async () => {
      const { items } = await clientActivity(acme)
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('De ACME')
    })

    it('un projectId ajeno no saca filas ajenas: el WHERE lleva ambos', async () => {
      // Aunque quien llama fallara al validar el proyecto contra el cliente,
      // el clientId del WHERE deja el resultado vacío en vez de filtrar.
      const { items } = await clientActivity(acme, { projectId: rivalProject })
      expect(items).toHaveLength(0)
    })

    it('oculta lo marcado como no visible', async () => {
      await recordActivity({
        clientId: acme,
        type: 'system',
        title: 'Nota interna',
        visibleToClient: false,
        at: now,
      })
      const { items } = await clientActivity(acme)
      expect(items.map((i) => i.title)).not.toContain('Nota interna')
    })
  })

  describe('clientActivity · filtros y orden', () => {
    beforeEach(async () => {
      await recordActivity({ clientId: acme, projectId: acmeProject, type: 'milestone', title: 'Hito', at: minsAgo(30) })
      await recordActivity({ clientId: acme, projectId: acmeOtro, type: 'document', title: 'Documento', at: minsAgo(20) })
      await recordActivity({ clientId: acme, type: 'invoice', title: 'Factura', at: minsAgo(10) })
    })

    it('ordena de más reciente a más antiguo', async () => {
      const { items } = await clientActivity(acme)
      expect(items.map((i) => i.title)).toEqual(['Factura', 'Documento', 'Hito'])
    })

    it('filtra por tipo', async () => {
      const { items } = await clientActivity(acme, { type: 'document' })
      expect(items.map((i) => i.title)).toEqual(['Documento'])
    })

    it('filtra por proyecto sin arrastrar los de otro proyecto del mismo cliente', async () => {
      const { items } = await clientActivity(acme, { projectId: acmeProject })
      expect(items.map((i) => i.title)).toEqual(['Hito'])
    })
  })

  describe('clientActivity · paginación por cursor', () => {
    beforeEach(async () => {
      // 5 entradas, una por minuto hacia atrás.
      for (let i = 0; i < 5; i++) {
        await recordActivity({ clientId: acme, type: 'system', title: `E${i}`, at: minsAgo(i) })
      }
    })

    it('devuelve el cursor solo mientras queden más', async () => {
      const p1 = await clientActivity(acme, { limit: 2 })
      expect(p1.items.map((i) => i.title)).toEqual(['E0', 'E1'])
      expect(p1.nextCursor).not.toBeNull()

      const p2 = await clientActivity(acme, { limit: 2, cursor: p1.nextCursor })
      expect(p2.items.map((i) => i.title)).toEqual(['E2', 'E3'])

      const p3 = await clientActivity(acme, { limit: 2, cursor: p2.nextCursor })
      expect(p3.items.map((i) => i.title)).toEqual(['E4'])
      // Última página: sin cursor, o el cliente pediría una página vacía de más.
      expect(p3.nextCursor).toBeNull()
    })

    it('recorre las 5 sin repetir ni saltarse ninguna', async () => {
      const vistos: string[] = []
      let cursor: number | null = null
      do {
        const page = await clientActivity(acme, { limit: 2, cursor })
        vistos.push(...page.items.map((i) => i.title))
        cursor = page.nextCursor
      } while (cursor)

      expect(vistos).toEqual(['E0', 'E1', 'E2', 'E3', 'E4'])
      expect(new Set(vistos).size).toBe(5)
    })

    it('el techo de 50 acota lo que un cliente puede pedir de una vez', async () => {
      const { items } = await clientActivity(acme, { limit: 999 })
      expect(items.length).toBeLessThanOrEqual(50)
    })
  })

  describe('lastActivityAt', () => {
    it('es la marca de la entrada visible más reciente', async () => {
      await recordActivity({ clientId: acme, type: 'system', title: 'vieja', at: minsAgo(10) })
      await recordActivity({ clientId: acme, type: 'system', title: 'nueva', at: minsAgo(2) })

      const at = await lastActivityAt(acme)
      expect(at?.toISOString()).toBe(minsAgo(2).toISOString())
    })

    it('ignora lo no visible: si se apaga la última, retrocede', async () => {
      await recordActivity({ clientId: acme, type: 'system', title: 'visible', at: minsAgo(10) })
      await recordActivity({ clientId: acme, type: 'system', title: 'oculta', visibleToClient: false, at: minsAgo(1) })

      const at = await lastActivityAt(acme)
      expect(at?.toISOString()).toBe(minsAgo(10).toISOString())
    })

    it('null cuando el cliente no tiene actividad', async () => {
      expect(await lastActivityAt(acme)).toBeNull()
    })

    it('no se contagia de la actividad de otro cliente', async () => {
      await recordActivity({ clientId: rival, type: 'system', title: 'de RIVAL', at: now })
      expect(await lastActivityAt(acme)).toBeNull()
    })
  })
})
