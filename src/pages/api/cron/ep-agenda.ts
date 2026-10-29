import type { APIRoute } from 'astro'
import { cronSecretOk } from '../../../lib/cron-auth'
import { registrarCronRun } from '../../../lib/cron-runs'
import { citasLibres, compararLibres, enBogota, CADA_MIN_FONDO, CONFIG_POR_DEFECTO, type EstadoAgenda } from '../../../lib/ep-agenda'
import { avisarAperturas, consultarBookings, guardarEstado, leerEstado, refrescarConfig, registrarCambios } from '../../../lib/ep-agenda-db'

// Vigía de la agenda del instructor de etapa productiva (ver lib/ep-agenda.ts).
// Lo llaman el job "ep-agenda" de cron-job.org cada 10 min (respaldo) y el
// Worker de Cloudflare (workers/ep-agenda-vigia), que revisa cada minuto por su
// cuenta y solo llama aquí cuando cambian las citas libres. Antes del Worker,
// "ep-agenda-aperturas" llamaba cada minuto en las franjas de apertura. Cada
// llamada consulta a Bookings: no hay llamadas de "este minuto no toca", que
// gastaban CPU activa de la cuota de Vercel sin hacer nada. Las franjas están
// copiadas en `FRANJAS_APERTURA` (lib/ep-agenda.ts), con sus pruebas.
//
// Siempre responde 200 tras la autenticación, aunque Bookings falle: cron-job.org
// deshabilita un job tras 25 fallos seguidos, y a un minuto por llamada eso son
// 25 minutos de Microsoft caído. El fallo queda en cron_runs y en el estado.
//
// No usa `conRegistro`: anotaría una fila por minuto, cuatro veces lo que suman
// todos los demás crons, en una tabla que la portada y /automatizaciones leen
// en cada render. Se anota la consulta de cada múltiplo de 10 (que es la
// cadencia que vigila el detector de silencio), toda consulta con cambios y
// todo fallo.

/**
 * Dos llamadas casi juntas (un reintento de cron-job.org, o los dos jobs si
 * alguien desalinea las franjas) compararían contra el mismo estado y
 * registrarían y avisarían dos veces la misma apertura. Con esto la segunda se
 * retira.
 */
const MIN_ENTRE_CONSULTAS_MS = 30_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const GET: APIRoute = async ({ request }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) return json({ error: 'no autorizado' }, 401)

  const t0 = Date.now()
  const ahora = t0
  const enMarca = enBogota(ahora).minuto % CADA_MIN_FONDO === 0

  let previo: EstadoAgenda | null = null
  try {
    previo = await leerEstado()
  } catch (e) {
    // Sin estado no se puede comparar: consultar igual llevaría a marcar todo
    // lo libre como "previa" y perder la historia. Mejor saltar este minuto.
    console.error('[cron/ep-agenda] estado', e)
    if (enMarca) await registrarCronRun('ep-agenda', false, Date.now() - t0, 'no se pudo leer el estado')
    return json({ ok: false, error: 'estado' })
  }

  if (previo && ahora - previo.revisadoEn < MIN_ENTRE_CONSULTAS_MS) {
    return new Response(null, { status: 204 })
  }

  const config = previo?.config ?? CONFIG_POR_DEFECTO

  const [r, siguiente] = await Promise.all([consultarBookings(config, ahora), refrescarConfig(previo, ahora)])

  if ('error' in r) {
    if (previo) {
      await guardarEstado({ ...previo, error: r.error, config: siguiente.config, configLeidaEn: siguiente.leidaEn }).catch(() => {})
    }
    await registrarCronRun('ep-agenda', false, Date.now() - t0, r.error)
    return json({ ok: false, error: r.error })
  }

  try {
    const libresAhora = citasLibres(r.tramos, config, ahora)
    const { abiertas, cerradas, libres } = compararLibres(previo, libresAhora, ahora, config)

    // Primero la bitácora y después el estado: si la escritura falla, el estado
    // viejo hace que el próximo minuto vuelva a detectar el mismo cambio.
    await registrarCambios(abiertas, cerradas, ahora)

    const estadosVistos = [...new Set([...(previo?.estadosVistos ?? []), ...r.tramos.map((t) => t.status)])].sort()
    await guardarEstado({
      libres,
      inicio: previo?.inicio ?? ahora,
      revisadoEn: ahora,
      config: siguiente.config,
      configLeidaEn: siguiente.leidaEn,
      estadosVistos,
    })

    await avisarAperturas(abiertas)

    const resumen = `libres ${libresAhora.length}, abiertas ${abiertas.length}, cerradas ${cerradas.length}`
    if (enMarca || abiertas.length > 0 || cerradas.length > 0) {
      await registrarCronRun('ep-agenda', true, Date.now() - t0, resumen)
    }
    return json({ ok: true, libres: libresAhora.length, abiertas: abiertas.length, cerradas: cerradas.length })
  } catch (e) {
    console.error('[cron/ep-agenda]', e)
    await registrarCronRun('ep-agenda', false, Date.now() - t0, e instanceof Error ? e.message : e)
    return json({ ok: false })
  }
}
