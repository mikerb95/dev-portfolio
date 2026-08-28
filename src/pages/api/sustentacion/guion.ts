import type { APIRoute } from 'astro'
import { BEATS, BEAT_PRIMERO, BEAT_ULTIMO, DURACION_TOTAL_S } from '../../../lib/sustentacion/guion'

/**
 * El guion completo: notas de narración, título y duración estimada de cada
 * beat. Lo pide el control remoto UNA sola vez al cargar y lo guarda en
 * memoria. Nunca por beat.
 *
 * Esa regla es la razón de que este endpoint exista separado de `/estado`: son
 * ~9 KB que no cambian durante la charla, y arrastrarlos en cada ciclo de
 * polling de 250 ms sería gastar el ancho de banda del 5G justo en lo único que
 * tiene que ser instantáneo. `/estado` manda escalares; el guion viaja una vez.
 *
 * Es estático de verdad (sale de `docs/guion-sustentacion.json`, compilado
 * dentro del bundle), así que se puede cachear de forma agresiva: si el
 * teléfono se recarga a mitad de la sustentación, el guion vuelve del caché del
 * navegador sin una petición de red.
 */
export const GET: APIRoute = async () => {
  const cuerpo = {
    primerBeat: BEAT_PRIMERO,
    ultimoBeat: BEAT_ULTIMO,
    duracionTotalS: DURACION_TOTAL_S,
    beats: BEATS.map((b) => ({
      beat: b.beat,
      contenido: b.contenido,
      duracion_estimada_s: b.duracion_estimada_s,
      notas_narracion: b.notas_narracion,
      // El título corto y el dato del beat, los mismos que `/estado` devuelve
      // para el beat ACTUAL. Van aquí además de allí porque el control remoto
      // los necesita para los DOCE: el selector de beats los pinta todos, y
      // pedirlos beat a beat sería justo el gasto de red que este endpoint
      // existe para evitar. Salen del mismo `vista_celular` del guion, así que
      // no hay dos fuentes de verdad que puedan separarse.
      titulo: b.vista_celular.titulo,
      dato: b.vista_celular.dato,
    })),
  }

  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Cinco minutos en el navegador y un día en la CDN con revalidación: el
      // guion no cambia mientras hablo, y una recarga del control remoto en
      // mitad de la charla no debería depender de la red.
      'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
