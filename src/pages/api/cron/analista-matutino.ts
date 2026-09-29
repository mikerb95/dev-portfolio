import type { APIRoute } from 'astro'
import { avisoMatutino } from '../../../lib/analista/aviso'
import { SinApiKey } from '../../../lib/analista/credencial'
import { AnalistaOcupado, correrAnalisis, prepararAnalisis, SinPresupuesto } from '../../../lib/analista/motor-api'
import { cronSecretOk } from '../../../lib/cron-auth'
import { conRegistro } from '../../../lib/cron-runs'
import { sendPush } from '../../../lib/notify'
import { siteUrl } from '../../../lib/site'

// Análisis automático de cada mañana: el analista del micro-SIEM revisa las
// últimas 24 horas y manda el veredicto al celular. Si propone un bloqueo, el
// análisis queda pausado en la base y el aviso es para entrar a decidirlo:
// nada se bloquea sin aprobación, tampoco de madrugada.
//
// Lo dispara Vercel (vercel.json) y no cron-job.org: un análisis tarda entre
// 30 y 60 s, y cron-job.org corta la petición a los 30, con riesgo de que la
// función muera a mitad. El cron de Vercel espera a que termine.
//
// Gasta del mismo tope diario que el panel (unos US$0.10 a 0.30 por mañana).
// Sin API key, con otro análisis en curso o sin presupuesto, no hace nada y lo
// deja dicho en la bitácora: no es una avería.

const PREGUNTA =
  'Revisa las últimas 24 horas. Dime en una frase si hay algo que merezca mi atención hoy y, si hay un origen persistente o peligroso que convenga bloquear, propón el bloqueo.'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

export const GET: APIRoute = conRegistro('analista-matutino', async ({ request }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }

  let ejecucion
  try {
    ejecucion = await prepararAnalisis(PREGUNTA)
  } catch (err) {
    if (err instanceof SinApiKey) return json({ ok: true, omitido: 'sin API key' })
    if (err instanceof AnalistaOcupado) return json({ ok: true, omitido: 'otro análisis en curso' })
    if (err instanceof SinPresupuesto) return json({ ok: true, omitido: 'tope diario alcanzado' })
    // No se pudo leer el gasto o crear la ejecución: sin gastar, y que la
    // bitácora lo marque como fallo para que el detector de silencio lo vea.
    console.error('[cron/analista-matutino]', err)
    return new Response(JSON.stringify({ ok: false }), { status: 500 })
  }

  const e = await correrAnalisis(ejecucion, () => {})
  const aviso = avisoMatutino(e)
  await sendPush(aviso.titulo, aviso.cuerpo, {
    priority: aviso.prioridad,
    tags: e.estado === 'esperando_aprobacion' ? 'shield' : 'mag',
    click: `${siteUrl()}/admin/analista`,
  }).catch(() => {})

  return json({ ok: e.estado !== 'fallida', estado: e.estado, iteraciones: e.iteraciones, costoUsd: Number(e.costoUsd.toFixed(4)) })
})
