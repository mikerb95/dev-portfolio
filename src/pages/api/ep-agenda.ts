import type { APIRoute } from 'astro'
import { leerAgendaPublica } from '../../lib/ep-agenda-db'

// Datos de la bitácora de la agenda para /ep. La página es prerenderizada, así
// que la tabla se pide desde el navegador. Un minuto de CDN basta para que
// cualquier ráfaga de visitas cueste una lectura a Turso por minuto, y no
// esconde una cita recién abierta más de lo que ya tarda el aviso.

export const GET: APIRoute = async () => {
  try {
    const datos = await leerAgendaPublica(Date.now())
    return new Response(JSON.stringify(datos), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
      },
    })
  } catch (e) {
    // Fail-open: la sección de /ep muestra "sin datos" y el resto de la página sigue.
    console.error('[api/ep-agenda]', e)
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}
