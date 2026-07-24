import type { APIRoute } from 'astro'
import { runPortalHealth, healthVerdict } from '../../../lib/portal/health'

// Health check público del portal de clientes: lo consume el motor de uptime
// propio (tabla `monitors`) para que el portal aparezca en /status como
// cualquier otro servicio vigilado.
//
// Público a conciencia, y por eso listado en `isPortalPublicPath`: un monitor
// no tiene sesión ni debería tenerla. La respuesta no lleva datos de ningún
// cliente (ver lib/portal/health.ts), así que exponerla no cuesta nada.
//
// `no-store` obligatorio: un health check cacheado por la CDN informaría del
// pasado. El middleware pone `s-maxage` en rutas públicas, así que hay que
// pisarlo explícitamente aquí.
export const GET: APIRoute = async () => {
  const health = await runPortalHealth()
  const { status } = healthVerdict(health.checks)

  return new Response(JSON.stringify(health), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
