import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projectServices } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'
import { decryptJson } from '../../../../../lib/crypto'

// Revela las credenciales cifradas de un servicio bajo demanda.
// El middleware ya exige sesión válida en /api/admin/*.
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!id) return new Response(JSON.stringify({ error: 'id inválido' }), { status: 400 })

  const row = await db
    .select({ secrets: projectServices.secrets })
    .from(projectServices)
    .where(eq(projectServices.id, id))
    .get()

  if (!row) return new Response(JSON.stringify({ error: 'no encontrado' }), { status: 404 })
  if (!row.secrets) return new Response(JSON.stringify({ secrets: {} }), { status: 200 })

  try {
    return new Response(JSON.stringify({ secrets: decryptJson(row.secrets) }), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('ENCRYPTION_KEY')
      ? 'Falta configurar ENCRYPTION_KEY (hex de 32 bytes) para descifrar.'
      : 'No se pudo descifrar.'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
