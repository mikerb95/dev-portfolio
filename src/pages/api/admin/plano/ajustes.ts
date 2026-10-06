import type { APIRoute } from 'astro'
import { recordAdminEvent } from '../../../../lib/security/events'
import { guardarReglas } from '../../../../lib/plano/db'
import { REGLAS_DEFAULT, type ReglasPlano } from '../../../../data/plano'

// Reglas de pago de Plano (tramos, cuotas con recargo, usura, horas). La sesión
// de admin la impone el middleware. Se valida todo con validarReglas antes de
// guardar: unas reglas que no suman 100 % no llegan nunca a una propuesta.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const PUT: APIRoute = async ({ request }) => {
  let data: unknown
  try {
    data = await request.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }
  if (!data || typeof data !== 'object') return json(400, { error: 'JSON inválido' })
  const o = data as Partial<ReglasPlano> & { restaurar?: boolean }
  const reglas: ReglasPlano = o.restaurar
    ? REGLAS_DEFAULT
    : {
        ...REGLAS_DEFAULT,
        ...o,
        cuotas: { ...REGLAS_DEFAULT.cuotas, ...(o.cuotas ?? {}), minimo: { ...REGLAS_DEFAULT.cuotas.minimo, ...(o.cuotas?.minimo ?? {}) } },
        tramos: Array.isArray(o.tramos) ? o.tramos : REGLAS_DEFAULT.tramos,
      }
  const errores = await guardarReglas(reglas)
  if (errores.length) return json(422, { error: 'reglas inválidas', errores })
  await recordAdminEvent(request, 'plano.ajustes')
  return json(200, { ok: true, reglas })
}
