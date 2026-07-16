// Siembra la base local de verificación: migraciones + un cliente con portal.
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { scrypt as scryptCb, randomBytes } from 'node:crypto'

const file = process.env.DB_FILE
const client = createClient({ url: `file:${file}` })
const db = drizzle(client)

await migrate(db, { migrationsFolder: './drizzle' })
console.log('migraciones aplicadas')

const hashPassword = (password) =>
  new Promise((resolve, reject) => {
    const salt = randomBytes(16)
    const N = 32768, r = 8, p = 1
    scryptCb(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(`scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`)
    )
  })

const now = Date.now()
const s = (d) => Math.floor(d / 1000)

// Cliente ACME con portal + un rival, para poder probar el aislamiento por HTTP.
await client.execute({
  sql: `insert into clients (id, name, company, email, portal_enabled, created_at) values (1,'ACME','ACME S.A.S.','ana@acme.com',1,?), (2,'RIVAL','RIVAL Ltda.','otro@rival.com',1,?)`,
  args: [s(now), s(now)],
})

await client.execute({
  sql: `insert into projects (id, slug, title, description, tech_stack, status, client_id, start_date, preview_url) values
    (1,'acme-web','Portal de ventas ACME','Plataforma de pedidos B2B con catálogo y facturación.','Astro, TypeScript, Turso','activo',1,?,'https://acme.example.com'),
    (2,'rival-app','App secreta de RIVAL',null,null,'activo',2,?,null)`,
  args: [s(now - 60 * 86400000), s(now)],
})

await client.execute({
  sql: `insert into client_users (id, client_id, email, name, password_hash, role, status, failed_attempts, created_at) values (1,1,'ana@acme.com','Ana Restrepo',?,'owner','active',0,?)`,
  args: [await hashPassword('contrasena123'), s(now)],
})

await client.execute({
  sql: `insert into project_milestones (project_id, title, description, status, due_at, completed_at, visible_to_client, sort_order, created_at) values
    (1,'Descubrimiento y alcance','Entrevistas, requisitos y arquitectura.','completado',?,?,1,0,?),
    (1,'Diseño de interfaz','Sistema de diseño y pantallas clave.','completado',?,?,1,1,?),
    (1,'Catálogo y pedidos','Desarrollo del núcleo transaccional.','en_curso',?,null,1,2,?),
    (1,'Pasarela de pagos','Integración con Wompi y conciliación.','pendiente',?,null,1,3,?),
    (1,'Nota interna de margen',null,'pendiente',null,null,0,4,?)`,
  args: [
    s(now - 50 * 86400000), s(now - 52 * 86400000), s(now),
    s(now - 20 * 86400000), s(now - 22 * 86400000), s(now),
    s(now + 10 * 86400000), s(now),
    s(now + 30 * 86400000), s(now),
    s(now),
  ],
})

// Facturas: una pagada, una pendiente, una vencida y un borrador invisible.
await client.execute({
  sql: `insert into invoices (id, client_id, project_id, number, status, currency, subtotal_cents, tax_cents, total_cents, issued_at, due_at, paid_at, notes, created_at) values
    (1,1,1,'INV-2026-001','paid','COP',450000000,0,450000000,?,?,?,'Anticipo del 30%.',?),
    (2,1,1,'INV-2026-002','sent','COP',320000000,60800000,380800000,?,?,null,'Segundo hito. Pago a 15 días.',?),
    (3,1,1,'INV-2026-003','overdue','COP',80000000,15200000,95200000,?,?,null,null,?),
    (4,1,1,'INV-2026-004','draft','COP',10000000,0,10000000,null,null,null,'Borrador que el cliente NO debe ver.',?),
    (5,2,2,'INV-2026-005','sent','COP',999999900,0,999999900,?,?,null,'Factura de RIVAL: ACME jamás debe verla.',?)`,
  args: [
    s(now - 55 * 86400000), s(now - 40 * 86400000), s(now - 45 * 86400000), s(now),
    s(now - 5 * 86400000), s(now + 10 * 86400000), s(now),
    s(now - 40 * 86400000), s(now - 12 * 86400000), s(now),
    s(now),
    s(now - 3 * 86400000), s(now + 12 * 86400000), s(now),
  ],
})

await client.execute({
  sql: `insert into invoice_items (invoice_id, description, quantity, unit_cents, total_cents, sort_order) values
    (1,'Anticipo de proyecto (30%)',1,450000000,450000000,0),
    (2,'Desarrollo de catálogo',80,3000000,240000000,0),
    (2,'Integración de inventario',20,4000000,80000000,1),
    (3,'Horas de soporte adicional',20,4000000,80000000,0),
    (5,'Trabajo confidencial de RIVAL',1,999999900,999999900,0)`,
})

// Hilo de RIVAL: para probar por HTTP que ACME no puede abrirlo.
await client.execute({
  sql: `insert into portal_threads (id, client_id, project_id, subject, status, last_message_at, created_at) values (1,2,2,'Secreto de RIVAL','open',?,?)`,
  args: [s(now), s(now)],
})
await client.execute({
  sql: `insert into portal_messages (thread_id, author_type, author_name, body, created_at) values (1,'admin','Mike','Contenido confidencial de RIVAL',?)`,
  args: [s(now)],
})

// Monitor del proyecto de ACME con historial, para que la tarjeta de salud
// muestre datos reales y no un placeholder.
await client.execute({
  sql: `insert into monitors (id, project_id, name, url, method, expected_status, active, paused, last_status, last_checked_at, last_response_ms, created_at) values (1,1,'ACME · web','https://acme.example.com','GET',200,1,0,'up',?,143,?)`,
  args: [s(now - 120000), s(now)],
})

const checks = []
for (let i = 0; i < 300; i++) {
  const at = s(now - i * 3600000)
  const ok = i % 97 === 0 ? 0 : 1 // ~1% de caídas: uptime realista, no un 100% de folleto
  checks.push(`(1, ${at}, ${ok}, ${ok ? 200 : 503}, ${100 + (i % 90)}, ${ok ? 'null' : "'timeout'"})`)
}
await client.execute(
  `insert into monitor_checks (monitor_id, at, ok, status_code, response_ms, error) values ${checks.join(',')}`
)

console.log('datos sembrados: ACME (id 1) y RIVAL (id 2)')
console.log('login: ana@acme.com / contrasena123')
