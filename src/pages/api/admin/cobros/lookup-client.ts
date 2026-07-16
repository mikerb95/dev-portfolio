import type { APIRoute } from 'astro'
import { findClientByPhone } from '../../../../lib/cobros-db'
import { normalizePhone, formatPhone } from '../../../../lib/phone'

// Resuelve el teléfono contra el CRM mientras escribes en /cobrar, para que la
// pantalla muestre a quién le vas a cobrar antes de confirmar.

export const GET: APIRoute = async ({ url }) => {
  const phone = normalizePhone(url.searchParams.get('phone'))
  if (!phone) {
    return new Response(JSON.stringify({ valid: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  const client = await findClientByPhone(phone)
  return new Response(
    JSON.stringify({ valid: true, phone, phoneFormatted: formatPhone(phone), client }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  )
}
