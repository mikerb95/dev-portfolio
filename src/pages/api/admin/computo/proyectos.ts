import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { computeTerms, projects } from '../../../../db/schema'
import { encrypt } from '../../../../lib/crypto'
import { nuevoSecretoIngest } from '../../../../lib/computo/firma'
import { recordSecurityEvent } from '../../../../lib/security/events'
import { clientIp } from '../../../../lib/ratelimit'

// Alta de proyectos medidos: el secreto con el que el medidor de cada
// proyecto firma sus lotes. La sesión admin la exige el middleware (/api/admin).

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await request.json()
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const idDe = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Genera el secreto de un proyecto, o lo rota si ya tenía uno.
 *
 * El secreto en claro solo existe en esta respuesta: se guarda cifrado y no
 * hay endpoint que lo revele después. Perderlo se arregla rotando, que es más
 * seguro que poder leerlo otra vez. Rotar invalida el anterior al instante, y
 * el medidor descarta los lotes que la ingesta le rechace hasta que el
 * proyecto se redespliegue con el nuevo.
 */
export const POST: APIRoute = async ({ request }) => {
  const projectId = idDe((await leerCuerpo(request))?.projectId)
  if (!projectId) return json(400, { error: 'proyecto inválido' })

  const [proyecto] = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!proyecto) return json(404, { error: 'proyecto no encontrado' })

  const secreto = nuevoSecretoIngest()
  let cifrado: string
  try {
    cifrado = encrypt(secreto)
  } catch {
    // Sin ENCRYPTION_KEY no se guarda nada: un secreto en claro en la base
    // sería peor que no poder medir.
    return json(503, { error: 'el servidor no tiene ENCRYPTION_KEY' })
  }

  const [previo] = await db
    .select({ id: computeTerms.id })
    .from(computeTerms)
    .where(eq(computeTerms.projectId, projectId))
    .limit(1)
  const ahora = new Date()
  await db
    .insert(computeTerms)
    .values({ projectId, ingestSecret: cifrado, active: true, createdAt: ahora, updatedAt: ahora })
    .onConflictDoUpdate({ target: computeTerms.projectId, set: { ingestSecret: cifrado, active: true, updatedAt: ahora } })

  void recordSecurityEvent({
    classification: { category: 'computo', severity: 'low', ruleId: previo ? 'computo.secreto_rotado' : 'computo.secreto_emitido' },
    ip: clientIp(request),
    method: 'POST',
    path: '/api/admin/computo/proyectos',
    query: `p=${proyecto.slug}`,
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    asn: request.headers.get('x-vercel-ip-as-number'),
    statusCode: 201,
    action: 'logged',
  })

  return json(201, { slug: proyecto.slug, secreto, rotado: Boolean(previo) })
}

/** Pausa o reanuda la medición de un proyecto sin tocar su secreto. */
export const PATCH: APIRoute = async ({ request }) => {
  const cuerpo = await leerCuerpo(request)
  const projectId = idDe(cuerpo?.projectId)
  if (!projectId || typeof cuerpo?.activo !== 'boolean') return json(400, { error: 'se espera { projectId, activo }' })

  const filas = await db
    .update(computeTerms)
    .set({ active: cuerpo.activo, updatedAt: new Date() })
    .where(eq(computeTerms.projectId, projectId))
    .returning({ id: computeTerms.id })
  if (filas.length === 0) return json(404, { error: 'ese proyecto no se está midiendo' })
  return json(200, { ok: true, activo: cuerpo.activo })
}
