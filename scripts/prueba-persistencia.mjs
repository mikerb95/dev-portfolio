// Prueba de persistencia para el taller de Docker del SENA (figura 13).
//
// Escribe una fila en la base libSQL del contenedor, y despues del reinicio la
// vuelve a leer. Es el equivalente del "registrar un usuario, jugar y
// comprobar que el record sigue ahi" que pide la guia.
//
//   node scripts/prueba-persistencia.mjs escribir
//   docker compose restart libsql-main
//   node scripts/prueba-persistencia.mjs leer
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL ?? 'http://127.0.0.1:8080'
const accion = process.argv[2]
const cliente = createClient({ url })

if (accion === 'escribir') {
  await cliente.execute(
    'CREATE TABLE IF NOT EXISTS prueba_sena (id INTEGER PRIMARY KEY, nota TEXT, creado TEXT)'
  )
  await cliente.execute({
    sql: 'INSERT INTO prueba_sena (nota, creado) VALUES (?, ?)',
    args: ['antes del reinicio', new Date().toISOString()],
  })
  const r = await cliente.execute('SELECT count(*) AS n FROM prueba_sena')
  console.log(`escrito. filas en la tabla: ${r.rows[0].n}`)
} else if (accion === 'leer') {
  const r = await cliente.execute(
    'SELECT count(*) AS n, max(nota) AS nota, max(creado) AS creado FROM prueba_sena'
  )
  const { n, nota, creado } = r.rows[0]
  console.log(`filas: ${n} | ultima nota: "${nota}" | escrita: ${creado}`)
} else {
  console.log('uso: node scripts/prueba-persistencia.mjs escribir|leer')
  process.exit(1)
}
