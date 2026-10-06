// Prueba del asistente del dashboard con el MODELO REAL (gasta créditos de la
// API de Claude, unos centavos por pregunta). No corre en la suite: se lanza a
// mano con
//   npx tsx scripts/asistente-prueba-panel.ts
//
// Corre contra la base DEMO (TURSO_DEMO_URL), nunca contra la principal: la
// última pregunta crea una cuenta de cobro, y al final se borra lo que creó la
// prueba (la cuenta y las conversaciones) para dejar la demo como estaba.
// Usa el mismo motor que /api/admin/asistente, sin la transmisión al navegador.

process.loadEnvFile('.env')
// La base se fija ANTES de importar src/db (lee la URL al importarse).
process.env.TURSO_DATABASE_URL = process.env.TURSO_DEMO_URL
process.env.TURSO_AUTH_TOKEN = process.env.TURSO_DEMO_AUTH_TOKEN
if (!process.env.TURSO_DATABASE_URL) throw new Error('Falta TURSO_DEMO_URL: esta prueba no corre contra la base principal.')

const { prepararConversacion, correr, reclamarDecision, continuarDecision } = await import('../src/lib/asistente/motor-api')
const { db } = await import('../src/db')
const { asistenteConversaciones, invoiceItems, invoices } = await import('../src/db/schema')
const { eq, inArray } = await import('drizzle-orm')

type Ev = { tipo: string; [k: string]: any }
const log = (e: Ev) => {
  if (e.tipo === 'paso') console.log(`  · paso: ${e.herramienta} ${JSON.stringify(e.entrada)}`)
  else if (e.tipo === 'texto') console.log(`  > ${e.texto.replace(/\n/g, '\n    ')}`)
  else if (e.tipo === 'aprobacion') console.log(`  ¿Apruebas? ${e.origen}\n    vista: ${JSON.stringify(e.vista)}`)
  else if (e.tipo === 'dato' && e.herramienta === 'crear_cuenta_cobro') console.log(`  ✓ creada: ${JSON.stringify(e.datos)}`)
  else if (e.tipo === 'fin') console.log(`  [fin: ${e.estado}, ${e.iteraciones} pasos, US$${e.costoUsd.toFixed(4)}${e.error ? `, error: ${e.error}` : ''}]`)
}

const PREGUNTAS = [
  '¿Quién me pagó este mes y quién me debe todavía?',
  '¿Qué dominios van a vencer pronto?',
  'Ayúdame a crear una cuenta de cobro para Cafetería Altiplano por $850.000 por el mantenimiento de octubre, que venza el 30 de octubre.',
]

const ids: string[] = []
const numeros: string[] = []
let total = 0
for (const pregunta of PREGUNTAS) {
  console.log(`\n### ${pregunta}`)
  const e = await prepararConversacion(pregunta)
  ids.push(e.id)
  let fin = await correr(e, log)
  total += fin.costoUsd
  if (fin.estado === 'esperando_aprobacion') {
    console.log('  (aprobando…)')
    const reclamada = await reclamarDecision(fin.id)
    if (!reclamada) throw new Error('no se pudo reclamar la propuesta')
    const antes = fin.costoUsd
    fin = await continuarDecision(reclamada, true, (ev) => {
      if (ev.tipo === 'dato' && (ev as any).herramienta === 'crear_cuenta_cobro') numeros.push((ev as any).datos.numero)
      log(ev as Ev)
    })
    total += fin.costoUsd - antes
  }
}

console.log(`\nCosto total aproximado: US$${total.toFixed(4)}`)

// Limpieza: solo lo que creó esta prueba.
if (numeros.length) {
  const creadas = await db.select({ id: invoices.id }).from(invoices).where(inArray(invoices.number, numeros))
  for (const c of creadas) {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, c.id))
    await db.delete(invoices).where(eq(invoices.id, c.id))
  }
  console.log(`Borradas de la demo: ${numeros.join(', ')}`)
}
await db.delete(asistenteConversaciones).where(inArray(asistenteConversaciones.id, ids))
