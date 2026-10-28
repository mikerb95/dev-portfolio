import type { APIRoute } from 'astro'
import { cronSecretOk } from '../../../lib/cron-auth'
import { registrarCronRun } from '../../../lib/cron-runs'
import { citasLibres, compararLibres, enBogota, tocaConsultar, CONFIG_POR_DEFECTO, type EstadoAgenda } from '../../../lib/ep-agenda'
import { avisarAperturas, consultarBookings, guardarEstado, leerEstado, refrescarConfig, registrarCambios } from '../../../lib/ep-agenda-db'

// Vigía de la agenda del instructor de etapa productiva (ver lib/ep-agenda.ts).
// cron-job.org lo llama CADA MINUTO, y el endpoint decide si ese minuto toca
// consultar a Bookings: así la regla de franjas vive en código probado y no
// repartida en la configuración del scheduler.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const GET: APIRoute = async ({ request }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) return json({ error: 'no autorizado' }, 401)

  const t0 = Date.now()
  const ahora = t0
  const enMarca = enBogota(ahora).minuto % 10 === 0

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

  const config = previo?.config ?? CONFIG_POR_DEFECTO
  if (!tocaConsultar(ahora, config)) {
    return new Response(null, { status: 204 })
  }

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
