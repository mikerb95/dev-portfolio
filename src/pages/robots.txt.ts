import type { APIRoute } from 'astro'
import { robotsTxt } from '../lib/aeo/robots'
import { SITE_ORIGIN } from '../lib/site'

// Se genera en el build: el contenido no depende del request, y robots.txt lo
// piden todos los crawlers, así que como archivo estático no gasta cómputo.
// El porqué de generarlo en vez de escribirlo está en src/lib/aeo/robots.ts.
export const prerender = true

export const GET: APIRoute = () =>
  new Response(robotsTxt(SITE_ORIGIN), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
