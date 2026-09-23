import type { APIRoute } from 'astro'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../../db'
import { computeBatches, computeTerms, computeUsageHourly, projects } from '../../../db/schema'
import { decrypt } from '../../../lib/crypto'
import { isUniqueViolation } from '../../../lib/db-unique'
import { recordSecurityEvent } from '../../../lib/security/events'
import { validarLote } from '../../../lib/computo/lote'
import { verificarLote } from '../../../lib/computo/firma'

export const prerender = false

// Ingesta de telemetría de cómputo desde los proyectos de cliente. Cada
// proyecto despliega el medidor de `instrumentacion/medidor.ts` y le pega aquí
// con lotes firmados por HMAC. Ver `docs/plan-computo-clientes.md`.
//
// Este endpoint NO es fail-open, y es la excepción consciente a la regla del
// repo: si la firma no valida o el proyecto no existe, se rechaza. La razón es
// que lo que escribe termina en la factura de una empresa. Dejar pasar un lote
// dudoso "por si acaso" es cobrarle de más a alguien, y ese error se descubre
// tarde y mal. Lo que sí es fail-open es el registro en el micro-SIEM.
//
// El límite de tamaño es previo a leer el cuerpo: sin él, un lote de 50 MB
// pasaría por el parser antes de descubrir que la firma no valida.
const MAX_BYTES = 256 * 1024

const problema = (status: number, motivo: string) =>
  new Response(JSON.stringify({ error: motivo }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const slug = request.headers.get('x-computo-project')?.slice(0, 128) ?? ''
  if (!slug) return problema(400, 'proyecto ausente')

  const declarado = request.headers.get('content-length')
  if (declarado && Number(declarado) > MAX_BYTES) return problema(413, 'lote demasiado grande')

  const cuerpoCrudo = await request.text()
  if (cuerpoCrudo.length > MAX_BYTES) return problema(413, 'lote demasiado grande')

  // Términos y proyecto en una consulta: el secreto vive en compute_terms y el
  // id del proyecto en projects, y hacen falta los dos antes de validar nada.
  const fila = (
    await db
      .select({
        projectId: projects.id,
        secreto: computeTerms.ingestSecret,
        activo: computeTerms.active,
      })
      .from(projects)
      .innerJoin(computeTerms, eq(computeTerms.projectId, projects.id))
      .where(eq(projects.slug, slug))
      .limit(1)
  )[0]

  // Mismo 401 para proyecto inexistente, medición desactivada y secreto sin
  // configurar: distinguirlos le diría a un curioso qué slugs existen.
  if (!fila?.secreto || !fila.activo) {
    void registrarRechazo(clientAddress, slug, 'proyecto_desconocido')
    return problema(401, 'no autorizado')
  }

  let secreto: string
  try {
    secreto = decrypt(fila.secreto)
  } catch {
    // ENCRYPTION_KEY ausente o rotada: es un fallo de configuración del
    // servidor, no del cliente que envía. 503 para que el instrumentador
    // reintente en vez de descartar el lote como haría con un 4xx.
    console.error('[computo/ingest] no se pudo descifrar el secreto de', slug)
    return problema(503, 'ingesta no disponible')
  }

  const verificacion = verificarLote(
    request.headers.get('x-computo-timestamp'),
    request.headers.get('x-computo-signature'),
    cuerpoCrudo,
    secreto,
    Date.now(),
  )
  if (verificacion !== 'ok') {
    void registrarRechazo(clientAddress, slug, verificacion)
    return problema(401, 'no autorizado')
  }

  let parseado: unknown
  try {
    parseado = JSON.parse(cuerpoCrudo)
  } catch {
    return problema(400, 'json_invalido')
  }

  const validacion = validarLote(parseado, Date.now())
  if (!validacion.ok) return problema(400, validacion.motivo)
  const { batchId, muestras } = validacion.lote

  // Marca de lote y horas en UN solo batch, que libSQL aplica como una
  // transacción: o entra todo o no entra nada. Con dos pasos sueltos, una
  // caída entre la marca y las horas dejaba el lote marcado sin su consumo, y
  // el reintento del medidor recibía "duplicado" y lo daba por entregado.
  const ahora = new Date()
  const marca = db.insert(computeBatches).values({
    id: `${fila.projectId}:${batchId}`,
    projectId: fila.projectId,
    receivedAt: ahora,
  })
  const horas = muestras.map((m) =>
    db
      .insert(computeUsageHourly)
      .values({
        projectId: fila.projectId,
        hour: new Date(m.hora),
        cpuMs: m.cpuMs,
        gbMs: m.gbMs,
        invocations: m.invocaciones,
        transferBytes: m.transferBytes,
        originTransferBytes: m.originTransferBytes,
        edgeRequests: m.edgeRequests,
        updatedAt: ahora,
      })
      // SUMA en vez de reemplazar: varios procesos Fluid del mismo proyecto
      // reportan la misma hora, y cada uno solo conoce su propio trozo.
      .onConflictDoUpdate({
        target: [computeUsageHourly.projectId, computeUsageHourly.hour],
        set: {
          cpuMs: sql`${computeUsageHourly.cpuMs} + ${m.cpuMs}`,
          gbMs: sql`${computeUsageHourly.gbMs} + ${m.gbMs}`,
          invocations: sql`${computeUsageHourly.invocations} + ${m.invocaciones}`,
          transferBytes: sql`${computeUsageHourly.transferBytes} + ${m.transferBytes}`,
          originTransferBytes: sql`${computeUsageHourly.originTransferBytes} + ${m.originTransferBytes}`,
          edgeRequests: sql`${computeUsageHourly.edgeRequests} + ${m.edgeRequests}`,
          updatedAt: ahora,
        },
      }),
  )

  try {
    await db.batch([marca, ...horas])
  } catch (err) {
    // El único UNIQUE que puede chocar es el de la marca (las horas son
    // UPSERT): el lote ya se aplicó. 200 y no 409, porque para el medidor el
    // lote SÍ está entregado, y un 4xx lo descartaría con un error en consola.
    if (isUniqueViolation(err)) {
      return new Response(JSON.stringify({ ok: true, duplicado: true, horas: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }
    // Cualquier otro fallo revirtió el batch entero: 503 para que el medidor
    // reintente el mismo lote, que esta vez no chocará con ninguna marca.
    console.error('[computo/ingest] no se pudo aplicar el lote de', slug, err)
    return problema(503, 'ingesta no disponible')
  }

  return new Response(JSON.stringify({ ok: true, horas: muestras.length }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/** Fire-and-forget al micro-SIEM: un endpoint público que firma merece rastro. */
function registrarRechazo(ip: string | undefined, slug: string, motivo: string) {
  return recordSecurityEvent({
    classification: { category: 'api_abuse', severity: 'medium', ruleId: `computo_ingest_${motivo}` },
    ip,
    method: 'POST',
    path: '/api/computo/ingest',
    query: `p=${slug}`,
    statusCode: 401,
    action: 'logged',
  })
}
