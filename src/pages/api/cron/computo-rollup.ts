import type { APIRoute } from 'astro'
import { getSession } from 'auth-astro/server'
import { isAllowedLogin } from '../../../lib/auth'
import { cronSecretOk } from '../../../lib/cron-auth'
import { conRegistro } from '../../../lib/cron-runs'
import { limpiarLotes, recalcularPeriodo } from '../../../lib/computo/store'
import { esClaveValida, ultimosPeriodos } from '../../../lib/computo/periodo'

export const prerender = false

// Consolidación del consumo de cómputo en periodos facturables.
//
// Corre a diario y recalcula DOS periodos: el actual y el anterior. El anterior
// no es redundante durante los primeros días del mes, que es cuando siguen
// llegando lotes con horas del mes que acaba de cerrar (un proceso Fluid que se
// apagó con muestras en memoria, un reintento tras una caída de red). Un cierre
// que solo mirara el mes en curso dejaría ese consumo sin facturar.
//
// Es idempotente: parte siempre de las filas horarias, nunca de lo ya escrito.

const PERIODOS_POR_DEFECTO = 2
const PERIODOS_MAX = 24

function pedirPeriodos(url: URL): string[] {
  const explicito = url.searchParams.get('periodo')
  // Un periodo suelto permite reabrir un mes viejo tras cargar su factura real
  // sin recalcular todo el histórico.
  if (explicito && esClaveValida(explicito)) return [explicito]
  const crudo = Number(url.searchParams.get('meses'))
  const meses = Number.isFinite(crudo) && crudo >= 1 ? Math.min(Math.floor(crudo), PERIODOS_MAX) : PERIODOS_POR_DEFECTO
  return ultimosPeriodos(Date.now(), meses)
}

async function correr(url: URL) {
  const resultados = []
  for (const clave of pedirPeriodos(url)) {
    resultados.push(await recalcularPeriodo(clave))
  }
  await limpiarLotes(Date.now())
  return { periodos: resultados }
}

export const GET: APIRoute = conRegistro('computo-rollup', async ({ request, url }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await correr(url)), { status: 200 })
  } catch (err) {
    console.error('[computo-rollup]', err)
    return new Response(JSON.stringify({ error: 'rollup fallido' }), { status: 500 })
  }
})

// Disparo manual desde el panel, mismo patrón que monitor-rollup: es la vía
// para recalcular un mes concreto tras cargar su factura real de Vercel.
export const PUT: APIRoute = async ({ request, url }) => {
  const session = await getSession(request)
  const login = (session?.user as { login?: string } | undefined)?.login
  if (!session || (login && !isAllowedLogin(login))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }
  try {
    return new Response(JSON.stringify(await correr(url)), { status: 200 })
  } catch (err) {
    console.error('[computo-rollup]', err)
    return new Response(JSON.stringify({ error: 'rollup fallido' }), { status: 500 })
  }
}
