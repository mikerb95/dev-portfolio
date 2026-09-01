import type { APIRoute } from 'astro'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { senaEpRecordatorios } from '../../../db/schema'
import { computeHitos, hitosPorAvisar } from '../../../lib/sena-ep'
import { sendEmail } from '../../../lib/notify'
import { cronSecretOk } from '../../../lib/cron-auth'
import { conRegistro } from '../../../lib/cron-runs'

// Recordatorio diario de la calculadora de etapa productiva SENA (/ep).
// Personal: hay como mucho una suscripción activa, y el email siempre va al
// `ALERT_EMAIL_TO` ya configurado en notify.ts, nunca a un correo enviado por
// el request. Fail-open como el resto de los crons de observabilidad.

const fmt = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const claveHito = (titulo: string, fecha: Date) => `${titulo}|${fecha.toISOString().slice(0, 10)}`

export const GET: APIRoute = conRegistro('sena-recordatorio', async ({ request }) => {
  if (!cronSecretOk(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }

  try {
    const subs = await db.select().from(senaEpRecordatorios).where(eq(senaEpRecordatorios.active, true))
    let avisados = 0

    for (const sub of subs) {
      const hitos = computeHitos(sub.tipo, sub.inicio)
      const proximos = hitosPorAvisar(hitos, new Date(), sub.diasAntes)
      const yaAvisados = new Set<string>(JSON.parse(sub.notifiedKeys || '[]'))

      const nuevos = proximos.filter((h) => !yaAvisados.has(claveHito(h.titulo, h.fecha)))
      if (nuevos.length === 0) continue

      const lineas = nuevos.map((h) => `- ${h.titulo}: ${fmt(h.fecha)}`).join('\n')
      const res = await sendEmail(
        `Etapa productiva SENA: ${nuevos.length} hito${nuevos.length === 1 ? '' : 's'} próximo${nuevos.length === 1 ? '' : 's'}`,
        `Se acercan estos hitos de tu etapa productiva:\n\n${lineas}\n\nDetalle: https://codebymike.tech/ep?tipo=${sub.tipo}&inicio=${sub.inicio}`
      )
      if (res.ok) {
        avisados += nuevos.length
        for (const h of nuevos) yaAvisados.add(claveHito(h.titulo, h.fecha))
        await db
          .update(senaEpRecordatorios)
          .set({ notifiedKeys: JSON.stringify([...yaAvisados]) })
          .where(eq(senaEpRecordatorios.id, sub.id))
      }
    }

    return new Response(JSON.stringify({ ok: true, suscripciones: subs.length, avisados }), { status: 200 })
  } catch (err) {
    // Fail-open: un fallo aquí no debe tumbar nada más, pero sí queda en logs.
    console.error('[cron/sena-recordatorio]', err)
    return new Response(JSON.stringify({ ok: false }), { status: 200 })
  }
})