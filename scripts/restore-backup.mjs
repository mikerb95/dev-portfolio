#!/usr/bin/env node
/**
 * Restaura las tablas de negocio en una base vacía, desde el JSON que produce
 * `src/lib/backup.ts` (cron diario → Vercel Blob).
 *
 *   node --experimental-strip-types scripts/restore-backup.mjs \
 *     --origen=https://<blob>.public.blob.vercel-storage.com/backups/portfolio-2026-08-14-....json \
 *     --destino=libsql://nueva-base.turso.io --token=...
 *
 *   node --experimental-strip-types scripts/restore-backup.mjs \
 *     --origen=./backup.json --destino=file:/tmp/prueba.db
 *
 * Opciones: --dry-run (lee y valida el backup sin escribir nada)
 *
 * QUÉ RESTAURA
 * Exactamente las 10 tablas que vuelca el backup: clientes, proyectos,
 * mensajes, finanzas, variables de entorno, servicios, contactos, ADRs, hitos
 * de formación y briefings. Es lo irremplazable.
 *
 * QUÉ NO RESTAURA, Y POR QUÉ NO PASA NADA
 *   - Historial de monitoreo → scripts/seed-monitor-history.mjs lo regenera.
 *   - security_events → se repuebla solo con el tráfico real en horas.
 *   - Sesiones (admin y portal) → son efímeras por diseño; se rehacen al entrar.
 *
 * Usa el schema de Drizzle en vez de INSERTs escritos a mano: así el mapeo de
 * columnas sale de la fuente de verdad y una columna añadida en una migración
 * futura no deja este script restaurando datos incompletos en silencio.
 *
 * NO es idempotente por diseño: se niega a correr sobre una tabla que ya tiene
 * filas, salvo --forzar. Restaurar dos veces sobre datos existentes duplicaría
 * clientes y proyectos, y con claves foráneas de por medio eso es peor que no
 * restaurar.
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import {
  clients,
  projects,
  messages,
  finances,
  projectEnvVars,
  projectServices,
  projectContacts,
  projectAdrs,
  educationMilestones,
  briefings,
} from '../src/db/schema.ts'

const args = process.argv.slice(2)
const opcion = (nombre) => {
  const encontrado = args.find((a) => a.startsWith(`--${nombre}=`))
  return encontrado ? encontrado.slice(nombre.length + 3) : null
}
const DRY_RUN = args.includes('--dry-run')
const FORZAR = args.includes('--forzar')

const origen = opcion('origen')
const destino = opcion('destino')
const token = opcion('token') || process.env.TURSO_AUTH_TOKEN

if (!origen || (!destino && !DRY_RUN)) {
  console.error(
    'Uso:\n' +
      '  node --experimental-strip-types scripts/restore-backup.mjs \\\n' +
      '    --origen=<url del blob o ruta local> --destino=<url libsql> [--token=...] [--dry-run] [--forzar]',
  )
  process.exit(1)
}

// El orden importa: las claves foráneas exigen que el padre exista antes que el
// hijo. clients → projects → todo lo que cuelga de un proyecto.
const ORDEN = [
  ['clients', clients],
  ['projects', projects],
  ['messages', messages],
  ['finances', finances],
  ['projectEnvVars', projectEnvVars],
  ['projectServices', projectServices],
  ['projectContacts', projectContacts],
  ['projectAdrs', projectAdrs],
  ['educationMilestones', educationMilestones],
  ['briefings', briefings],
]

/**
 * El backup serializa las fechas como ISO (JSON no tiene tipo fecha), pero
 * Drizzle espera objetos Date para las columnas `timestamp`. Sin esta vuelta,
 * las fechas se escribirían como texto en una columna entera y toda ordenación
 * por fecha quedaría rota, en silencio y solo visible semanas después.
 */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

function revivirFechas(fila) {
  const out = {}
  for (const [k, v] of Object.entries(fila)) {
    out[k] = typeof v === 'string' && ISO.test(v) ? new Date(v) : v
  }
  return out
}

async function leerBackup(origen) {
  if (/^https?:\/\//.test(origen)) {
    const res = await fetch(origen)
    if (!res.ok) throw new Error(`El origen respondió ${res.status}`)
    return res.json()
  }
  return JSON.parse(readFileSync(origen, 'utf8'))
}

async function main() {
  const dump = await leerBackup(origen)

  if (!dump || typeof dump !== 'object' || !dump.meta) {
    throw new Error('El JSON no tiene la forma de un backup (falta `meta`).')
  }

  console.log(`Backup del ${dump.meta.createdAt} (versión ${dump.meta.version})`)
  let totalFilas = 0
  for (const [nombre] of ORDEN) {
    const n = Array.isArray(dump[nombre]) ? dump[nombre].length : 0
    totalFilas += n
    console.log(`  ${nombre.padEnd(22)} ${String(n).padStart(5)} filas`)
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(totalFilas).padStart(5)} filas`)

  if (DRY_RUN) {
    console.log('\n--dry-run: backup válido, no se escribió nada.')
    return
  }

  const cliente = createClient({ url: destino, authToken: token })
  const db = drizzle(cliente)

  // Salvaguarda: restaurar sobre datos existentes duplica clientes y proyectos.
  if (!FORZAR) {
    for (const [nombre, tabla] of ORDEN) {
      const [{ n }] = await db.select({ n: sql`count(*)` }).from(tabla)
      if (Number(n) > 0) {
        console.error(
          `\nLa tabla \`${nombre}\` ya tiene ${n} filas en el destino.\n` +
            'Restaurar encima duplicaría los datos. Si el destino es una base\n' +
            'nueva y vacía, revisa que apuntas a la correcta; si de verdad\n' +
            'quieres escribir igual, repite con --forzar.',
        )
        process.exit(1)
      }
    }
  }

  for (const [nombre, tabla] of ORDEN) {
    const filas = Array.isArray(dump[nombre]) ? dump[nombre] : []
    if (filas.length === 0) continue
    // En lotes: un insert único de miles de filas revienta el límite de
    // variables por sentencia de SQLite.
    for (let i = 0; i < filas.length; i += 50) {
      await db.insert(tabla).values(filas.slice(i, i + 50).map(revivirFechas))
    }
    console.log(`  restauradas ${filas.length} filas en ${nombre}`)
  }

  console.log(`\nListo. ${totalFilas} filas restauradas.`)
  console.log('Siguiente: node --experimental-strip-types scripts/seed-monitor-history.mjs')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falló la restauración:', err.message)
    process.exit(1)
  })
