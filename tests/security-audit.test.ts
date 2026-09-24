import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// BD libsql local (archivo temporal) con las migraciones reales aplicadas: lo
// que se prueba aquí es qué llega a la tabla y qué se lee de ella, y un mock
// no demostraría ni el filtro de las páginas públicas ni cuándo falla una
// lectura frente a una escritura.
vi.mock('../src/db', async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schema = await import('../src/db/schema')
  const file = join(tmpdir(), `auditoria-test-${process.pid}-${Date.now()}.db`)
  const client = createClient({ url: `file:${file}` })
  return { db: drizzle(client, { schema }), __client: client }
})

// El push es un efecto externo: no se dispara en tests.
vi.mock('../src/lib/notify', () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }))

import { AUDIT_CATEGORIES, isAuditCategory } from '../src/lib/security/audit'
import { recordAdminEvent, recordSecurityEvent, _resetDedupe } from '../src/lib/security/events'
import { recordSession } from '../src/lib/device-sessions'
import { leerPulso } from '../src/lib/pulso-publico'
import { sendPush } from '../src/lib/notify'

type Fila = Record<string, unknown>
let client: { execute: (sql: string) => Promise<{ rows: Fila[] }> }

beforeAll(async () => {
  const mod = (await import('../src/db')) as unknown as { db: unknown; __client: typeof client }
  client = mod.__client
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  const { join } = await import('node:path')
  await migrate(mod.db as Parameters<typeof migrate>[0], { migrationsFolder: join(__dirname, '..', 'drizzle') })
})

beforeEach(async () => {
  await client.execute('DELETE FROM security_events')
  await client.execute('DELETE FROM admin_sessions')
  _resetDedupe()
  vi.clearAllMocks()
})

const eventos = async () =>
  (await client.execute('SELECT category, rule_id, ip, path, query FROM security_events ORDER BY id')).rows

describe('qué es auditoría y qué es amenaza', () => {
  it('las acciones del panel y el rastro de clientes y alumnos son auditoría', () => {
    for (const c of ['admin_action', 'cobro', 'cuenta_cobro', 'computo', 'capacitacion']) {
      expect(isAuditCategory(c), c).toBe(true)
    }
  })

  it('lo que sondea un atacante no lo es, tampoco los fallos de login', () => {
    for (const c of ['recon_cms', 'injection', 'honeypot', 'auth_probing', 'enumeration', 'blocklist']) {
      expect(isAuditCategory(c), c).toBe(false)
    }
  })
})

describe('recordAdminEvent', () => {
  it('deja rastro con la IP, la ruta y la query de quien hizo la acción', async () => {
    const request = new Request('https://codebymike.net/api/admin/projects/7/envvars?id=3', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'test' },
    })
    await recordAdminEvent(request, 'envvar.revealed', { severity: 'medium' })
    expect(await eventos()).toEqual([
      { category: 'admin_action', rule_id: 'envvar.revealed', ip: '203.0.113.9', path: '/api/admin/projects/7/envvars', query: 'id=3' },
    ])
  })
})

describe('la vitrina pública no cuenta la auditoría', () => {
  it('el pulso de la portada suma solo amenazas', async () => {
    await recordSecurityEvent({
      ip: '198.51.100.1',
      classification: { category: 'recon_cms', severity: 'medium', ruleId: 'recon.wp' },
      path: '/wp-login.php',
    })
    // Mi entrada al panel y un cliente consultando sus pagos: no son ataques,
    // y contarlos habría publicado cuándo uso el panel.
    await recordSecurityEvent({
      ip: '203.0.113.9',
      classification: { category: 'admin_action', severity: 'low', ruleId: 'admin.login' },
      path: '/admin#@mikerb95',
    })
    await recordSecurityEvent({
      ip: '192.0.2.4',
      classification: { category: 'cobro', severity: 'low', ruleId: 'mispagos.lookup' },
      path: '/api/mis-pagos/lookup',
    })
    const pulso = await leerPulso()
    expect(pulso.eventos).toBe(1)
  })
})

describe('recordSession: solo lanza si no puede LEER la sesión', () => {
  const sesion = { id: 'sid-1', login: 'mikerb95', userAgent: 'test', ip: '203.0.113.9' }

  it('un login nuevo avisa al teléfono y queda en el micro-SIEM', async () => {
    expect(await recordSession(sesion)).toEqual({ revoked: false })
    expect(sendPush).toHaveBeenCalledOnce()
    expect(await eventos()).toEqual([
      { category: 'admin_action', rule_id: 'admin.login', ip: '203.0.113.9', path: '/admin#@mikerb95', query: null },
    ])
  })

  it('una sesión revocada se reconoce como tal', async () => {
    await recordSession(sesion)
    await client.execute(`UPDATE admin_sessions SET revoked_at = ${Math.floor(Date.now() / 1000)} WHERE id = 'sid-1'`)
    expect(await recordSession(sesion)).toEqual({ revoked: true })
  })

  it('si no se puede leer, lanza: el middleware cierra el panel', async () => {
    await client.execute('ALTER TABLE admin_sessions RENAME TO admin_sessions_fuera')
    try {
      await expect(recordSession(sesion)).rejects.toThrow()
    } finally {
      await client.execute('ALTER TABLE admin_sessions_fuera RENAME TO admin_sessions')
    }
  })

  it('si solo fallan las escrituras, no lanza ni avisa en bucle', async () => {
    // Cuota de escrituras agotada: las lecturas siguen funcionando, y la
    // revocación se puede comprobar igual.
    await client.execute(`CREATE TRIGGER sin_altas BEFORE INSERT ON admin_sessions BEGIN SELECT RAISE(ABORT, 'cuota'); END`)
    await client.execute(`CREATE TRIGGER sin_cambios BEFORE UPDATE ON admin_sessions BEGIN SELECT RAISE(ABORT, 'cuota'); END`)
    try {
      expect(await recordSession(sesion)).toEqual({ revoked: false })
      // Sin fila no hay aviso: el siguiente request reintenta el alta.
      expect(sendPush).not.toHaveBeenCalled()
    } finally {
      await client.execute('DROP TRIGGER sin_altas')
      await client.execute('DROP TRIGGER sin_cambios')
    }
  })

  it('una sesión existente con la última actividad sin poder anotarse sigue entrando', async () => {
    const hace = Math.floor(Date.now() / 1000) - 10 * 60 // pasado el throttle de escritura
    await client.execute(
      `INSERT INTO admin_sessions (id, login, user_agent, ip, first_seen, last_seen) VALUES ('sid-1', 'mikerb95', 'test', '203.0.113.9', ${hace}, ${hace})`
    )
    await client.execute(`CREATE TRIGGER sin_cambios BEFORE UPDATE ON admin_sessions BEGIN SELECT RAISE(ABORT, 'cuota'); END`)
    try {
      expect(await recordSession(sesion)).toEqual({ revoked: false })
    } finally {
      await client.execute('DROP TRIGGER sin_cambios')
    }
  })
})

it('AUDIT_CATEGORIES no se vacía por accidente', () => {
  // Si quedara vacía, `notInArray` no filtraría nada y la vitrina volvería a
  // publicar el rastro del panel sin que ningún otro test lo notara.
  expect(AUDIT_CATEGORIES.length).toBeGreaterThan(0)
})
