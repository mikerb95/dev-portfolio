import type { APIRoute } from 'astro'
import { getDictionary } from '../i18n'
import { llmsTxt } from '../lib/aeo/llms'
import { notasParaLlms } from '../lib/aeo/notas'
import { SITE_ORIGIN } from '../lib/site'

// SSR a propósito, no prerender: así el middleware ve qué agentes de IA lo
// leen (src/lib/aeo/conteo.ts). Lo piden pocos y casi solo bots de IA, de modo
// que el cómputo es despreciable, y la caché pública de 5 min del middleware
// lo sigue sirviendo desde el borde la mayoría de las veces.
export const prerender = false

export const GET: APIRoute = async () => {
  const cuerpo = llmsTxt({
    origen: SITE_ORIGIN,
    es: getDictionary('es'),
    en: getDictionary('en'),
    notas: await notasParaLlms(),
  })
  return new Response(cuerpo, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
