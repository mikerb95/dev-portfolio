import type { APIRoute } from 'astro'
import { db } from '../../../../../db'
import { projectServices } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'
import { extractDomain, fetchDomainExpiry } from '../../../../../lib/domains'

// Consulta la fecha de expiración real del dominio vía RDAP y la guarda en renewalDate.
// El middleware ya exige sesión válida en /api/admin/*.
export const POST: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!id) return new Response(JSON.stringify({ error: 'id inválido' }), { status: 400 })

  const row = await db
    .select({ name: projectServices.name, url: projectServices.url, category: projectServices.category })
    .from(projectServices)
    .where(eq(projectServices.id, id))
    .get()

  if (!row) return new Response(JSON.stringify({ error: 'no encontrado' }), { status: 404 })

  const domain = extractDomain(row.url) ?? extractDomain(row.name)
  if (!domain) {
    return new Response(JSON.stringify({ error: 'No se pudo derivar un dominio de la URL o el nombre.' }), { status: 422 })
  }

  const expiry = await fetchDomainExpiry(domain)
  if (!expiry) {
    return new Response(
      JSON.stringify({ error: `RDAP no devolvió fecha para "${domain}" (TLD sin RDAP o dominio no encontrado).`, domain }),
      { status: 422 },
    )
  }

  await db.update(projectServices).set({ renewalDate: expiry, updatedAt: new Date() }).where(eq(projectServices.id, id))
  return new Response(JSON.stringify({ ok: true, domain, renewalDate: expiry.toISOString() }), { status: 200 })
}
