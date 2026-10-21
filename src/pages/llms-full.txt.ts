import type { APIRoute } from 'astro'
import { getDictionary } from '../i18n'
import { llmsFullTxt } from '../lib/aeo/llms'
import { notasParaLlms } from '../lib/aeo/notas'
import { SITE_ORIGIN } from '../lib/site'

// SSR por el mismo motivo que llms.txt: contar qué agentes lo leen.
export const prerender = false

export const GET: APIRoute = async () => {
  const cuerpo = llmsFullTxt({ origen: SITE_ORIGIN, es: getDictionary('es'), notas: await notasParaLlms() })
  return new Response(cuerpo, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
